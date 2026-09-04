"""
tests/test_extraction.py

Integration tests for ai_orchestration/extraction.py (Phase 4B).

These tests verify the complete OCR -> LLM -> provenance -> confidence -> safety
pipeline with mocked OCR and LLM providers (no real API calls).

The conftest autouse fixture handles all OCR and LLM mocking automatically.
"""

import pytest
from ai_orchestration.contracts import VerificationStatus, SourceType
from ai_orchestration.extraction import extract_from_document, extract_from_intake_turn, DOCUMENT_EXPECTED_FIELDS


class TestDocumentExpectedFields:
    """Verify DOCUMENT_EXPECTED_FIELDS covers required field sets."""

    def test_prescription_has_required_fields(self):
        fields = DOCUMENT_EXPECTED_FIELDS["prescription"]
        for required in ["medication", "date", "patient_name", "dose", "frequency", "duration"]:
            assert required in fields, f"prescription missing field: {required}"

    def test_lab_report_has_required_fields(self):
        fields = DOCUMENT_EXPECTED_FIELDS["lab_report"]
        for required in ["test_name", "result", "unit", "reference_range", "date", "test_result"]:
            assert required in fields, f"lab_report missing field: {required}"

    def test_discharge_summary_has_required_fields(self):
        fields = DOCUMENT_EXPECTED_FIELDS["discharge_summary"]
        for required in ["diagnosis", "medication", "date"]:
            assert required in fields, f"discharge_summary missing field: {required}"


class TestExtractFromDocument:
    """Tests for the main document pipeline using the autouse mocks."""

    def test_returns_list(self):
        entities = extract_from_document(
            document_id="doc-001",
            document_type="prescription",
            file_bytes=b"fake-prescription-bytes",
        )
        assert isinstance(entities, list)

    def test_entities_are_unreviewed(self):
        """Safety invariant: no entity may be pre-approved by the AI."""
        entities = extract_from_document(
            document_id="doc-002",
            document_type="prescription",
            file_bytes=b"fake-prescription-bytes",
        )
        for entity in entities:
            assert entity.verification_status == VerificationStatus.UNREVIEWED, (
                f"Entity {entity.field_name!r} must be UNREVIEWED but got "
                f"{entity.verification_status}"
            )

    def test_entities_have_document_provenance(self):
        """Every entity must trace back to the document (not intake session)."""
        entities = extract_from_document(
            document_id="doc-003",
            document_type="prescription",
            file_bytes=b"fake-prescription-bytes",
        )
        for entity in entities:
            assert entity.source.source_type == SourceType.DOCUMENT, (
                f"Entity {entity.field_name!r} has wrong source_type: {entity.source.source_type}"
            )
            assert entity.source.source_id == "doc-003"

    def test_entities_have_location_provenance(self):
        """Every entity must have a page/region location from the OCR block."""
        entities = extract_from_document(
            document_id="doc-004",
            document_type="prescription",
            file_bytes=b"fake-prescription-bytes",
        )
        for entity in entities:
            assert entity.source.location is not None, (
                f"Entity {entity.field_name!r} has no source location"
            )
            # Location must contain page info derived from OCR block
            assert "page:" in entity.source.location, (
                f"Location {entity.source.location!r} missing page info"
            )

    def test_entities_have_confidence_in_range(self):
        """All confidence scores must be in [0.0, 1.0]."""
        entities = extract_from_document(
            document_id="doc-005",
            document_type="prescription",
            file_bytes=b"fake-prescription-bytes",
        )
        for entity in entities:
            assert 0.0 <= entity.confidence <= 1.0, (
                f"Entity {entity.field_name!r} has out-of-range confidence: {entity.confidence}"
            )

    def test_low_confidence_flag_set_correctly(self):
        """Entities below the LOW_CONFIDENCE_THRESHOLD must have low_confidence_flag=True."""
        from ai_orchestration.confidence import LOW_CONFIDENCE_THRESHOLD
        entities = extract_from_document(
            document_id="doc-006",
            document_type="prescription",
            file_bytes=b"fake-prescription-bytes",
        )
        for entity in entities:
            expected_flag = entity.confidence < LOW_CONFIDENCE_THRESHOLD
            assert entity.low_confidence_flag == expected_flag, (
                f"Entity {entity.field_name!r} confidence={entity.confidence:.2f} "
                f"flag should be {expected_flag} but got {entity.low_confidence_flag}"
            )

    def test_lab_report_extraction(self):
        """Lab report should produce entities with source.source_id matching document_id."""
        entities = extract_from_document(
            document_id="lab-001",
            document_type="lab_report",
            file_bytes=b"lab_result_bytes",
        )
        assert isinstance(entities, list)
        for entity in entities:
            assert entity.source.source_id == "lab-001"
            assert entity.verification_status == VerificationStatus.UNREVIEWED

    def test_discharge_summary_extraction(self):
        """Discharge summary should produce UNREVIEWED entities."""
        entities = extract_from_document(
            document_id="discharge-001",
            document_type="discharge_summary",
            file_bytes=b"discharge_diagnosis_content",
        )
        assert isinstance(entities, list)
        for entity in entities:
            assert entity.verification_status == VerificationStatus.UNREVIEWED

    def test_unknown_document_type_returns_entities_or_empty(self):
        """Unknown document types should not raise; they return whatever the LLM provides."""
        entities = extract_from_document(
            document_id="doc-unknown",
            document_type="unknown_type",
            file_bytes=b"some content",
        )
        assert isinstance(entities, list)

    def test_medication_not_extracted_from_text_without_medication(self):
        """
        If OCR text does not contain medication information, medication MUST NOT be extracted.
        The LLM must not fabricate it.
        """
        # The mock LLM respects expected_fields and only extracts based on text content.
        # Feeding text that contains ONLY a date, no medication keyword.
        entities = extract_from_document(
            document_id="doc-no-med",
            document_type="prescription",
            file_bytes=b"Date: 02/09/2026",  # only date, no medication text
        )
        field_names = [e.field_name for e in entities]
        # medication must NOT be in the extracted entities since it's not in the text
        assert "medication" not in field_names, (
            "medication was hallucinated when OCR text contained no medication info"
        )


