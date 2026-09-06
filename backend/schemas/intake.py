"""
backend/schemas/intake.py

Pydantic request/response schemas for all Phase 2 patient intake endpoints:
  POST /intake/session/start
  POST /intake/turn
  POST /intake/document/upload   (uses FastAPI Form/File — not a JSON body)
  POST /intake/submit
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List


# ---------------------------------------------------------------------------
# POST /intake/session/start
# ---------------------------------------------------------------------------
class SessionStartRequest(BaseModel):
    encounter_id: str
    language: str = Field(default="en", description="BCP-47 language code, e.g. 'en', 'hi'")
    schema_id: str = Field(
        default="allopathic_chest_pain_v1",
        description="Clinical schema to use for adaptive questioning",
    )


class SessionStartResponse(BaseModel):
    session_id: str
    encounter_id: str
    schema_id: str
    language: str
    # The first question to show the patient immediately
    first_question: Optional[str]
    first_question_field_name: Optional[str]
    status: str = "in_progress"


# ---------------------------------------------------------------------------
# POST /intake/turn
# ---------------------------------------------------------------------------
class IntakeTurnRequest(BaseModel):
    session_id: str
    encounter_id: str
    touch_answer: Optional[str] = Field(
        default=None,
        description="Text input from touch/keyboard (or pre-transcribed ASR text)",
    )
    answering_field_name: Optional[str] = Field(
        default=None,
        description=(
            "Which schema field this answer responds to. "
            "Must match the prior response's next_question_field_name. "
            "On the very first turn, use the first_question_field_name from session/start."
        ),
    )


class ExtractedEntitySummary(BaseModel):
    """Lightweight entity summary returned to the patient UI (no DB ids)."""
    field_name: str
    value: str
    confidence: float
    low_confidence_flag: bool
    source_type: str
    source_location: Optional[str]


class IntakeTurnResponse(BaseModel):
    session_id: str
    next_question: Optional[str]
    next_question_field_name: Optional[str]
    pathway_complete: bool
    entities_extracted: List[ExtractedEntitySummary]
    turn_number: int
    raw_transcript: Optional[str] = None
    detected_language: Optional[str] = None


# ---------------------------------------------------------------------------
# POST /intake/document/upload  (multipart — schema shown for docs only)
# ---------------------------------------------------------------------------
class DocumentUploadResponse(BaseModel):
    document_id: str
    encounter_id: str
    document_type: str
    original_filename: Optional[str] = None
    processing_status: str = "processed"
    processing_error: Optional[str] = None
    file_size: Optional[int] = None
    entities_extracted: List[ExtractedEntitySummary]
    entity_count: int


# ---------------------------------------------------------------------------
# POST /intake/submit
# ---------------------------------------------------------------------------
class IntakeSubmitRequest(BaseModel):
    session_id: str
    encounter_id: str


class IntakeSubmitResponse(BaseModel):
    encounter_id: str
    session_id: str
    status: str                       # "ready_for_review"
    total_entities: int
    timeline_events: int
    summary_preview: str              # first 200 chars of the generated summary
