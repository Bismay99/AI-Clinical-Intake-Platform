"""
backend/routers/intake.py

Patient-side intake API — Phase 2 endpoints:

  POST /intake/session/start     — start an adaptive intake session
  POST /intake/turn              — submit one voice/touch turn
  POST /intake/document/upload   — upload and process a scanned document
  POST /intake/submit            — finalise intake, generate timeline + summary

Architecture (per implementation plan):
  - All AI work is delegated to ai_orchestration/brain.py.
  - brain.py is called in-process as a Python function — no HTTP hop.
  - All DB persistence happens HERE, in this router.
  - brain.py NEVER writes to the DB.
  - All returned entities are UNREVIEWED. Only doctor endpoints can change that.

Ownership chain enforced on every endpoint:
  JWT → patient record → encounter.patient_id == patient.id → session.encounter_id == encounter.id
"""

import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

# ── backend imports ──────────────────────────────────────────────────────────
from backend.database import get_db
from backend.config import settings
from backend.models.user import User, UserRole
from backend.models.encounter import Encounter, EncounterStatus
from backend.models.intake_session import IntakeSession, IntakeSessionStatus
from backend.models.document import Document
from backend.models.extracted_entity import ExtractedEntity as DBEntity, VerificationStatus
from backend.models.timeline_event import TimelineEvent as DBTimelineEvent
from backend.models.clinical_summary import ClinicalSummary

from backend.auth.dependencies import get_current_user
from backend.services.ownership import (
    resolve_patient_encounter,
    resolve_patient_encounter_session,
    require_encounter_not_completed,
    require_session_in_progress,
)
from backend.services.brain_bridge import (
    contract_entity_to_db,
    db_entity_to_contract,
    build_history_from_answered_fields,
    contract_timeline_to_db,
)
from backend.schemas.intake import (
    SessionStartRequest, SessionStartResponse,
    IntakeTurnRequest, IntakeTurnResponse, ExtractedEntitySummary,
    DocumentUploadResponse,
    IntakeSubmitRequest, IntakeSubmitResponse,
)

# ── ai_orchestration imports (in-process, not HTTP) ──────────────────────────
from ai_orchestration.brain import (
    handle_intake_turn,
    handle_document,
    handle_timeline,
    handle_summary,
)
from ai_orchestration.contracts import (
    IntakeRequest as BrainIntakeRequest,
    DocumentRequest as BrainDocumentRequest,
    SummaryRequest as BrainSummaryRequest,
)
from ai_orchestration.clinical_schema import get_schema

router = APIRouter(prefix="/intake", tags=["intake"])


# ---------------------------------------------------------------------------
# Auth guard — patient only
# ---------------------------------------------------------------------------
def _require_patient(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patient-role accounts can access intake endpoints.",
        )
    return current_user


# ---------------------------------------------------------------------------
# Helper: convert brain draft entities to response summaries
# ---------------------------------------------------------------------------
def _entity_summaries(db_entities: List[DBEntity]) -> List[ExtractedEntitySummary]:
    return [
        ExtractedEntitySummary(
            field_name=e.field_name,
            value=e.value,
            confidence=e.confidence,
            low_confidence_flag=e.low_confidence_flag,
            source_type=e.source_type.value,
            source_location=e.source_location,
        )
        for e in db_entities
    ]


