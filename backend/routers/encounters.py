"""
backend/routers/encounters.py

Encounter management.

POST /encounters         — patient creates their own encounter (MVP self-service;
                           in production, hospital registration system creates these)
GET  /encounters/mine    — patient lists their own encounters

The ownership invariant is enforced: patients can only see/create encounters
linked to their own patient record.
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.user import User, UserRole
from backend.models.encounter import Encounter, EncounterStatus
from backend.auth.dependencies import get_current_user
from backend.services.ownership import get_patient_for_user
from backend.schemas.encounter import EncounterCreate, EncounterResponse

router = APIRouter(prefix="/encounters", tags=["encounters"])


def _require_patient_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.patient:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Patients only.")
    return current_user


@router.post("", response_model=EncounterResponse, status_code=status.HTTP_201_CREATED)
def create_encounter(
    payload: EncounterCreate,
    current_user: User = Depends(_require_patient_user),
    db: Session = Depends(get_db),
):
    """
    Creates a new encounter for the authenticated patient.
    MVP: patients self-create. In production, hospital registration does this.
    """
    patient = get_patient_for_user(current_user, db)

    scheduled_at = None
    if payload.scheduled_at:
        try:
            scheduled_at = datetime.fromisoformat(payload.scheduled_at)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="scheduled_at must be an ISO datetime string.",
            )

    encounter = Encounter(
        patient_id=patient.id,
        queue_status=EncounterStatus.registered,
        opd_department=payload.opd_department,
        scheduled_at=scheduled_at,
    )
    db.add(encounter)
    db.flush()
    db.refresh(encounter)
    return encounter


@router.get("/mine", response_model=list[EncounterResponse])
def list_my_encounters(
    current_user: User = Depends(_require_patient_user),
    db: Session = Depends(get_db),
):
    """Returns all encounters belonging to the authenticated patient."""
    patient = get_patient_for_user(current_user, db)
    encounters = (
        db.query(Encounter)
        .filter(Encounter.patient_id == patient.id)
        .order_by(Encounter.created_at.desc())
        .all()
    )
    return encounters
