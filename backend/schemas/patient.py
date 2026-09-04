"""
backend/schemas/patient.py

Pydantic schemas for patient profile endpoints.
"""

from pydantic import BaseModel
from typing import Optional


class PatientProfileCreate(BaseModel):
    full_name: str
    date_of_birth: Optional[str] = None       # YYYY-MM-DD
    gender: Optional[str] = None
    phone: Optional[str] = None
    preferred_language: str = "en"
    hospital_identifier: Optional[str] = None  # external HIS ID


class PatientProfileResponse(BaseModel):
    id: str
    user_id: str
    full_name: str
    date_of_birth: Optional[str]
    gender: Optional[str]
    phone: Optional[str]
    preferred_language: str
    hospital_identifier: Optional[str]

    model_config = {"from_attributes": True}
