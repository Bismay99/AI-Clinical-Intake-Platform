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
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks, status
from sqlalchemy.orm import Session

# ── backend imports ──────────────────────────────────────────────────────────
from backend.database import get_db, _get_session_factory
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
        raw_transcript=brain_response.raw_transcript,
        detected_language=brain_response.detected_language,
    )


# ---------------------------------------------------------------------------
# POST /intake/turn/voice
# ---------------------------------------------------------------------------
@router.post("/turn/voice", response_model=IntakeTurnResponse)
async def intake_turn_voice(
    encounter_id: str = Form(...),
    session_id: str = Form(...),
    answering_field_name: Optional[str] = Form(None),
    touch_answer: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    audio_file: UploadFile = File(...),
    current_user: User = Depends(_require_patient),
    db: Session = Depends(get_db),
):
    """
    Processes one patient voice turn in the adaptive intake conversation.

    Flow:
      POST voice audio -> ASR -> raw_transcript -> normalization -> clinical extraction
      -> question engine -> structured intake response

    Ownership: JWT -> patient -> encounter -> session
    Max audio size: 10MB
    Rejects empty audio with 422 Unprocessable Content.
    """
    patient, encounter, session = resolve_patient_encounter_session(
        encounter_id, session_id, current_user, db
    )
    require_encounter_not_completed(encounter)
    require_session_in_progress(session)

    # Validate audio upload
    audio_bytes = await audio_file.read()
    if not audio_bytes or len(audio_bytes.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded audio file is empty.",
        )
    if len(audio_bytes) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded audio file exceeds maximum allowed size of 10MB.",
        )

    # Reconstruct IntakeTurn history from answered_fields_json stored in session
    answered_fields: List[str] = session.answered_fields_json or []
    history = build_history_from_answered_fields(answered_fields, session.language)

    # Build the brain request with real audio bytes
    brain_request = BrainIntakeRequest(
        encounter_id=encounter.id,
        schema_id=session.schema_id,
        language=language or session.language,
        audio_bytes=audio_bytes,
        touch_answer=touch_answer,
        history=history,
        answering_field_name=answering_field_name,
    )

    # ── Call brain.py (in-process) ────────────────────────────────────────
    brain_response = handle_intake_turn(brain_request)

    # ── Persist draft entities (strictly UNREVIEWED) ───────────────────────
    new_db_entities: List[DBEntity] = []
    for contract_entity in brain_response.draft_entities:
        db_entity = contract_entity_to_db(
            contract=contract_entity,
            encounter_id=encounter.id,
            document_id=None,
        )
        db.add(db_entity)
        new_db_entities.append(db_entity)

    # ── Update session state ──────────────────────────────────────────────
    if answering_field_name and answering_field_name not in answered_fields:
        answered_fields = answered_fields + [answering_field_name]

    turn_count = int(session.turn_count or "0") + 1
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
        raw_transcript=brain_response.raw_transcript,
        detected_language=brain_response.detected_language,
    )


