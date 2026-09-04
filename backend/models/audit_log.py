"""
backend/models/audit_log.py

Immutable audit trail — every material access or change to a patient record
is logged here (PRD Section 12: audit logging of access and material changes).

Rows are append-only: never updated or deleted in production.
"""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from backend.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)  # nullable for system actions
    action = Column(String(100), nullable=False)         # e.g. "entity.accept", "session.submit", "record.view"
    target_entity_type = Column(String(100), nullable=True)  # "extracted_entity" | "encounter" | etc.
    target_entity_id = Column(String(36), nullable=True)
    detail = Column(Text, nullable=True)                 # JSON or free-text context
    ip_address = Column(String(45), nullable=True)       # for future use
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    user = relationship("User", back_populates="audit_logs")

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id} action={self.action} user={self.user_id}>"
