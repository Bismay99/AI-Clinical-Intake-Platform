"""
backend/routers/doctor.py

Phase 3 — Doctor-side read and verification endpoints.

  POST   /doctor/encounter/{encounter_id}/assign    — claim a ready-for-review encounter
  GET    /doctor/queue                              — see assigned encounters
  GET    /doctor/patient/{encounter_id}/summary     — read AI summary + entity evidence
  GET    /doctor/patient/{encounter_id}/timeline    — chronological timeline
  GET    /doctor/patient/{encounter_id}/document/{doc_id} — document + entities
  GET    /doctor/patient/{encounter_id}/entities    — all entities for an encounter
  PATCH  /doctor/entity/{entity_id}/verify         — ACCEPT / EDIT / REJECT
  POST   /doctor/encounter/{encounter_id}/finalize  — mark encounter completed

Authorization:
  - Every endpoint requires a doctor (or admin) JWT.
  - Encounters must be explicitly assigned to the doctor (encounter.doctor_user_id == doctor.id).
  - Mismatched resources → 404 (not 403, prevents enumeration).
  - Patients cannot reach any of these endpoints.

The verification state machine lives in backend/services/verification.py.
ai_orchestration/brain.py is NOT called from any doctor endpoint —
  doctors review what brain.py already produced during patient intake.
"""

from datetime import datetime
from typing import List, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

# ── backend imports ──────────────────────────────────────────────────────────
from backend.database import get_db
from backend.models.user import User
from backend.models.encounter import Encounter, EncounterStatus
from backend.models.document import Document
from backend.models.extracted_entity import ExtractedEntity, VerificationStatus
from backend.models.timeline_event import TimelineEvent
from backend.models.clinical_summary import ClinicalSummary
from backend.models.patient import Patient
from backend.models.audit_log import AuditLog

from backend.auth.dependencies import get_current_user
from backend.services.doctor_auth import (
    require_doctor_user,
    get_encounter_for_doctor,
    get_document_for_doctor,
    get_entity_for_doctor,
    require_ready_for_review,
    require_not_completed,
)
from backend.services.verification import verify_entity, finalize_encounter
from backend.schemas.doctor import (
    QueueItem, DoctorQueueResponse,
    AssignResponse,
    SummaryDetailResponse,
    TimelineEventResponse,
    DocumentDetailResponse,
    EntityDetail,
    VerifyRequest, VerifyResponse,
    FinalizeResponse,
    DoctorStats,
    EncounterSummary,
    PatientSearchResult,
    AvailableEncounterItem,
    RecommendedItem,
)

router = APIRouter(prefix="/doctor", tags=["doctor"])


# ---------------------------------------------------------------------------
# Auth guard dependency
# ---------------------------------------------------------------------------
def _require_doctor(current_user: User = Depends(get_current_user)) -> User:
    return require_doctor_user(current_user)


# ---------------------------------------------------------------------------
# Helpers — convert ORM models to Pydantic schemas
# ---------------------------------------------------------------------------
def _entity_to_detail(e: ExtractedEntity) -> EntityDetail:
    return EntityDetail(
        id=e.id,
        field_name=e.field_name,
        value=e.value,
        original_ai_value=e.original_ai_value,
        confidence=e.confidence,
        low_confidence_flag=e.low_confidence_flag,
        verification_status=e.verification_status.value,
        source_type=e.source_type.value,
        source_id=e.source_id,
        source_location=e.source_location,
        source_document_id=e.document_id,
        source_document_name=e.document.original_filename if e.document else None,
        reviewed_by=e.reviewed_by,
        reviewed_at=e.reviewed_at.isoformat() if e.reviewed_at else None,
    )


