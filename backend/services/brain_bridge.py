"""
backend/services/brain_bridge.py

Converts between backend ORM/Pydantic types and ai_orchestration contract types.

Why this exists:
  brain.py works entirely with its own dataclasses (contracts.py). The Core Backend
  works with SQLAlchemy ORM models. This module is the ONLY place where the
  translation happens, keeping both sides clean and decoupled.

Rules enforced here:
  - Every entity coming OUT of brain.py is UNREVIEWED — we assert this before
    persisting (belt-and-suspenders on top of safety.py).
  - We never pass doctor-verified entities back into brain.py for re-processing
    (they are final DB records, not AI drafts).
"""

from datetime import datetime
from typing import List, Optional

from ai_orchestration.contracts import (
    ExtractedEntity as ContractEntity,
    SourceRef as ContractSourceRef,
    SourceType as ContractSourceType,
    VerificationStatus as ContractVerificationStatus,
    IntakeTurn as ContractIntakeTurn,
    TimelineEvent as ContractTimelineEvent,
)

from backend.models.extracted_entity import (
    ExtractedEntity as DBEntity,
    SourceType as DBSourceType,
    VerificationStatus as DBVerificationStatus,
)
from backend.models.timeline_event import TimelineEvent as DBTimelineEvent


# ---------------------------------------------------------------------------
# brain.py contract → DB model (after brain returns draft entities)
# ---------------------------------------------------------------------------
def contract_entity_to_db(
    contract: ContractEntity,
    encounter_id: str,
    document_id: Optional[str] = None,
) -> DBEntity:
    """
    Converts a brain.py ExtractedEntity (always UNREVIEWED by invariant) to
    a DB row ready to persist.

    Raises AssertionError if brain.py ever violates the UNREVIEWED invariant —
    this should never happen if safety.py is working, but we guard anyway.
    """
    assert contract.verification_status == ContractVerificationStatus.UNREVIEWED, (
        f"brain.py returned entity '{contract.field_name}' with "
        f"verification_status={contract.verification_status}. "
        "This violates the PRD §15 safety invariant."
    )

    return DBEntity(
        encounter_id=encounter_id,
        source_type=DBSourceType(contract.source.source_type.value),
        source_id=contract.source.source_id,
        source_location=contract.source.location,
        document_id=document_id,
        field_name=contract.field_name,
        value=contract.value,
        original_ai_value=contract.value,   # preserve original for audit when doctor edits
        confidence=contract.confidence,
        low_confidence_flag=contract.low_confidence_flag,
        verification_status=DBVerificationStatus.unreviewed,
        metadata_json=contract.metadata if contract.metadata else None,
    )


# ---------------------------------------------------------------------------
# DB model → brain.py contract (for timeline/summary re-processing)
# ---------------------------------------------------------------------------
def db_entity_to_contract(db: DBEntity) -> ContractEntity:
    """
    Converts a persisted DB entity back to a brain.py contract for
    timeline and summary generation calls.
    Only UNREVIEWED entities are passed back to brain.py.
    """
    return ContractEntity(
        field_name=db.field_name,
        value=db.value,
        confidence=db.confidence,
        source=ContractSourceRef(
            source_type=ContractSourceType(db.source_type.value),
            source_id=db.source_id,
            location=db.source_location,
        ),
        low_confidence_flag=db.low_confidence_flag,
        verification_status=ContractVerificationStatus.UNREVIEWED,
    )


# ---------------------------------------------------------------------------
# Build IntakeTurn history from answered field names (for question engine)
# ---------------------------------------------------------------------------
def build_history_from_answered_fields(
    answered_fields: List[str], language: str
) -> List[ContractIntakeTurn]:
    """
    Reconstructs the minimal IntakeTurn history needed by question_engine.
    The question engine only uses turn.field_name (via _answered_fields()),
    so we don't need to store full patient responses in the history.
    """
    return [
        ContractIntakeTurn(
            question="",                # not used by question_engine
            patient_response_text="",  # not used by question_engine
            language=language,
            field_name=field_name,
        )
        for field_name in answered_fields
    ]


# ---------------------------------------------------------------------------
# brain.py TimelineEvent contract → DB model
# ---------------------------------------------------------------------------
def contract_timeline_to_db(
    contract: ContractTimelineEvent,
    patient_id: str,
    encounter_id: str,
    source_entity_id: Optional[str] = None,
) -> DBTimelineEvent:
    return DBTimelineEvent(
        patient_id=patient_id,
        encounter_id=encounter_id,
        source_entity_id=source_entity_id,
        event_type=contract.event_type,
        date=contract.date,
        date_confidence=contract.date_confidence,
        date_uncertain=contract.date_uncertain,
    )