# ---------------------------------------------------------------------------
# POST /intake/session/start
# ---------------------------------------------------------------------------
@router.post("/session/start", response_model=SessionStartResponse, status_code=status.HTTP_201_CREATED)
def session_start(
    payload: SessionStartRequest,
    current_user: User = Depends(_require_patient),
    db: Session = Depends(get_db),
):
    """
    Starts a new adaptive intake session for the patient.

    Ownership: JWT → patient → encounter.patient_id == patient.id

    Creates an IntakeSession row, advances encounter status to
    intake_in_progress, and returns the first question from the schema.
    """
    patient, encounter = resolve_patient_encounter(payload.encounter_id, current_user, db)
    require_encounter_not_completed(encounter)

    # Validate schema_id exists (raises KeyError if not — convert to 422)
    try:
        schema = get_schema(payload.schema_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    # Create the intake session
    session = IntakeSession(
        encounter_id=encounter.id,
        language=payload.language,
        schema_id=payload.schema_id,
        answered_fields_json=[],
        turn_count="0",
    )
    db.add(session)

    # Advance encounter status
    if encounter.queue_status == EncounterStatus.registered:
        encounter.queue_status = EncounterStatus.intake_in_progress

    db.flush()
    db.refresh(session)

    # Determine the first question from the schema (no history yet)
    from ai_orchestration.question_engine import select_next_field
    first_field = select_next_field(payload.schema_id, [])

    return SessionStartResponse(
        session_id=session.id,
        encounter_id=encounter.id,
        schema_id=payload.schema_id,
        language=payload.language,
        first_question=first_field.prompt if first_field else None,
        first_question_field_name=first_field.field_name if first_field else None,
    )


# ---------------------------------------------------------------------------
# POST /intake/turn
# ---------------------------------------------------------------------------
@router.post("/turn", response_model=IntakeTurnResponse)
def intake_turn(
    payload: IntakeTurnRequest,
    current_user: User = Depends(_require_patient),
    db: Session = Depends(get_db),
):
    """
    Processes one patient turn in the adaptive intake conversation.

    Ownership: JWT → patient → encounter → session

    Calls brain.handle_intake_turn() with the reconstructed history.
    Persists all returned draft entities (UNREVIEWED).
    Updates the session's answered_fields_json and turn_count.
    """
    patient, encounter, session = resolve_patient_encounter_session(
        payload.encounter_id, payload.session_id, current_user, db
    )
    require_encounter_not_completed(encounter)
    require_session_in_progress(session)

    # Reconstruct IntakeTurn history from answered_fields_json stored in session
    answered_fields: List[str] = session.answered_fields_json or []
    history = build_history_from_answered_fields(answered_fields, session.language)

    # Build the brain request — audio_bytes is None (Phase 4: real ASR)
    brain_request = BrainIntakeRequest(
        encounter_id=encounter.id,
        schema_id=session.schema_id,
        language=session.language,
        audio_bytes=None,
        touch_answer=payload.touch_answer,
        history=history,
        answering_field_name=payload.answering_field_name,
    )

    # ── Call brain.py (in-process) ────────────────────────────────────────
    brain_response = handle_intake_turn(brain_request)

    # ── Persist draft entities ────────────────────────────────────────────
    new_db_entities: List[DBEntity] = []
    for contract_entity in brain_response.draft_entities:
        db_entity = contract_entity_to_db(
            contract=contract_entity,
            encounter_id=encounter.id,
            document_id=None,    # intake-sourced entities have no document_id
        )
        db.add(db_entity)
        new_db_entities.append(db_entity)

    # ── Update session state ──────────────────────────────────────────────
    # Track which field was answered so we can reconstruct history next turn
    if payload.answering_field_name and payload.answering_field_name not in answered_fields:
        answered_fields = answered_fields + [payload.answering_field_name]

    turn_count = int(session.turn_count or "0") + 1

    # SQLAlchemy needs a new list object to detect JSON mutation
    session.answered_fields_json = list(answered_fields)
    session.turn_count = str(turn_count)

    db.flush()

    return IntakeTurnResponse(
        session_id=session.id,
        next_question=brain_response.next_question,
        next_question_field_name=brain_response.next_question_field_name,
        pathway_complete=brain_response.pathway_complete,
        entities_extracted=_entity_summaries(new_db_entities),
        turn_number=turn_count,
    )


# ---------------------------------------------------------------------------
# POST /intake/document/upload
# ---------------------------------------------------------------------------
@router.post("/document/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def document_upload(
    encounter_id: str = Form(...),
    document_type: str = Form(..., description="prescription | lab_report | discharge_summary"),
    language_hint: str = Form(default="en"),
    file: UploadFile = File(...),
    current_user: User = Depends(_require_patient),
    db: Session = Depends(get_db),
):
    """
    Uploads a scanned document and processes it through brain.handle_document().

    Ownership: JWT → patient → encounter.patient_id == patient.id

    Saves the file to UPLOAD_DIR. Creates a Document row. Persists all
    returned draft entities (UNREVIEWED) linked to the document.
    """
    patient, encounter = resolve_patient_encounter(encounter_id, current_user, db)
    require_encounter_not_completed(encounter)

    # Validate document_type
    allowed_types = {"prescription", "lab_report", "discharge_summary"}
    if document_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"document_type must be one of: {sorted(allowed_types)}",
        )

    # ── Save file to disk ─────────────────────────────────────────────────
    document_id = str(uuid.uuid4())
    safe_filename = f"{document_id}_{file.filename or 'upload'}"
    storage_ref = os.path.join(settings.upload_dir, safe_filename)
    file_bytes = await file.read()

    os.makedirs(settings.upload_dir, exist_ok=True)
    with open(storage_ref, "wb") as f_out:
        f_out.write(file_bytes)

    # ── Create Document row ───────────────────────────────────────────────
    doc = Document(
        id=document_id,
        encounter_id=encounter.id,
        document_type=document_type,
        storage_ref=storage_ref,
        original_filename=file.filename,
        language_hint=language_hint,
        upload_timestamp=datetime.utcnow(),
    )
    db.add(doc)
    db.flush()  # get doc.id before we pass it to the bridge

    # ── Call brain.handle_document() (in-process) ─────────────────────────
    brain_request = BrainDocumentRequest(
        encounter_id=encounter.id,
        document_id=document_id,
        document_type=document_type,
        file_bytes=file_bytes,
        language_hint=language_hint,
    )
    brain_response = handle_document(brain_request)

    # ── Persist draft entities ────────────────────────────────────────────
    new_db_entities: List[DBEntity] = []
    for contract_entity in brain_response.draft_entities:
        db_entity = contract_entity_to_db(
            contract=contract_entity,
            encounter_id=encounter.id,
            document_id=document_id,
        )
        db.add(db_entity)
        new_db_entities.append(db_entity)

    db.flush()

    return DocumentUploadResponse(
        document_id=document_id,
        encounter_id=encounter.id,
        document_type=document_type,
        entities_extracted=_entity_summaries(new_db_entities),
        entity_count=len(new_db_entities),
    )


