"""
backend/models/encounter.py

An Encounter links a Patient to a specific OPD visit and the assigned Doctor.
All downstream records (intake sessions, documents, entities, summaries) are
anchored to an Encounter — never floating records (PRD Section 3).

Queue status lifecycle:
  registered → intake_in_progress → submitted → ready_for_review → completed
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship

from backend.database import Base


class EncounterStatus(str, enum.Enum):
    registered = "registered"
    intake_in_progress = "intake_in_progress"
    submitted = "submitted"
    ready_for_review = "ready_for_review"
    completed = "completed"


class Encounter(Base):
    __tablename__ = "encounters"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    doctor_user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    queue_status = Column(SAEnum(EncounterStatus), default=EncounterStatus.registered, nullable=False)
    opd_department = Column(String(255), nullable=True)
    scheduled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    patient = relationship("Patient", back_populates="encounters")
    intake_sessions = relationship("IntakeSession", back_populates="encounter")
    documents = relationship("Document", back_populates="encounter")
    extracted_entities = relationship("ExtractedEntity", back_populates="encounter")
    clinical_summaries = relationship("ClinicalSummary", back_populates="encounter")
    timeline_events = relationship("TimelineEvent", back_populates="encounter")

    def __repr__(self) -> str:
        return f"<Encounter id={self.id} status={self.queue_status}>"
