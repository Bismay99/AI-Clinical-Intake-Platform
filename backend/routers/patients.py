"""
backend/routers/patients.py

Patient profile management.

POST /patients/profile   — create the patient profile for the logged-in patient user
GET  /patients/profile   — get the current patient's profile

In the two-panel system, every patient user must have a Patient record before
they can create encounters or intake sessions. This is the bootstrap step.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.user import User, UserRole
from backend.models.patient import Patient
from backend.auth.dependencies import get_current_user
from backend.schemas.patient import PatientProfileCreate, PatientProfileResponse

router = APIRouter(prefix="/patients", tags=["patients"])


def _require_patient_user(current_user: User = Depends(get_current_user)) -> User:
    """Ensures the authenticated user has the 'patient' role."""
    if current_user.role != UserRole.patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patient-role users can access patient profile endpoints.",
        )
    return current_user


@router.post("/profile", response_model=PatientProfileResponse, status_code=status.HTTP_201_CREATED)
def create_patient_profile(
    payload: PatientProfileCreate,
    current_user: User = Depends(_require_patient_user),
    db: Session = Depends(get_db),
):
    """
    Creates the patient profile record for the authenticated patient user.
    Each patient user can have exactly one profile (enforced by unique user_id FK).
    """
    existing = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Patient profile already exists. Use PUT /patients/profile to update.",
        )
    patient = Patient(
        user_id=current_user.id,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        gender=payload.gender,
        phone=payload.phone,
        preferred_language=payload.preferred_language,
        hospital_identifier=payload.hospital_identifier,
    )
    db.add(patient)
    db.flush()
    db.refresh(patient)
    return patient


@router.get("/profile", response_model=PatientProfileResponse)
def get_patient_profile(
    current_user: User = Depends(_require_patient_user),
    db: Session = Depends(get_db),
):
    """Returns the authenticated patient's profile."""
    patient = db.query(Patient).filter(Patient.user_id == current_user.id).first()
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient profile not found. Create one at POST /patients/profile first.",
        )
    return patient
