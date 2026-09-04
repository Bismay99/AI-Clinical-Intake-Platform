"""
contracts.py

Shared data contracts for the AI Orchestration Service (the "brain.py" boundary).

Per PS47_System_Architecture.md Section 3.5:
  - This service receives a request (with encounter context) from the Core Backend.
  - It returns structured, evidence-linked, confidence-scored DRAFTS.
  - It never writes to a database and never marks anything "final" — that
    verification-state transition belongs to the Core Backend only.

Every extracted value in this system must be traceable to a source_ref
(PRD Section 9 — "the LLM is never the source of truth").
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any


class SourceType(str, Enum):
    DOCUMENT = "document"
    INTAKE_SESSION = "intake_session"


class VerificationStatus(str, Enum):
    UNREVIEWED = "unreviewed"
    ACCEPTED = "accepted"
    EDITED = "edited"
    REJECTED = "rejected"


@dataclass
class SourceRef:
    """Points every extracted value back to where it actually came from."""
    source_type: SourceType
    source_id: str                 # document_id or intake_session_id
    location: Optional[str] = None  # page/region for documents, turn id for intake


@dataclass
class ExtractedEntity:
    """
    One structured clinical fact, always evidence-linked and confidence-scored.
    This is a DRAFT until the Core Backend records a doctor's verification decision.
    """
    field_name: str
    value: str
    confidence: float                       # 0.0 - 1.0
    source: SourceRef
    low_confidence_flag: bool = False
    verification_status: VerificationStatus = VerificationStatus.UNREVIEWED
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TimelineEvent:
    event_type: str
    date: Optional[str]                     # ISO date, or None if fully unresolvable
    date_confidence: float
    date_uncertain: bool
    source_entity_field: str                # which ExtractedEntity.field_name this came from


@dataclass
class IntakeTurn:
    """
    One turn of the adaptive intake conversation.

    field_name is which schema field this turn answers — set by brain.py from
    IntakeRequest.answering_field_name, itself sourced from the PRIOR
    IntakeResponse.next_question_field_name. This is the tracked contract:
    the caller never has to reverse-engineer a field from question text, and
    question_engine.py never has to pattern-match prompt strings back to a
    field either.
    """
    question: str
    patient_response_text: str
    language: str
    field_name: Optional[str] = None


@dataclass
class IntakeRequest:
    encounter_id: str
    schema_id: str                          # e.g. "allopathic_chest_pain_v1" or "ayush_general_v1"
    language: str
    audio_bytes: Optional[bytes] = None     # raw voice input for this turn, if any
    touch_answer: Optional[str] = None      # structured touch input, if any
    history: List[IntakeTurn] = field(default_factory=list)
    answering_field_name: Optional[str] = None  # which schema field this turn's
                                                 # answer responds to — sourced from
                                                 # the prior IntakeResponse's
                                                 # next_question_field_name


@dataclass
class IntakeResponse:
    next_question: Optional[str]            # None when the pathway is complete
    next_question_field_name: Optional[str] # schema field_name the next_question maps to
    draft_entities: List[ExtractedEntity]
    pathway_complete: bool


@dataclass
class DocumentRequest:
    encounter_id: str
    document_id: str
    document_type: str                      # "prescription" | "lab_report" | "discharge_summary"
    file_bytes: bytes
    language_hint: Optional[str] = None


@dataclass
class DocumentResponse:
    draft_entities: List[ExtractedEntity]


@dataclass
class SummaryRequest:
    encounter_id: str
    entities: List[ExtractedEntity]         # only evidence-linked entities are allowed in
    timeline: List[TimelineEvent]


@dataclass
class SummaryResponse:
    summary_text: str
    used_entity_fields: List[str]           # traceability: which entities fed the summary
