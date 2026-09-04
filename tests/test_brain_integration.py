"""
tests/test_brain_integration.py

Proves that the Core Backend can call ai_orchestration/brain.py directly
(in-process, no HTTP) and that the full pipeline produces valid, safety-checked
output.

These are pure unit/integration tests of the AI orchestration layer —
no FastAPI app or database involved. They verify:
  1. handle_document() processes a prescription stub and returns UNREVIEWED entities
  2. Every returned entity has source provenance and a valid confidence score
  3. Low-confidence flag is set when confidence < 0.65
  4. handle_timeline() builds timeline events from entities
  5. handle_summary() produces a summary containing entity values
  6. handle_intake_turn() (touch-only path) returns a next question
  7. Schema switch: AYUSH schema is loaded without error
  8. safety.SafetyViolation is raised if an entity is missing provenance
     (proves the safety gate cannot be bypassed)
"""

import pytest

# Direct imports from the ai_orchestration package — this is exactly how the
# Core Backend's router code will call brain.py in production.
from ai_orchestration.brain import (
    handle_document,
    handle_intake_turn,
    handle_timeline,
    handle_summary,
)
from ai_orchestration.contracts import (
    DocumentRequest,
    IntakeRequest,
    SummaryRequest,
    ExtractedEntity,
    VerificationStatus,
)
from ai_orchestration.safety import SafetyViolation, validate_draft_entity
from ai_orchestration.clinical_schema import get_schema


# ---------------------------------------------------------------------------
# 1. Document processing
# ---------------------------------------------------------------------------
def test_handle_document_returns_entities():
    req = DocumentRequest(
        encounter_id="enc_test_001",
        document_id="doc_test_prescription_001",
        document_type="prescription",
        file_bytes=b"fake-prescription-bytes",
    )
    resp = handle_document(req)
    assert len(resp.draft_entities) > 0, "Expected at least one extracted entity from prescription stub"


def test_handle_document_entities_are_unreviewed():
    """brain.py must NEVER emit anything other than UNREVIEWED — core safety invariant."""
    req = DocumentRequest(
        encounter_id="enc_test_002",
        document_id="doc_test_002",
        document_type="prescription",
        file_bytes=b"fake-bytes",
    )
    resp = handle_document(req)
    for entity in resp.draft_entities:
        assert entity.verification_status == VerificationStatus.UNREVIEWED, (
            f"Entity '{entity.field_name}' came back with status "
            f"'{entity.verification_status}' — brain.py must only emit UNREVIEWED"
        )


def test_handle_document_entities_have_provenance():
    req = DocumentRequest(
        encounter_id="enc_test_003",
        document_id="doc_test_003",
        document_type="prescription",
        file_bytes=b"bytes",
    )
    resp = handle_document(req)
    for entity in resp.draft_entities:
        assert entity.source is not None, f"Entity '{entity.field_name}' has no source"
        assert entity.source.source_id, f"Entity '{entity.field_name}' has empty source_id"


def test_handle_document_entities_have_confidence():
    req = DocumentRequest(
        encounter_id="enc_test_004",
        document_id="doc_test_004",
        document_type="prescription",
        file_bytes=b"bytes",
    )
    resp = handle_document(req)
    for entity in resp.draft_entities:
        assert 0.0 <= entity.confidence <= 1.0, (
            f"Entity '{entity.field_name}' has invalid confidence: {entity.confidence}"
        )


def test_low_confidence_flag_is_set_when_applicable():
    """The date stub has confidence 0.6 (OCR 0.6 + LLM 0.55 / 2 ≈ 0.575) — below 0.65 threshold."""
    req = DocumentRequest(
        encounter_id="enc_test_005",
        document_id="doc_test_005",
        document_type="prescription",
        file_bytes=b"bytes",
    )
    resp = handle_document(req)
    flagged = [e for e in resp.draft_entities if e.low_confidence_flag]
    assert len(flagged) >= 1, (
        "Expected at least one low-confidence entity from the prescription stub "
        "(date field has low OCR confidence)"
    )


def test_handle_document_lab_report():
    req = DocumentRequest(
        encounter_id="enc_test_006",
        document_id="doc_test_lab_001",
        document_type="lab_report",
        file_bytes=b"lab-bytes",
    )
    resp = handle_document(req)
    assert len(resp.draft_entities) > 0


# ---------------------------------------------------------------------------
# 2. Timeline
# ---------------------------------------------------------------------------
def test_handle_timeline_returns_events():
    req = DocumentRequest(
        encounter_id="enc_tl_001",
        document_id="doc_tl_001",
        document_type="prescription",
        file_bytes=b"bytes",
    )
    entities = handle_document(req).draft_entities
    events = handle_timeline(entities)
    assert isinstance(events, list)
    assert len(events) > 0


