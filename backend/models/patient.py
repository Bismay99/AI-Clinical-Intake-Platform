"""
backend/models/patient.py

Patient demographic record.
Identity is provided via the hospital's workflow (PRD Section 2/3) —
we store a reference to that external hospital identifier, not PII directly
in an unauthenticated table.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from backend.database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), unique=True, nullable=False, index=True)
    hospital_identifier = Column(String(255), nullable=True, index=True)  # external HIS ID
    full_name = Column(String(255), nullable=False)
    date_of_birth = Column(String(10), nullable=True)   # ISO date string (YYYY-MM-DD)
    gender = Column(String(50), nullable=True)
    phone = Column(String(20), nullable=True)
    preferred_language = Column(String(10), default="en", nullable=False)
    demographics_json = Column(JSON, nullable=True)     # extensible extra fields
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", back_populates="patient_profile")
    encounters = relationship("Encounter", back_populates="patient")
    timeline_events = relationship("TimelineEvent", back_populates="patient")
    documents = relationship("Document", back_populates="patient")

    def __repr__(self) -> str:
        return f"<Patient id={self.id} name={self.full_name}>"
