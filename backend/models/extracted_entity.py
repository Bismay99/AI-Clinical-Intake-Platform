"""
backend/models/extracted_entity.py

The central clinical fact record — mirrors ai_orchestration/contracts.py's
ExtractedEntity, but with persistence semantics.

Design rules (PRD Section 9 / Section 14 / Section 15):
  - Every row must have a source_ref (source_type + source_id + source_location).
  - confidence is always set; low_confidence_flag is derived from it.
  - verification_status starts as UNREVIEWED.
  - ACCEPTED / EDITED / REJECTED transitions are only written here, by the
    Core Backend's verification layer, after an explicit doctor action.
  - The AI Orchestration Service (brain.py) NEVER writes to this table.
"""

import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Float, Boolean, Text, JSON, Enum as SAEnum
from sqlalchemy.orm import relationship

from backend.database import Base


class SourceType(str, enum.Enum):
    document = "document"
    intake_session = "intake_session"


class VerificationStatus(str, enum.Enum):
    unreviewed = "unreviewed"
    accepted = "accepted"
    edited = "edited"
    rejected = "rejected"


class ExtractedEntity(Base):
    __tablename__ = "extracted_entities"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    encounter_id = Column(String(36), ForeignKey("encounters.id"), nullable=False, index=True)

    # Source provenance (PRD Section 9)
    source_type = Column(SAEnum(SourceType), nullable=False)
    source_id = Column(String(36), nullable=False)          # document.id or intake_session.id
    source_location = Column(String(255), nullable=True)    # page:1/block_1 or turn:0

    # Optional FK to documents table (nullable — intake-sourced entities won't have this)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=True, index=True)

    # Clinical field
    field_name = Column(String(100), nullable=False)
    value = Column(Text, nullable=False)
    original_ai_value = Column(Text, nullable=True)         # preserved when doctor edits

    # Confidence (PRD Section 15)
    confidence = Column(Float, nullable=False)
    low_confidence_flag = Column(Boolean, default=False, nullable=False)

    # Verification state (written ONLY by backend/verification.py after doctor action)
    verification_status = Column(
        SAEnum(VerificationStatus),
        default=VerificationStatus.unreviewed,
        nullable=False,
    )
    reviewed_by = Column(String(36), ForeignKey("users.id"), nullable=True)   # doctor user_id
    reviewed_at = Column(DateTime, nullable=True)

    # Extensible metadata (stored as JSON — language, schema_id, etc.)
    metadata_json = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    encounter = relationship("Encounter", back_populates="extracted_entities")
    document = relationship("Document", back_populates="extracted_entities")
    timeline_events = relationship("TimelineEvent", back_populates="source_entity")

    def __repr__(self) -> str:
        return f"<ExtractedEntity id={self.id} field={self.field_name} status={self.verification_status}>"
