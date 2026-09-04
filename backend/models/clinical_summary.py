"""
backend/models/clinical_summary.py

The physician-ready clinical summary for one encounter.
Composed ONLY from evidence-linked extracted entities (PRD Section 15) —
never free-standing AI prose. used_entity_ids is the traceability list.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

from backend.database import Base


class ClinicalSummary(Base):
    __tablename__ = "clinical_summaries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    encounter_id = Column(String(36), ForeignKey("encounters.id"), nullable=False, index=True, unique=True)
    summary_text = Column(Text, nullable=False)
    used_entity_fields = Column(JSON, nullable=True)   # list of field_names that fed the summary
    generated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    regenerated_at = Column(DateTime, nullable=True)   # set if re-generated after doctor edits

    # Relationships
    encounter = relationship("Encounter", back_populates="clinical_summaries")

    def __repr__(self) -> str:
        return f"<ClinicalSummary id={self.id} encounter={self.encounter_id}>"
