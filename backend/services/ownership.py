"""
backend/services/ownership.py

Enforces the strict ownership chain required before any patient data is accessed:

    JWT user  →  patient record  →  encounter belongs to patient
                                         →  intake session belongs to encounter

Every intake endpoint calls these helpers before touching data. We deliberately
return 404 (not 403) for objects that don't belong to the caller — this avoids
leaking the existence of other patients' records.

Rules (from implementation plan Section 4 and user requirement):
  - Patient can only access their own Patient record (via user_id).
  - Patient can only access Encounters where encounter.patient_id == patient.id.
  - Patient can only access IntakeSessions where session.encounter_id == encounter.id.
  - Patient endpoints NEVER transition verification_status to ACCEPTED/EDITED/REJECTED.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models.user import User
from backend.models.patient import Patient
from backend.models.encounter import Encounter, EncounterStatus
from backend.models.intake_session import IntakeSession, IntakeSessionStatus


# ---------------------------------------------------------------------------
# Step 1 — Get the patient record for the authenticated user
# ---------------------------------------------------------------------------
def get_patient_for_user(user: User, db: Session) -> Patient:
    """
    Returns the Patient profile linked to this User.
    Raises 404 if the patient profile hasn't been created yet.
    """
    patient = db.query(Patient).filter(Patient.user_id == user.id).first()
    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found. Create one at POST /patients/profile first.",
        )
    return patient


# ---------------------------------------------------------------------------
# Step 2 — Verify the encounter belongs to this patient
# ---------------------------------------------------------------------------
def get_encounter_for_patient(
    encounter_id: str, patient: Patient, db: Session
) -> Encounter:
    """
    Returns the Encounter only if it belongs to this patient.
    Returns 404 for any mismatch — does NOT expose whether the encounter
    exists for a different patient (avoids enumeration attacks).
    """
    encounter = (
        db.query(Encounter)
        .filter(
            Encounter.id == encounter_id,
            Encounter.patient_id == patient.id,
        )
        .first()
    )
    if encounter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Encounter not found.",
        )
    return encounter


# ---------------------------------------------------------------------------
# Step 3 — Verify the intake session belongs to this encounter
# ---------------------------------------------------------------------------
def get_session_for_encounter(
    session_id: str, encounter: Encounter, db: Session
) -> IntakeSession:
    """
    Returns the IntakeSession only if it belongs to this encounter.
    """
    session = (
        db.query(IntakeSession)
        .filter(
            IntakeSession.id == session_id,
            IntakeSession.encounter_id == encounter.id,
        )
        .first()
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Intake session not found.",
        )
    return session


# ---------------------------------------------------------------------------
# Composite helpers — full chain in one call (used by most endpoints)
# ---------------------------------------------------------------------------
def resolve_patient_encounter(
    encounter_id: str, user: User, db: Session
) -> tuple[Patient, Encounter]:
    """
    Resolves and validates the full user → patient → encounter chain.
    Returns (patient, encounter).
    """
    patient = get_patient_for_user(user, db)
    encounter = get_encounter_for_patient(encounter_id, patient, db)
    return patient, encounter


def resolve_patient_encounter_session(
    encounter_id: str, session_id: str, user: User, db: Session
) -> tuple[Patient, Encounter, IntakeSession]:
    """
    Resolves and validates the full user → patient → encounter → session chain.
    Returns (patient, encounter, session).
    """
    patient, encounter = resolve_patient_encounter(encounter_id, user, db)
    session = get_session_for_encounter(session_id, encounter, db)
    return patient, encounter, session


# ---------------------------------------------------------------------------
# Guard helpers — validate state before mutating
# ---------------------------------------------------------------------------
def require_encounter_not_completed(encounter: Encounter) -> None:
    if encounter.queue_status == EncounterStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This encounter has already been completed and cannot be modified.",
        )


def require_session_in_progress(session: IntakeSession) -> None:
    if session.status != IntakeSessionStatus.in_progress:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Intake session is already '{session.status}' — cannot add more turns.",
        )