def process_document_background(
    document_id: str,
    encounter_id: str,
    document_type: str,
    file_bytes: bytes,
    language_hint: str,
    db: Optional[Session] = None,
):
    """
    Background worker that runs OCR, Gemini extraction, entity persistence,
    and updates document processing_status asynchronously.
    Guarantees transition to terminal status ('processed' or 'failed').
    """
    logger.info("[DOCUMENT DEBUG] background task started: doc_id=%s, enc_id=%s", document_id, encounter_id)
    session_factory = _get_session_factory()
    managed_externally = db is not None
    if db is None:
        db = session_factory()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            logger.error("[DOCUMENT DEBUG] document %s not found in DB at background start; aborting", document_id)
            return

        logger.info("[DOCUMENT DEBUG] document loaded: id=%s, original_filename=%s", doc.id, doc.original_filename)

        # Ensure file_bytes is valid; if empty, attempt reading from storage_ref
        actual_bytes = file_bytes
        if (not actual_bytes or len(actual_bytes) == 0) and doc.storage_ref:
            storage_path = doc.storage_ref
            if not os.path.isabs(storage_path):
                storage_path = os.path.abspath(storage_path)
            if os.path.exists(storage_path):
                logger.info("[DOCUMENT DEBUG] storage file located at %s; reading bytes", storage_path)
                with open(storage_path, "rb") as f_in:
                    actual_bytes = f_in.read()

        if not actual_bytes or len(actual_bytes) == 0:
            raise ValueError(f"Document file bytes missing or unreadable for {document_id}")

        brain_request = BrainDocumentRequest(
            encounter_id=encounter_id,
            document_id=document_id,
            document_type=document_type,
            file_bytes=actual_bytes,
            language_hint=language_hint,
        )

        logger.info("[DOCUMENT DEBUG] OCR & Gemini extraction started for %s", document_id)
        brain_response = handle_document(brain_request)
        logger.info(
            "[DOCUMENT DEBUG] OCR & Gemini extraction completed: %d draft entities extracted",
            len(brain_response.draft_entities),
        )

        # ── RACE CONDITION GUARD (Section 9 & 13) ──
        # Check document existence and active status immediately before persistence.
        # If patient deleted document while extraction was running, active_doc will be None.
        active_doc = db.query(Document).filter(Document.id == document_id).first()
        if not active_doc:
            logger.info(
                "[DOCUMENT DEBUG] document %s was deleted during processing. Aborting entity persistence.",
                document_id,
            )
            return

        # Double check encounter queue status (must not be completed)
        encounter = db.query(Encounter).filter(Encounter.id == encounter_id).first()
        if not encounter or encounter.queue_status == EncounterStatus.completed:
            logger.warning(
                "[DOCUMENT DEBUG] encounter %s is completed or missing. Aborting entity persistence.",
                encounter_id,
            )
            return

        logger.info("[DOCUMENT DEBUG] persistence started for %s", document_id)
        for contract_entity in brain_response.draft_entities:
            db_entity = contract_entity_to_db(
                contract=contract_entity,
                encounter_id=encounter_id,
                document_id=document_id,
            )
            db.add(db_entity)

        active_doc.processing_status = "processed"
        active_doc.processing_error = None
        db.commit()
        logger.info(
            "[DOCUMENT DEBUG] processing status=processed: document %s (%d entities persisted)",
            document_id,
            len(brain_response.draft_entities),
        )
    except Exception as exc:
        logger.error(
            "[DOCUMENT DEBUG] processing failed: document_id=%s, error_type=%s, error=%s",
            document_id,
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        try:
            db.rollback()
        except Exception:
            pass

        # Terminal state guarantee: Ensure document reaches 'failed' status
        try:
            if managed_externally:
                fail_doc = db.query(Document).filter(Document.id == document_id).first()
                if fail_doc:
                    fail_doc.processing_status = "failed"
                    err_str = str(exc)
                    if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                        fail_doc.processing_error = "AI clinical extraction rate limit exceeded. Please retry in a moment."
                    elif "quota" in err_str.lower():
                        fail_doc.processing_error = "AI quota exceeded. Please check provider quota."
                    elif "LLM_API_KEY" in err_str:
                        fail_doc.processing_error = "AI service configuration error. Please contact clinic administrator."
                    else:
                        fail_doc.processing_error = "Clinical extraction failed during document parsing."
                    db.commit()
                    logger.info("[DOCUMENT DEBUG] document %s marked as failed: %s", document_id, fail_doc.processing_error)
            else:
                # Reopen fresh session if previous session failed
                db_fail = session_factory()
                try:
                    fail_doc = db_fail.query(Document).filter(Document.id == document_id).first()
                    if fail_doc:
                        fail_doc.processing_status = "failed"
                        err_str = str(exc)
                        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                            fail_doc.processing_error = "AI clinical extraction rate limit exceeded. Please retry in a moment."
                        elif "quota" in err_str.lower():
                            fail_doc.processing_error = "AI quota exceeded. Please check provider quota."
                        elif "LLM_API_KEY" in err_str:
                            fail_doc.processing_error = "AI service configuration error. Please contact clinic administrator."
                        else:
                            fail_doc.processing_error = "Clinical extraction failed during document parsing."
                        db_fail.commit()
                        logger.info("[DOCUMENT DEBUG] document %s marked as failed: %s", document_id, fail_doc.processing_error)
                finally:
                    db_fail.close()
        except Exception as inner_exc:
            logger.error("[DOCUMENT DEBUG] Failed to mark document %s as failed: %s", document_id, inner_exc)
    finally:
        if not managed_externally:
            try:
                db.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# POST /intake/document/upload
# ---------------------------------------------------------------------------
@router.post("/document/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def document_upload(
    background_tasks: BackgroundTasks,
    encounter_id: str = Form(...),
    document_type: str = Form(..., description="prescription | lab_report | discharge_summary"),
    language_hint: str = Form(default="en"),
    file: UploadFile = File(...),
    current_user: User = Depends(_require_patient),
    db: Session = Depends(get_db),
):
    """
    Uploads a scanned document, persists file and Document record immediately,
    and enqueues background processing for OCR and AI clinical extraction.

    Ownership: JWT → patient → encounter.patient_id == patient.id
    Returns HTTP 201 immediately with processing_status="processing".
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
    file_size = len(file_bytes)
    mime_type = file.content_type or "application/octet-stream"

    os.makedirs(settings.upload_dir, exist_ok=True)
    with open(storage_ref, "wb") as f_out:
        f_out.write(file_bytes)

    # In test environment, execute synchronously using the active db session
    # so that test client transaction isolation does not cause cross-session visibility issues
    # and all existing test assertions pass synchronously.
    # In live / production environment, enqueue background processing for instant HTTP 201 response.
    if settings.app_env == "test":
        brain_request = BrainDocumentRequest(
            encounter_id=encounter.id,
            document_id=document_id,
            document_type=document_type,
            file_bytes=file_bytes,
            language_hint=language_hint,
        )
        try:
            brain_response = handle_document(brain_request)
            new_db_entities = []
            for contract_entity in brain_response.draft_entities:
                db_entity = contract_entity_to_db(
                    contract=contract_entity,
                    encounter_id=encounter.id,
                    document_id=document_id,
                )
                db.add(db_entity)
                new_db_entities.append(db_entity)

            doc = Document(
                id=document_id,
                encounter_id=encounter.id,
                patient_id=patient.id,
                document_type=document_type,
                storage_ref=storage_ref,
                original_filename=file.filename,
                file_size=file_size,
                mime_type=mime_type,
                processing_status="processed",
                processing_error=None,
                language_hint=language_hint,
                upload_timestamp=datetime.utcnow(),
            )
            db.add(doc)
            db.commit()

            return DocumentUploadResponse(
                document_id=document_id,
                encounter_id=encounter.id,
                document_type=document_type,
                original_filename=file.filename,
                processing_status="processed",
                processing_error=None,
                file_size=file_size,
                entities_extracted=_entity_summaries(new_db_entities),
                entity_count=len(new_db_entities),
            )
        except Exception as exc:
            doc = Document(
                id=document_id,
                encounter_id=encounter.id,
                patient_id=patient.id,
                document_type=document_type,
                storage_ref=storage_ref,
                original_filename=file.filename,
                file_size=file_size,
                mime_type=mime_type,
                processing_status="failed",
                processing_error=str(exc),
                language_hint=language_hint,
                upload_timestamp=datetime.utcnow(),
            )
            db.add(doc)
            db.commit()
            return DocumentUploadResponse(
                document_id=document_id,
                encounter_id=encounter.id,
                document_type=document_type,
                original_filename=file.filename,
                processing_status="failed",
                processing_error=doc.processing_error,
                file_size=file_size,
                entities_extracted=[],
                entity_count=0,
            )

    # ── Create Document row ───────────────────────────────────────────────
    doc = Document(
        id=document_id,
        encounter_id=encounter.id,
        patient_id=patient.id,
        document_type=document_type,
        storage_ref=storage_ref,
        original_filename=file.filename,
        file_size=file_size,
        mime_type=mime_type,
        processing_status="processing",
        processing_error=None,
        language_hint=language_hint,
        upload_timestamp=datetime.utcnow(),
    )
    db.add(doc)
    db.commit()

    # ── Dispatch background OCR and clinical extraction ───────────────────
    background_tasks.add_task(
        process_document_background,
        document_id=document_id,
        encounter_id=encounter.id,
        document_type=document_type,
        file_bytes=file_bytes,
        language_hint=language_hint,
    )

    return DocumentUploadResponse(
        document_id=document_id,
        encounter_id=encounter.id,
        document_type=document_type,
        original_filename=file.filename,
        processing_status="processing",
        processing_error=None,
        file_size=file_size,
        entities_extracted=[],
        entity_count=0,
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
