"""
backend/services/doctor_auth.py

Doctor-side authorization helpers — parallel to ownership.py for patients.

Security philosophy (same as Phase 2):
  - Mismatched resources return 404, NOT 403.
  - This prevents cross-doctor/cross-patient enumeration.
  - Doctors can only see encounters where encounter.doctor_user_id == doctor.id.

Ownership chain for doctors:
    JWT user (role=doctor)
        ↓
    encounter.doctor_user_id == user.id
        ↓
    document.encounter_id == encounter.id
        ↓
    entity.encounter_id == encounter.id
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models.user import User, UserRole
from backend.models.encounter import Encounter, EncounterStatus
from backend.models.document import Document
from backend.models.extracted_entity import ExtractedEntity


def require_doctor_user(current_user: User) -> User:
    """Raises 403 if the user is not a doctor (or admin)."""
    if current_user.role not in (UserRole.doctor, UserRole.admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only doctor-role accounts can access this endpoint.",
        )
    return current_user


def get_encounter_for_doctor(
    encounter_id: str, doctor: User, db: Session
) -> Encounter:
    """
    Returns the encounter only if it's assigned to this doctor.
    Returns 404 for missing or unassigned — avoids leaking existence.
    """
    encounter = (
        db.query(Encounter)
        .filter(
            Encounter.id == encounter_id,
            Encounter.doctor_user_id == doctor.id,
        )
        .first()
    )
    if encounter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Encounter not found or not assigned to you.",
        )
    return encounter


def get_document_for_doctor(
    doc_id: str, encounter: Encounter, db: Session
) -> Document:
    """
    Returns the Document only if it belongs to this encounter.
    """
    doc = (
        db.query(Document)
        .filter(
            Document.id == doc_id,
            Document.encounter_id == encounter.id,
        )
        .first()
    )
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found in this encounter.",
        )
    return doc


def get_entity_for_doctor(
    entity_id: str, doctor: User, db: Session
) -> tuple[ExtractedEntity, Encounter]:
    """
    Returns (entity, encounter) only if the entity's encounter is assigned to this doctor.
    Always 404 on any mismatch.
    """
    entity = db.query(ExtractedEntity).filter(ExtractedEntity.id == entity_id).first()
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found.")

    # Verify encounter ownership — returns 404 if not assigned
    encounter = get_encounter_for_doctor(entity.encounter_id, doctor, db)
    return entity, encounter


def require_ready_for_review(encounter: Encounter) -> None:
    """Raises 409 if the encounter isn't in ready_for_review state."""
    if encounter.queue_status != EncounterStatus.ready_for_review:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Encounter is in state '{encounter.queue_status}'. "
                "Can only act on encounters in 'ready_for_review' state."
            ),
        )


def require_not_completed(encounter: Encounter) -> None:
    """Raises 409 if encounter is already completed."""
    if encounter.queue_status == EncounterStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Encounter has already been finalized (status=completed).",
        )
