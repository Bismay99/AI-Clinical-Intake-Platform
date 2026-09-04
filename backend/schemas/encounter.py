"""
backend/schemas/encounter.py

Pydantic schemas for encounter endpoints.
"""

from pydantic import BaseModel
from typing import Optional
from backend.models.encounter import EncounterStatus


class EncounterCreate(BaseModel):
    """
    MVP: patients can self-create an encounter for demo/test purposes.
    In production, encounters are created by the hospital registration system.
    """
    opd_department: Optional[str] = None
    scheduled_at: Optional[str] = None   # ISO datetime string


class EncounterResponse(BaseModel):
    id: str
    patient_id: str
    doctor_user_id: Optional[str]
    queue_status: str
    opd_department: Optional[str]
    scheduled_at: Optional[str] = None

    model_config = {"from_attributes": True}