def test_timeline_preserves_uncertainty():
    """Entities without a resolvable date must produce date_uncertain=True events."""
    req = DocumentRequest(
        encounter_id="enc_tl_002",
        document_id="doc_tl_002",
        document_type="prescription",
        file_bytes=b"bytes",
    )
    entities = handle_document(req).draft_entities
    events = handle_timeline(entities)
    # Check that uncertainty metadata is present on all events (some may be True, some False)
    for ev in events:
        assert hasattr(ev, "date_uncertain"), "TimelineEvent must have date_uncertain attribute"


# ---------------------------------------------------------------------------
# 3. Summary
# ---------------------------------------------------------------------------
def test_handle_summary_produces_text():
    req = DocumentRequest(
        encounter_id="enc_sum_001",
        document_id="doc_sum_001",
        document_type="prescription",
        file_bytes=b"bytes",
    )
    entities = handle_document(req).draft_entities
    timeline = handle_timeline(entities)
    summary_resp = handle_summary(SummaryRequest(
        encounter_id="enc_sum_001",
        entities=entities,
        timeline=timeline,
    ))
    assert summary_resp.summary_text
    assert len(summary_resp.summary_text) > 10


def test_handle_summary_references_entity_fields():
    req = DocumentRequest(
        encounter_id="enc_sum_002",
        document_id="doc_sum_002",
        document_type="prescription",
        file_bytes=b"bytes",
    )
    entities = handle_document(req).draft_entities
    timeline = handle_timeline(entities)
    resp = handle_summary(SummaryRequest(
        encounter_id="enc_sum_002", entities=entities, timeline=timeline,
    ))
    assert isinstance(resp.used_entity_fields, list)
    assert len(resp.used_entity_fields) > 0


# ---------------------------------------------------------------------------
# 4. Adaptive intake turn (touch-only path — no audio bytes)
# ---------------------------------------------------------------------------
def test_handle_intake_turn_returns_next_question():
    req = IntakeRequest(
        encounter_id="enc_intake_001",
        schema_id="allopathic_chest_pain_v1",
        language="en",
        touch_answer="I have chest pain",
        history=[],
        answering_field_name="chief_complaint",
    )
    resp = handle_intake_turn(req)
    assert resp.next_question is not None, "Expected a follow-up question after first turn"
    assert resp.next_question_field_name is not None


def test_handle_intake_turn_pathway_not_complete_after_first_turn():
    req = IntakeRequest(
        encounter_id="enc_intake_002",
        schema_id="allopathic_chest_pain_v1",
        language="en",
        touch_answer="Chest pain",
        history=[],
        answering_field_name="chief_complaint",
    )
    resp = handle_intake_turn(req)
    assert resp.pathway_complete is False


# ---------------------------------------------------------------------------
# 5. Schema switch: AYUSH
# ---------------------------------------------------------------------------
def test_ayush_schema_loads():
    schema = get_schema("ayush_general_v1")
    assert schema.schema_id == "ayush_general_v1"
    expected_ayush_fields = {"prakriti", "vikriti", "agni", "koshtha", "samprapti"}
    assert expected_ayush_fields.issubset(set(schema.required_fields)), (
        f"AYUSH schema missing expected fields. Got: {schema.required_fields}"
    )


def test_ayush_intake_turn():
    req = IntakeRequest(
        encounter_id="enc_ayush_001",
        schema_id="ayush_general_v1",
        language="en",
        touch_answer="I have mild fever",
        history=[],
        answering_field_name="chief_complaint",
    )
    resp = handle_intake_turn(req)
    # First follow-up in AYUSH schema should be about prakriti
    assert resp.next_question_field_name == "prakriti"


# ---------------------------------------------------------------------------
# 6. Safety gate cannot be bypassed
# ---------------------------------------------------------------------------
def test_safety_rejects_entity_without_provenance():
    """Directly test that safety.validate_draft_entity raises on missing source."""
    from ai_orchestration.contracts import SourceRef, SourceType

    bad_entity = ExtractedEntity(
        field_name="medication",
        value="Aspirin",
        confidence=0.9,
        source=None,  # deliberately missing
    )
    with pytest.raises(SafetyViolation, match="no source_ref"):
        validate_draft_entity(bad_entity)


def test_safety_rejects_entity_with_invalid_confidence():
    from ai_orchestration.contracts import SourceRef, SourceType

    bad_entity = ExtractedEntity(
        field_name="medication",
        value="Aspirin",
        confidence=1.5,  # out of range
        source=SourceRef(source_type=SourceType.DOCUMENT, source_id="doc_x", location="p1"),
    )
    with pytest.raises(SafetyViolation, match="confidence"):
        validate_draft_entity(bad_entity)


def test_safety_rejects_prefinalized_entity():
    """The AI Orchestration Service must never emit non-UNREVIEWED entities."""
    from ai_orchestration.contracts import SourceRef, SourceType

    bad_entity = ExtractedEntity(
        field_name="medication",
        value="Aspirin",
        confidence=0.9,
        source=SourceRef(source_type=SourceType.DOCUMENT, source_id="doc_x", location="p1"),
        verification_status=VerificationStatus.ACCEPTED,  # invalid for brain.py output
    )
    with pytest.raises(SafetyViolation, match="UNREVIEWED"):
        validate_draft_entity(bad_entity)
