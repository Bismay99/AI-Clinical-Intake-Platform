"""
backend/models/document.py

A Document represents one uploaded file (prescription, lab report, etc.)
The actual bytes are stored in the filesystem (UPLOAD_DIR); this table stores
metadata and a path reference. Every ExtractedEntity sourced from a document
links back to this record's id (PRD Section 9).
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from backend.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    encounter_id = Column(String(36), ForeignKey("encounters.id"), nullable=False, index=True)
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=True, index=True)
    document_type = Column(String(50), nullable=False)   # prescription | lab_report | discharge_summary
    storage_ref = Column(String(500), nullable=False)    # filesystem path or object storage key
    original_filename = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    processing_status = Column(String(50), default="processed", nullable=True)  # uploaded | processing | processed | failed
    page_count = Column(Integer, nullable=True)
    language_hint = Column(String(10), default="en", nullable=False)
    upload_timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    encounter = relationship("Encounter", back_populates="documents")
    patient = relationship("Patient", back_populates="documents")
    extracted_entities = relationship("ExtractedEntity", back_populates="document")

    def __repr__(self) -> str:
        return f"<Document id={self.id} type={self.document_type}>"
