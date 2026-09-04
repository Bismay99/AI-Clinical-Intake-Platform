"""
backend/services/verification.py

THE ONLY PLACE in the entire codebase that transitions verification_status
from UNREVIEWED to ACCEPTED / EDITED / REJECTED.

PRD Section 14 invariant:
  - brain.py emits UNREVIEWED entities. Period.
  - Only an authenticated, authorized doctor's explicit API action drives
    a transition. This module is the gate.

State machine:
    UNREVIEWED ──accept──► ACCEPTED
    UNREVIEWED ──edit───►  EDITED     (requires new_value)
    UNREVIEWED ──reject──► REJECTED
    ACCEPTED / EDITED / REJECTED ──[re-action]──► any other state
      (doctors can correct their own decisions)

Every transition is recorded in AuditLog.
"""

from datetime import datetime
from typing import Literal, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models.user import User
from backend.models.extracted_entity import ExtractedEntity, VerificationStatus
from backend.models.audit_log import AuditLog


# Map action string to VerificationStatus enum value
_ACTION_TO_STATUS = {
    "accept": VerificationStatus.accepted,
    "edit":   VerificationStatus.edited,
    "reject": VerificationStatus.rejected,
}


def verify_entity(
    *,
    entity: ExtractedEntity,
    action: Literal["accept", "edit", "reject"],
    new_value: Optional[str],
    doctor: User,
    db: Session,
) -> AuditLog:
    """
    Applies a doctor's verification decision to one ExtractedEntity.

    Returns the AuditLog entry that was created (caller must flush/commit).
    Raises HTTPException on invalid input.

    Invariants upheld:
      - original_ai_value is never overwritten.
      - reviewed_by and reviewed_at are always set on transition.
      - Audit trail is always created.
    """
    if action not in _ACTION_TO_STATUS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action '{action}'. Must be 'accept', 'edit', or 'reject'.",
        )

    if action == "edit":
        if not new_value or not new_value.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="new_value is required and must be non-empty when action='edit'.",
            )
        # Preserve the original AI value before overwriting
        if entity.original_ai_value is None:
            entity.original_ai_value = entity.value
        entity.value = new_value.strip()

    entity.verification_status = _ACTION_TO_STATUS[action]
    entity.reviewed_by = doctor.id
    entity.reviewed_at = datetime.utcnow()

    # Append-only audit entry
    audit = AuditLog(
        user_id=doctor.id,
        action=f"entity.{action}",
        target_entity_type="extracted_entity",
        target_entity_id=entity.id,
        detail=(
            f"field={entity.field_name} "
            f"status={entity.verification_status} "
            f"value='{entity.value}'"
        ),
    )
    db.add(audit)
    return audit


def finalize_encounter(
    *,
    encounter,
    doctor: User,
    db: Session,
) -> AuditLog:
    """
    Marks an encounter as 'completed' — the final irreversible step.
    Records an audit log entry. Caller must flush/commit.
    """
    from backend.models.encounter import EncounterStatus
    encounter.queue_status = EncounterStatus.completed

    audit = AuditLog(
        user_id=doctor.id,
        action="encounter.finalize",
        target_entity_type="encounter",
        target_entity_id=encounter.id,
        detail=f"Encounter finalized by doctor={doctor.email}",
    )
    db.add(audit)
    return audit
