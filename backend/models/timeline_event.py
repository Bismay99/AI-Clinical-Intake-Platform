"""
backend/models/timeline_event.py

A normalized, dated clinical event built from extracted entities
(PRD Section 10). Uncertain or unresolvable dates are preserved as such —
they are never guessed into a false precision.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship

from backend.database import Base


class TimelineEvent(Base):
    __tablename__ = "timeline_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    encounter_id = Column(String(36), ForeignKey("encounters.id"), nullable=False, index=True)
    source_entity_id = Column(String(36), ForeignKey("extracted_entities.id"), nullable=True)

    event_type = Column(String(50), nullable=False)      # medication | investigation | diagnosis | visit
    date = Column(String(10), nullable=True)              # ISO date string or None if unresolvable
    date_confidence = Column(Float, nullable=False, default=0.0)
    date_uncertain = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    patient = relationship("Patient", back_populates="timeline_events")
    encounter = relationship("Encounter", back_populates="timeline_events")
    source_entity = relationship("ExtractedEntity", back_populates="timeline_events")

    def __repr__(self) -> str:
        return f"<TimelineEvent id={self.id} type={self.event_type} date={self.date}>"