class TestExtractFromIntakeTurn:
    """Tests for intake turn extraction pipeline."""

    def test_intake_returns_list(self):
        entities = extract_from_intake_turn(
            intake_session_id="session-001",
            turn_index=0,
            patient_text="I have chest pain for 3 days",
            expected_fields=["chief_complaint", "onset"],
        )
        assert isinstance(entities, list)

    def test_intake_entities_are_unreviewed(self):
        entities = extract_from_intake_turn(
            intake_session_id="session-002",
            turn_index=1,
            patient_text="I have chest pain for 3 days",
            expected_fields=["chief_complaint", "onset"],
        )
        for entity in entities:
            assert entity.verification_status == VerificationStatus.UNREVIEWED

    def test_intake_entities_have_intake_session_provenance(self):
        entities = extract_from_intake_turn(
            intake_session_id="session-003",
            turn_index=0,
            patient_text="I have chest pain for 3 days",
            expected_fields=["chief_complaint", "onset"],
        )
        for entity in entities:
            assert entity.source.source_type == SourceType.INTAKE_SESSION
            assert entity.source.source_id == "session-003"

    def test_intake_empty_patient_text_returns_empty(self):
        entities = extract_from_intake_turn(
            intake_session_id="session-004",
            turn_index=0,
            patient_text="",
            expected_fields=["chief_complaint"],
        )
        assert entities == []

    def test_intake_empty_expected_fields_returns_empty(self):
        entities = extract_from_intake_turn(
            intake_session_id="session-005",
            turn_index=0,
            patient_text="I have chest pain for 3 days",
            expected_fields=[],
        )
        assert entities == []