# ---------------------------------------------------------------------------
# POST /doctor/encounter/{encounter_id}/assign
# ---------------------------------------------------------------------------
@router.post("/encounter/{encounter_id}/assign", response_model=AssignResponse)
def assign_encounter(
    encounter_id: str,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Doctor self-assigns to a ready_for_review encounter.

    In production, hospital scheduling systems would do this automatically.
    For MVP, the doctor claims encounters from the global ready_for_review pool.

    Rules:
      - Encounter must be in ready_for_review state.
      - If already assigned to another doctor → 409.
      - Re-assigning to self is idempotent.
    """
    encounter = db.query(Encounter).filter(Encounter.id == encounter_id).first()
    if encounter is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Encounter not found.")

    require_ready_for_review(encounter)

    if encounter.doctor_user_id and encounter.doctor_user_id != doctor.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This encounter is already assigned to another doctor.",
        )

    encounter.doctor_user_id = doctor.id
    db.flush()

    return AssignResponse(
        encounter_id=encounter.id,
        doctor_user_id=doctor.id,
        queue_status=encounter.queue_status.value,
        message="Encounter assigned successfully.",
    )


# ---------------------------------------------------------------------------
# GET /doctor/queue
# ---------------------------------------------------------------------------
@router.get("/queue", response_model=DoctorQueueResponse)
def doctor_queue(
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns all encounters currently assigned to this doctor.
    Includes enough information for the doctor's queue panel.
    """
    encounters = (
        db.query(Encounter)
        .filter(Encounter.doctor_user_id == doctor.id)
        .order_by(Encounter.updated_at.desc())
        .all()
    )

    items: List[QueueItem] = []
    for enc in encounters:
        # Get patient name
        patient: Patient = enc.patient
        patient_name = patient.full_name if patient else "Unknown"

        # Entity counts (done in Python to avoid complex SQL for MVP)
        total = db.query(ExtractedEntity).filter(ExtractedEntity.encounter_id == enc.id).count()
        unreviewed = (
            db.query(ExtractedEntity)
            .filter(
                ExtractedEntity.encounter_id == enc.id,
                ExtractedEntity.verification_status == VerificationStatus.unreviewed,
            )
            .count()
        )
        has_summary = (
            db.query(ClinicalSummary)
            .filter(ClinicalSummary.encounter_id == enc.id)
            .count() > 0
        )

        items.append(QueueItem(
            encounter_id=enc.id,
            patient_id=enc.patient_id,
            patient_name=patient_name,
            encounter_status=enc.queue_status.value,
            opd_department=enc.opd_department,
            created_at=enc.created_at.isoformat(),
            updated_at=enc.updated_at.isoformat(),
            has_summary=has_summary,
            total_entities=total,
            unreviewed_count=unreviewed,
        ))

    return DoctorQueueResponse(
        doctor_user_id=doctor.id,
        items=items,
        total=len(items),
    )


# ---------------------------------------------------------------------------
# GET /doctor/patient/{encounter_id}/summary
# ---------------------------------------------------------------------------
@router.get("/patient/{encounter_id}/summary", response_model=SummaryDetailResponse)
def get_summary(
    encounter_id: str,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns the clinical summary for an assigned encounter.
    Includes ALL extracted entities with full provenance and confidence.
    Consolidates clinical facts from conversation and uploaded documents.
    """
    encounter = get_encounter_for_doctor(encounter_id, doctor, db)

    summary = (
        db.query(ClinicalSummary)
        .filter(ClinicalSummary.encounter_id == encounter.id)
        .first()
    )
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No clinical summary found. Patient may not have submitted intake yet.",
        )

    entities = (
        db.query(ExtractedEntity)
        .filter(ExtractedEntity.encounter_id == encounter.id)
        .all()
    )

    documents = (
        db.query(Document)
        .filter(Document.encounter_id == encounter.id)
        .order_by(Document.upload_timestamp.desc())
        .all()
    )

    # Detect investigations/labs from entities
    investigations: List[str] = []
    investigation_details: Dict[str, str] = {}
    for e in entities:
        is_lab_field = any(k in e.field_name.lower() for k in [
            "investigation", "lab", "test", "report", "ecg", "blood", "xray",
            "scan", "mri", "ct", "cbc", "lft", "kft", "hba1c", "glucose",
            "cholesterol", "troponin", "platelet", "wbc", "rbc", "urine"
        ])
        is_doc_entity = e.source_type.value == "document" and e.field_name not in (
            "chief_complaint", "onset", "duration", "exertion_related", "radiation",
            "associated_symptoms", "medications", "allergies", "medical_history",
            "past_history", "family_history", "social_history"
        )
        if is_lab_field or is_doc_entity:
            field_title = e.field_name.replace("_", " ").title()
            investigations.append(f"{field_title}: {e.value}")
            investigation_details[field_title] = e.value

    doc_details = [
        DocumentDetailResponse(
            id=d.id,
            encounter_id=d.encounter_id,
            patient_id=d.patient_id,
            document_type=d.document_type,
            original_filename=d.original_filename,
            file_size=getattr(d, "file_size", None),
            mime_type=getattr(d, "mime_type", None),
            processing_status=getattr(d, "processing_status", "processed") or "processed",
            language_hint=d.language_hint or "en",
            upload_timestamp=d.upload_timestamp.isoformat() if d.upload_timestamp else "",
            extracted_entities=[_entity_to_detail(e) for e in entities if e.document_id == d.id],
        )
        for d in documents
    ]

    patient = encounter.patient
    return SummaryDetailResponse(
        encounter_id=encounter.id,
        patient_id=patient.id if patient else encounter.patient_id,
        patient_name=patient.full_name if patient else "Patient Record",
        opd_department=encounter.opd_department,
        summary_id=summary.id,
        summary_text=summary.summary_text,
        generated_at=summary.generated_at.isoformat(),
        regenerated_at=summary.regenerated_at.isoformat() if summary.regenerated_at else None,
        used_entity_fields=summary.used_entity_fields,
        documents_count=len(documents),
        documents=doc_details,
        investigations=investigations,
        investigation_details=investigation_details,
        entities=[_entity_to_detail(e) for e in entities],
    )


# ---------------------------------------------------------------------------
# GET /doctor/patient/{encounter_id}/timeline
# ---------------------------------------------------------------------------
@router.get("/patient/{encounter_id}/timeline", response_model=List[TimelineEventResponse])
def get_timeline(
    encounter_id: str,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns longitudinal timeline events for the encounter, sorted chronologically.
    Events with uncertain dates appear at the end.
    """
    encounter = get_encounter_for_doctor(encounter_id, doctor, db)

    events = (
        db.query(TimelineEvent)
        .filter(TimelineEvent.encounter_id == encounter.id)
        .order_by(
            TimelineEvent.date_uncertain.asc(),    # certain dates first
            TimelineEvent.date.asc().nullslast(),  # then by date
            TimelineEvent.created_at.asc(),
        )
        .all()
    )

    return [
        TimelineEventResponse(
            id=ev.id,
            event_type=ev.event_type,
            date=ev.date,
            date_confidence=ev.date_confidence,
            date_uncertain=ev.date_uncertain,
            source_entity_id=ev.source_entity_id,
            created_at=ev.created_at.isoformat(),
        )
        for ev in events
    ]


# ---------------------------------------------------------------------------
# GET /doctor/patient/{encounter_id}/document/{doc_id}
# ---------------------------------------------------------------------------
@router.get("/patient/{encounter_id}/document/{doc_id}", response_model=DocumentDetailResponse)
def get_document(
    encounter_id: str,
    doc_id: str,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns document metadata plus all extracted entities from that document.
    Cross-patient document access is blocked: document must belong to this encounter.
    """
    encounter = get_encounter_for_doctor(encounter_id, doctor, db)
    doc = get_document_for_doctor(doc_id, encounter, db)

    # Get only entities sourced from this document
    entities = (
        db.query(ExtractedEntity)
        .filter(ExtractedEntity.document_id == doc.id)
        .all()
    )

    return DocumentDetailResponse(
        id=doc.id,
        encounter_id=doc.encounter_id,
        patient_id=doc.patient_id,
        document_type=doc.document_type,
        original_filename=doc.original_filename,
        file_size=getattr(doc, "file_size", None),
        mime_type=getattr(doc, "mime_type", None),
        processing_status=getattr(doc, "processing_status", "processed") or "processed",
        language_hint=doc.language_hint,
        upload_timestamp=doc.upload_timestamp.isoformat() if doc.upload_timestamp else "",
        extracted_entities=[_entity_to_detail(e) for e in entities],
    )


# ---------------------------------------------------------------------------
# GET /doctor/patient/{encounter_id}/documents
# ---------------------------------------------------------------------------
@router.get("/patient/{encounter_id}/documents", response_model=List[DocumentDetailResponse])
def get_encounter_documents(
    encounter_id: str,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns all documents for an assigned encounter with their extracted entities.
    """
    encounter = get_encounter_for_doctor(encounter_id, doctor, db)

    documents = (
        db.query(Document)
        .filter(Document.encounter_id == encounter.id)
        .order_by(Document.upload_timestamp.desc())
        .all()
    )

    entities = (
        db.query(ExtractedEntity)
        .filter(ExtractedEntity.encounter_id == encounter.id)
        .all()
    )

    return [
        DocumentDetailResponse(
            id=d.id,
            encounter_id=d.encounter_id,
            patient_id=d.patient_id,
            document_type=d.document_type,
            original_filename=d.original_filename,
            file_size=getattr(d, "file_size", None),
            mime_type=getattr(d, "mime_type", None),
            processing_status=getattr(d, "processing_status", "processed") or "processed",
            language_hint=d.language_hint or "en",
            upload_timestamp=d.upload_timestamp.isoformat() if d.upload_timestamp else "",
            extracted_entities=[_entity_to_detail(e) for e in entities if e.document_id == d.id],
        )
        for d in documents
    ]


# ---------------------------------------------------------------------------
# GET /doctor/patient/{encounter_id}/entities
# ---------------------------------------------------------------------------
@router.get("/patient/{encounter_id}/entities", response_model=List[EntityDetail])
def get_entities(
    encounter_id: str,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns ALL extracted entities for an encounter, ordered by field name.
    Useful for the doctor review panel to show all facts at once.
    """
    encounter = get_encounter_for_doctor(encounter_id, doctor, db)

    entities = (
        db.query(ExtractedEntity)
        .filter(ExtractedEntity.encounter_id == encounter.id)
        .order_by(ExtractedEntity.field_name.asc())
        .all()
    )
    return [_entity_to_detail(e) for e in entities]


# ---------------------------------------------------------------------------
# PATCH /doctor/entity/{entity_id}/verify
# ---------------------------------------------------------------------------
@router.patch("/entity/{entity_id}/verify", response_model=VerifyResponse)
def verify(
    entity_id: str,
    payload: VerifyRequest,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    The SOLE endpoint that transitions an entity from UNREVIEWED to
    ACCEPTED / EDITED / REJECTED (via backend/services/verification.py).

    Authorization:
      - Doctor must own the encounter (encounter.doctor_user_id == doctor.id).
      - Patients cannot call this endpoint (403 at auth guard).
      - Wrong doctor → 404.

    State machine:
      UNREVIEWED ──accept──► ACCEPTED
      UNREVIEWED ──edit───►  EDITED   (new_value required)
      UNREVIEWED ──reject──► REJECTED
      Any state   ──[re-action]──► any other (doctors can correct themselves)
    """
    entity, encounter = get_entity_for_doctor(entity_id, doctor, db)
    require_not_completed(encounter)

    audit = verify_entity(
        entity=entity,
        action=payload.action,
        new_value=payload.new_value,
        doctor=doctor,
        db=db,
    )
    db.flush()

    return VerifyResponse(
        entity_id=entity.id,
        field_name=entity.field_name,
        action=payload.action,
        verification_status=entity.verification_status.value,
        value=entity.value,
        original_ai_value=entity.original_ai_value,
        reviewed_by=entity.reviewed_by,
        reviewed_at=entity.reviewed_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# POST /doctor/encounter/{encounter_id}/finalize
# ---------------------------------------------------------------------------
@router.post("/encounter/{encounter_id}/finalize", response_model=FinalizeResponse)
def finalize(
    encounter_id: str,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Finalizes a clinically-reviewed encounter.

    Rules:
      - Encounter must be assigned to this doctor.
      - Encounter must be in ready_for_review state.
      - Already-completed encounters → 409 (prevents double finalization).
      - Creates an immutable AuditLog entry.

    After finalization, encounter.queue_status = 'completed'.
    No further verification can be performed on a completed encounter.
    """
    encounter = get_encounter_for_doctor(encounter_id, doctor, db)
    require_ready_for_review(encounter)

    # Count entity review stats for the response
    all_entities = (
        db.query(ExtractedEntity)
        .filter(ExtractedEntity.encounter_id == encounter.id)
        .all()
    )
    reviewed_count = sum(
        1 for e in all_entities
        if e.verification_status != VerificationStatus.unreviewed
    )
    unreviewed_count = len(all_entities) - reviewed_count

    audit = finalize_encounter(encounter=encounter, doctor=doctor, db=db)
    db.flush()

    return FinalizeResponse(
        encounter_id=encounter.id,
        status="completed",
        finalized_by=doctor.id,
        audit_log_id=audit.id,
        reviewed_entity_count=reviewed_count,
        unreviewed_entity_count=unreviewed_count,
    )


# ---------------------------------------------------------------------------
# GET /doctor/dashboard/stats
# ---------------------------------------------------------------------------
@router.get("/dashboard/stats", response_model=DoctorStats)
def doctor_stats(
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns aggregate counts of this doctor's assigned encounters by status.
    Used for the dashboard overview cards.
    """
    awaiting = (
        db.query(Encounter)
        .filter(
            Encounter.doctor_user_id == doctor.id,
            Encounter.queue_status == EncounterStatus.ready_for_review,
        )
        .count()
    )
    in_rev = (
        db.query(Encounter)
        .filter(
            Encounter.doctor_user_id == doctor.id,
            Encounter.queue_status.in_([
                EncounterStatus.intake_in_progress,
                EncounterStatus.submitted,
            ]),
        )
        .count()
    )
    done = (
        db.query(Encounter)
        .filter(
            Encounter.doctor_user_id == doctor.id,
            Encounter.queue_status == EncounterStatus.completed,
        )
        .count()
    )
    return DoctorStats(awaiting_review=awaiting, in_review=in_rev, completed=done)


# ---------------------------------------------------------------------------
# GET /doctor/patients/search?patient_uid={uid}
# ---------------------------------------------------------------------------
@router.get("/patients/search", response_model=PatientSearchResult)
def search_patient(
    patient_uid: str,
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Looks up a patient by their Patient.id (UUID / patient UID) or an Encounter ID (consultation token).

    Authorization: the doctor must have at least one encounter assigned to them
    for this patient (encounter.patient_id == patient.id AND
    encounter.doctor_user_id == doctor.id). Otherwise returns 404.

    This prevents UID-based enumeration of the entire patient database.
    Patient UID is an identifier, not an access credential.
    """
    clean_uid = patient_uid.strip().lower()

    # 1. Look up patient by canonical patient ID
    patient = db.query(Patient).filter(Patient.id == clean_uid).first()
    matched_encounter = None

    # 2. Look up patient by encounter ID (consultation token / encounter UID)
    if patient is None:
        matched_encounter = db.query(Encounter).filter(Encounter.id == clean_uid).first()
        if matched_encounter and matched_encounter.patient:
            patient = matched_encounter.patient

    # 3. Look up patient by User ID
    if patient is None:
        patient = db.query(Patient).filter(Patient.user_id == clean_uid).first()

    # 4. Look up patient by hospital_identifier if available
    if patient is None and hasattr(Patient, "hospital_identifier"):
        patient = db.query(Patient).filter(Patient.hospital_identifier == clean_uid).first()

    if patient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No authorized patient found for this UID.",
        )

    # Verify authorization: at least one encounter for this patient is assigned to this doctor
    authorized_encounters = (
        db.query(Encounter)
        .filter(
            Encounter.patient_id == patient.id,
            Encounter.doctor_user_id == doctor.id,
        )
        .order_by(Encounter.updated_at.desc())
        .all()
    )
    if not authorized_encounters:
        # Doctor has no assigned encounter for this patient — 404 (anti-enumeration)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No authorized patient found for this UID.",
        )

    # Prioritize matched encounter at the top if specific encounter was searched
    if matched_encounter and matched_encounter in authorized_encounters:
        authorized_encounters = [matched_encounter] + [e for e in authorized_encounters if e.id != matched_encounter.id]

    encounter_summaries: List[EncounterSummary] = []
    for enc in authorized_encounters:
        total = (
            db.query(ExtractedEntity)
            .filter(ExtractedEntity.encounter_id == enc.id)
            .count()
        )
        unreviewed = (
            db.query(ExtractedEntity)
            .filter(
                ExtractedEntity.encounter_id == enc.id,
                ExtractedEntity.verification_status == VerificationStatus.unreviewed,
            )
            .count()
        )
        encounter_summaries.append(EncounterSummary(
            encounter_id=enc.id,
            queue_status=enc.queue_status.value,
            opd_department=enc.opd_department,
            submitted_at=enc.updated_at.isoformat() if enc.queue_status in (
                EncounterStatus.ready_for_review, EncounterStatus.completed
            ) else None,
            total_entities=total,
            unreviewed_count=unreviewed,
        ))

    return PatientSearchResult(
        patient_id=patient.id,
        patient_name=patient.full_name,
        date_of_birth=patient.date_of_birth,
        gender=patient.gender,
        preferred_language=patient.preferred_language,
        encounters=encounter_summaries,
    )


# ---------------------------------------------------------------------------
# GET /doctor/available
# ---------------------------------------------------------------------------
@router.get("/available", response_model=List[AvailableEncounterItem])
def available_encounters(
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns ready_for_review encounters not yet assigned to any doctor.
    Any authorized doctor can self-assign from this pool via
    POST /doctor/encounter/{id}/assign.

    Note: In production, hospital scheduling systems would filter by department
    and hospital. For now, the full unassigned pool is returned.
    """
    encounters = (
        db.query(Encounter)
        .filter(
            Encounter.queue_status == EncounterStatus.ready_for_review,
            Encounter.doctor_user_id.is_(None),
        )
        .order_by(Encounter.updated_at.desc())
        .all()
    )
    result: List[AvailableEncounterItem] = []
    for enc in encounters:
        patient: Patient = enc.patient
        patient_name = patient.full_name if patient else "Unknown"
        total = (
            db.query(ExtractedEntity)
            .filter(ExtractedEntity.encounter_id == enc.id)
            .count()
        )
        result.append(AvailableEncounterItem(
            encounter_id=enc.id,
            patient_name=patient_name,
            opd_department=enc.opd_department,
            queue_status=enc.queue_status.value,
            created_at=enc.created_at.isoformat(),
            updated_at=enc.updated_at.isoformat(),
            total_entities=total,
        ))
    return result


# ---------------------------------------------------------------------------
# GET /doctor/patients/recommended
# ---------------------------------------------------------------------------
@router.get("/patients/recommended", response_model=List[RecommendedItem])
def recommended_patients(
    doctor: User = Depends(_require_doctor),
    db: Session = Depends(get_db),
):
    """
    Returns a prioritized work-queue list for the doctor.

    Priority order (all server-side authorized — no frontend filtering):
      1. Assigned encounters in ready_for_review (awaiting doctor action)
      2. Assigned encounters with unreviewed entities (needs attention)
      3. Unassigned ready_for_review encounters (claimable pool)

    Returns at most 10 items. Never exposes encounters the doctor is not
    authorized to access.
    """
    recommended: List[RecommendedItem] = []
    seen_encounter_ids: set = set()

    # Priority 1: Assigned + awaiting review
    awaiting = (
        db.query(Encounter)
        .filter(
            Encounter.doctor_user_id == doctor.id,
            Encounter.queue_status == EncounterStatus.ready_for_review,
        )
        .order_by(Encounter.updated_at.desc())
        .limit(5)
        .all()
    )
    for enc in awaiting:
        if enc.id in seen_encounter_ids:
            continue
        seen_encounter_ids.add(enc.id)
        patient: Patient = enc.patient
        recommended.append(RecommendedItem(
            encounter_id=enc.id,
            patient_id=enc.patient_id,
            patient_name=patient.full_name if patient else "Unknown",
            opd_department=enc.opd_department,
            queue_status=enc.queue_status.value,
            updated_at=enc.updated_at.isoformat(),
            reason="Assigned to you — awaiting review",
        ))

    # Priority 2: Assigned encounters with unreviewed entities (not already added)
    if len(recommended) < 10:
        with_unreviewed = (
            db.query(Encounter)
            .filter(
                Encounter.doctor_user_id == doctor.id,
                Encounter.queue_status != EncounterStatus.completed,
            )
            .order_by(Encounter.updated_at.desc())
            .all()
        )
        for enc in with_unreviewed:
            if enc.id in seen_encounter_ids:
                continue
            unreviewed_count = (
                db.query(ExtractedEntity)
                .filter(
                    ExtractedEntity.encounter_id == enc.id,
                    ExtractedEntity.verification_status == VerificationStatus.unreviewed,
                )
                .count()
            )
            if unreviewed_count > 0:
                seen_encounter_ids.add(enc.id)
                patient: Patient = enc.patient
                recommended.append(RecommendedItem(
                    encounter_id=enc.id,
                    patient_id=enc.patient_id,
                    patient_name=patient.full_name if patient else "Unknown",
                    opd_department=enc.opd_department,
                    queue_status=enc.queue_status.value,
                    updated_at=enc.updated_at.isoformat(),
                    reason=f"{unreviewed_count} unreviewed field(s) need attention",
                ))
                if len(recommended) >= 10:
                    break

    # Priority 3: Unassigned pool (claimable)
    if len(recommended) < 10:
        pool = (
            db.query(Encounter)
            .filter(
                Encounter.queue_status == EncounterStatus.ready_for_review,
                Encounter.doctor_user_id.is_(None),
            )
            .order_by(Encounter.updated_at.desc())
            .limit(10 - len(recommended))
            .all()
        )
        for enc in pool:
            if enc.id in seen_encounter_ids:
                continue
            seen_encounter_ids.add(enc.id)
            patient: Patient = enc.patient
            recommended.append(RecommendedItem(
                encounter_id=enc.id,
                patient_id=enc.patient_id,
                patient_name=patient.full_name if patient else "Unknown",
                opd_department=enc.opd_department,
                queue_status=enc.queue_status.value,
                updated_at=enc.updated_at.isoformat(),
                reason="Recently submitted pre-consultation",
            ))

    return recommended[:10]
