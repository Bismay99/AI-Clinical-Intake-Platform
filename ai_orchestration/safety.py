"""
safety.py

Hard enforcement of PRD Section 15 (AI Safety Rules) and Architecture Section 1
(Architectural Principles). This module is deliberately boring and rigid — it
exists to make unsafe shortcuts structurally impossible, not just discouraged.

Rules enforced here:
  1. No ExtractedEntity may be treated as final without a SourceRef.
  2. No ExtractedEntity may skip confidence scoring.
  3. A SummaryResponse may only be built from entities that have already been
     through provenance + confidence stages.
  4. Nothing in this service ever sets verification_status to ACCEPTED/EDITED —
     that transition belongs exclusively to the Core Backend's verification.py,
     driven by an actual doctor action.
"""

from typing import List
from .contracts import ExtractedEntity, VerificationStatus


class SafetyViolation(Exception):
    """Raised when a pipeline stage tries to bypass a required safety check."""


def assert_has_provenance(entity: ExtractedEntity) -> None:
    if entity.source is None or not entity.source.source_id:
        raise SafetyViolation(
            f"Entity '{entity.field_name}' has no source_ref. "
            "The LLM/OCR/ASR output is never treated as a clinical fact on its own."
        )


def assert_has_confidence(entity: ExtractedEntity) -> None:
    if entity.confidence is None or not (0.0 <= entity.confidence <= 1.0):
        raise SafetyViolation(
            f"Entity '{entity.field_name}' is missing a valid confidence score."
        )


def assert_not_finalized_by_ai(entity: ExtractedEntity) -> None:
    if entity.verification_status != VerificationStatus.UNREVIEWED:
        raise SafetyViolation(
            f"Entity '{entity.field_name}' arrived with verification_status="
            f"{entity.verification_status}. The AI Orchestration Service must "
            "only ever emit UNREVIEWED drafts."
        )


def validate_draft_entity(entity: ExtractedEntity) -> ExtractedEntity:
    """
    Run every entity through this before it leaves the AI Orchestration Service.
    Raising here is intentional — a silent pass-through defeats the point.
    """
    assert_has_provenance(entity)
    assert_has_confidence(entity)
    assert_not_finalized_by_ai(entity)
    return entity


def validate_draft_batch(entities: List[ExtractedEntity]) -> List[ExtractedEntity]:
    return [validate_draft_entity(e) for e in entities]


def assert_summary_inputs_are_safe(entities: List[ExtractedEntity]) -> None:
    """
    Per PRD Section 15: a clinical summary must be composed only of
    evidence-linked, confidence-scored entities — never free-standing AI prose.
    """
    for entity in entities:
        assert_has_provenance(entity)
        assert_has_confidence(entity)
