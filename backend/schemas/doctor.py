"""
backend/schemas/doctor.py

Pydantic schemas for all Phase 3 doctor-side endpoints.

Design principles:
  - All provenance fields (source_type, source_id, source_location) are
    exposed to doctors so they can trace every AI claim to its source.
  - original_ai_value is included so doctors can see what the AI extracted
    before their correction.
  - Entity IDs are exposed to doctors (they need them for PATCH /verify).
    Patients never see entity IDs (no need — they don't verify records).
"""

from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Literal, Dict


# ---------------------------------------------------------------------------
# Shared — entity detail (used by summary, timeline, document, verify)
# ---------------------------------------------------------------------------
class EntityDetail(BaseModel):
    """Full entity record as a doctor sees it — includes provenance + status."""
    id: str
    field_name: str
    value: str                          # current value (may be doctor-edited)
    original_ai_value: Optional[str]    # what the AI originally extracted
    confidence: float
    low_confidence_flag: bool
    verification_status: str
    source_type: str
    source_id: str
    source_location: Optional[str]
    source_document_id: Optional[str] = None
    source_document_name: Optional[str] = None
    reviewed_by: Optional[str]          # doctor user_id who last acted
    reviewed_at: Optional[str]          # ISO datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# GET /doctor/queue
# ---------------------------------------------------------------------------
class QueueItem(BaseModel):
    encounter_id: str
    patient_id: str
    patient_name: str
    encounter_status: str
    opd_department: Optional[str]
    created_at: str
    updated_at: str
    has_summary: bool
    total_entities: int
    unreviewed_count: int


class DoctorQueueResponse(BaseModel):
    doctor_user_id: str
    items: List[QueueItem]
    total: int


# ---------------------------------------------------------------------------
# POST /doctor/encounter/{encounter_id}/assign
# ---------------------------------------------------------------------------
class AssignResponse(BaseModel):
    encounter_id: str
    doctor_user_id: str
    queue_status: str
    message: str


# ---------------------------------------------------------------------------
# GET /doctor/patient/{encounter_id}/summary
# ---------------------------------------------------------------------------
class SummaryDetailResponse(BaseModel):
    encounter_id: str
    summary_id: str
    summary_text: str
    generated_at: str
    regenerated_at: Optional[str]
    used_entity_fields: Optional[List[str]]
    documents_count: int = 0
    documents: List[DocumentDetailResponse] = []
    investigations: List[str] = []
    investigation_details: Optional[Dict[str, str]] = None
    entities: List[EntityDetail]     # all entities for this encounter, with confidence/provenance


# ---------------------------------------------------------------------------
# GET /doctor/patient/{encounter_id}/timeline
# ---------------------------------------------------------------------------
class TimelineEventResponse(BaseModel):
    id: str
    event_type: str
    date: Optional[str]
    date_confidence: float
    date_uncertain: bool
    source_entity_id: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# GET /doctor/patient/{encounter_id}/document/{doc_id}
# ---------------------------------------------------------------------------
class DocumentDetailResponse(BaseModel):
    id: str
    encounter_id: str
    patient_id: Optional[str] = None
    document_type: str
    original_filename: Optional[str]
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    processing_status: Optional[str] = "processed"
    language_hint: str
    upload_timestamp: str
    extracted_entities: List[EntityDetail]


# ---------------------------------------------------------------------------
# PATCH /doctor/entity/{entity_id}/verify
# ---------------------------------------------------------------------------
class VerifyRequest(BaseModel):
    action: Literal["accept", "edit", "reject"]
    new_value: Optional[str] = Field(
        default=None,
        description="Required when action='edit'. The doctor-corrected value.",
    )


class VerifyResponse(BaseModel):
    entity_id: str
    field_name: str
    action: str
    verification_status: str
    value: str                         # current value after doctor action
    original_ai_value: Optional[str]
    reviewed_by: str                   # doctor user_id
    reviewed_at: str                   # ISO datetime


# ---------------------------------------------------------------------------
# POST /doctor/encounter/{encounter_id}/finalize
# ---------------------------------------------------------------------------
class FinalizeResponse(BaseModel):
    encounter_id: str
    status: str                        # "completed"
    finalized_by: str                  # doctor user_id
    audit_log_id: str
    reviewed_entity_count: int
    unreviewed_entity_count: int


# ---------------------------------------------------------------------------
# GET /doctor/dashboard/stats
# ---------------------------------------------------------------------------
class DoctorStats(BaseModel):
    awaiting_review: int    # assigned encounters in ready_for_review
    in_review: int          # assigned encounters in intake_in_progress or submitted (being worked on)
    completed: int          # assigned encounters in completed


# ---------------------------------------------------------------------------
# GET /doctor/patients/search
# ---------------------------------------------------------------------------
class EncounterSummary(BaseModel):
    encounter_id: str
    queue_status: str
    opd_department: Optional[str]
    submitted_at: Optional[str]   # updated_at isoformat when status == ready_for_review
    total_entities: int
    unreviewed_count: int


class PatientSearchResult(BaseModel):
    patient_id: str
    patient_name: str
    date_of_birth: Optional[str]
    gender: Optional[str]
    preferred_language: str
    encounters: List[EncounterSummary]


# ---------------------------------------------------------------------------
# GET /doctor/available
# ---------------------------------------------------------------------------
class AvailableEncounterItem(BaseModel):
    encounter_id: str
    patient_name: str
    opd_department: Optional[str]
    queue_status: str
    created_at: str
    updated_at: str
    total_entities: int


# ---------------------------------------------------------------------------
# GET /doctor/patients/recommended
# ---------------------------------------------------------------------------
class RecommendedItem(BaseModel):
    encounter_id: str
    patient_id: str
    patient_name: str
    opd_department: Optional[str]
    queue_status: str
    updated_at: str
    reason: str