# ---------------------------------------------------------------------------
# POST /intake/submit
# ---------------------------------------------------------------------------
@router.post("/submit", response_model=IntakeSubmitResponse)
def intake_submit(
    payload: IntakeSubmitRequest,
    current_user: User = Depends(_require_patient),
    db: Session = Depends(get_db),
):
    """
    Finalises the patient intake:
      1. Collects all UNREVIEWED extracted entities for this encounter.
      2. Calls brain.handle_timeline() → persists TimelineEvents.
      3. Calls brain.handle_summary() → persists ClinicalSummary.
      4. Updates IntakeSession status → submitted.
      5. Updates Encounter status → ready_for_review.

    Ownership: JWT → patient → encounter → session

    After this call, the encounter enters the doctor's queue.
    Patient cannot add more turns or documents once submitted.
    """
    patient, encounter, session = resolve_patient_encounter_session(
        payload.encounter_id, payload.session_id, current_user, db
    )
    require_encounter_not_completed(encounter)
    require_session_in_progress(session)

    # ── Collect all UNREVIEWED entities for this encounter ────────────────
    db_entities = (
        db.query(DBEntity)
        .filter(
            DBEntity.encounter_id == encounter.id,
            DBEntity.verification_status == VerificationStatus.unreviewed,
        )
        .all()
    )

    # Convert to brain contracts for timeline + summary generation
    contract_entities = [db_entity_to_contract(e) for e in db_entities]

    # ── Generate timeline (in-process via brain.py) ───────────────────────
    contract_timeline = handle_timeline(contract_entities)

    # Persist timeline events
    new_timeline_events: List[DBTimelineEvent] = []
    for ct_event in contract_timeline:
        db_event = contract_timeline_to_db(
            contract=ct_event,
            patient_id=patient.id,
            encounter_id=encounter.id,
        )
        db.add(db_event)
        new_timeline_events.append(db_event)

    # ── Generate clinical summary (in-process via brain.py) ───────────────
    brain_summary_req = BrainSummaryRequest(
        encounter_id=encounter.id,
        entities=contract_entities,
        timeline=contract_timeline,
    )
    brain_summary = handle_summary(brain_summary_req)

    # Persist clinical summary (upsert: one summary per encounter)
    existing_summary = (
        db.query(ClinicalSummary)
        .filter(ClinicalSummary.encounter_id == encounter.id)
        .first()
    )
    if existing_summary:
        existing_summary.summary_text = brain_summary.summary_text
        existing_summary.used_entity_fields = brain_summary.used_entity_fields
        existing_summary.regenerated_at = datetime.utcnow()
    else:
        db.add(ClinicalSummary(
            encounter_id=encounter.id,
            summary_text=brain_summary.summary_text,
            used_entity_fields=brain_summary.used_entity_fields,
        ))

    # ── Update session and encounter status ───────────────────────────────
    session.status = IntakeSessionStatus.submitted
    encounter.queue_status = EncounterStatus.ready_for_review

    db.flush()

    return IntakeSubmitResponse(
        encounter_id=encounter.id,
        session_id=session.id,
        status="ready_for_review",
        total_entities=len(db_entities),
        timeline_events=len(new_timeline_events),
        summary_preview=brain_summary.summary_text[:200],
    )
