"""
backend/models/intake_session.py

An IntakeSession records one voice/touch intake conversation tied to an Encounter.

answered_fields_json: list[str] of schema field_names that have been answered so
  far in this session. Updated after every /intake/turn call. Used to reconstruct
  the minimal IntakeTurn history needed by question_engine.select_next_field()
  without requiring a full entity re-query.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SAEnum, JSON
from sqlalchemy.orm import relationship

from backend.database import Base


class IntakeSessionStatus(str, enum.Enum):
    in_progress = "in_progress"
    submitted = "submitted"
    processed = "processed"


class IntakeSession(Base):
    __tablename__ = "intake_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    encounter_id = Column(String(36), ForeignKey("encounters.id"), nullable=False, index=True)
    language = Column(String(10), nullable=False, default="en")
    schema_id = Column(String(100), nullable=False)
    raw_transcript_ref = Column(String(500), nullable=True)
    status = Column(
        SAEnum(IntakeSessionStatus),
        default=IntakeSessionStatus.in_progress,
        nullable=False,
    )
    # Ordered list of field_names that have received an answer in this session.
    # e.g. ["chief_complaint", "onset"] after two answered turns.
    # Used to reconstruct IntakeTurn history for brain.handle_intake_turn().
    answered_fields_json = Column(JSON, default=list, nullable=False)
    turn_count = Column(String(10), default="0", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    encounter = relationship("Encounter", back_populates="intake_sessions")

    def __repr__(self) -> str:
        return f"<IntakeSession id={self.id} status={self.status}>"
