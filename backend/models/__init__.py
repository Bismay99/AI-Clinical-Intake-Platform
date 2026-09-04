"""
backend/models/__init__.py

Re-exports all ORM models so Alembic's env.py can import Base and discover
every table via `from backend.models import *`.

Import order matters: models with no FK dependencies first, then dependents.
"""

from backend.database import Base  # noqa: F401 — Alembic needs Base

from backend.models.user import User, UserRole  # noqa: F401
from backend.models.patient import Patient  # noqa: F401
from backend.models.encounter import Encounter, EncounterStatus  # noqa: F401
from backend.models.intake_session import IntakeSession, IntakeSessionStatus  # noqa: F401
from backend.models.document import Document  # noqa: F401
from backend.models.extracted_entity import ExtractedEntity, SourceType, VerificationStatus  # noqa: F401
from backend.models.timeline_event import TimelineEvent  # noqa: F401
from backend.models.clinical_summary import ClinicalSummary  # noqa: F401
from backend.models.audit_log import AuditLog  # noqa: F401

__all__ = [
    "Base",
    "User", "UserRole",
    "Patient",
    "Encounter", "EncounterStatus",
    "IntakeSession", "IntakeSessionStatus",
    "Document",
    "ExtractedEntity", "SourceType", "VerificationStatus",
    "TimelineEvent",
    "ClinicalSummary",
    "AuditLog",
]
