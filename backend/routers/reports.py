"""
backend/routers/reports.py

Patient-facing read endpoints for Pre-Consultation Reports, Documents, and Dashboard Metrics.

Endpoints:
  GET /patients/reports              -- list all completed/ready reports for current patient
  GET /patients/reports/{encounter_id} -- get detailed structured pre-consultation report
  GET /patients/documents            -- list all documents uploaded by current patient
  GET /patients/dashboard/metrics    -- get authoritative counts for patient dashboard

Ownership:
  - Every endpoint requires an authenticated patient JWT.
  - Ownership is strictly enforced: JWT -> current_user -> Patient -> Encounter.
  - Querying an encounter that does not belong to the patient returns 404 (never 403, preventing enumeration).
  - No LLM call is made: this router is a clean read view over existing canonical DB records.
"""

from datetime import datetime
from typing import List, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.user import User, UserRole
from backend.models.patient import Patient
from backend.models.encounter import Encounter, EncounterStatus
from backend.models.intake_session import IntakeSession
from backend.models.extracted_entity import ExtractedEntity, VerificationStatus
from backend.models.clinical_summary import ClinicalSummary
from backend.models.timeline_event import TimelineEvent
from backend.models.document import Document
from backend.auth.dependencies import get_current_user
from backend.services.ownership import (
    get_patient_for_user,
    get_encounter_for_patient,
    resolve_patient_encounter,
)
from backend.schemas.report import (
    PatientReportSummaryItem,
    PatientReportDetailResponse,
    PatientEntityEvidence,
    PatientDocumentItem,
    PatientTimelineItem,
    PatientMissingField,
    PatientDashboardMetrics,
)
from ai_orchestration.clinical_schema import get_schema

router = APIRouter(prefix="/patients", tags=["patient-reports"])


def _require_patient_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.patient:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only patient users can access patient report endpoints.",
        )
    return current_user


# Human-friendly labels for schema field names
FIELD_LABELS: Dict[str, str] = {
    "chief_complaint": "Chief Complaint",
    "onset": "Onset / Duration",
    "duration": "Duration",
    "exertion_related": "Aggravated by Exertion / Activity",
    "radiation": "Radiation of Pain",
    "associated_symptoms": "Associated Symptoms",
    "medical_history": "Past Medical History",
    "medications": "Current Medications",
    "allergies": "Known Allergies",
    "family_history": "Family Medical History",
    "social_history": "Lifestyle / Social History",
    "prakriti": "Body Constitution (Prakriti)",
    "vikriti": "Current Imbalance (Vikriti)",
    "agni": "Digestive Strength (Agni)",
    "koshtha": "Bowel Habit (Koshtha)",
    "ahara_vihara": "Diet and Routine (Ahara/Vihara)",
    "nidana": "Etiology / Trigger (Nidana)",
    "samprapti": "Pathogenesis (Samprapti)",
}


def _get_doctor_review_status(encounter: Encounter, entities: List[ExtractedEntity]) -> str:
    """Derive doctor review status string based on encounter queue status and entity verification."""
    if encounter.queue_status == EncounterStatus.completed:
        return "Doctor Reviewed and Finalized"
    
    has_reviewed_entity = any(
        e.verification_status in (VerificationStatus.accepted, VerificationStatus.edited, VerificationStatus.rejected)
        for e in entities
    )
    if has_reviewed_entity:
        return "Doctor Review in Progress"
    return "Awaiting Doctor Review"


@router.get("/reports", response_model=List[PatientReportSummaryItem])
def list_patient_reports(
    current_user: User = Depends(_require_patient_user),
    db: Session = Depends(get_db),
):
    patient = get_patient_for_user(current_user, db)

    encounters = (
        db.query(Encounter)
        .filter(
            Encounter.patient_id == patient.id,
            Encounter.queue_status.in_([EncounterStatus.ready_for_review, EncounterStatus.completed]),
        )
        .order_by(Encounter.created_at.desc())
        .all()
    )

    items: List[PatientReportSummaryItem] = []
    for enc in encounters:
        summary = (
            db.query(ClinicalSummary)
            .filter(ClinicalSummary.encounter_id == enc.id)
            .first()
        )
        entities = (
            db.query(ExtractedEntity)
            .filter(ExtractedEntity.encounter_id == enc.id)
            .all()
        )
        unreviewed = sum(1 for e in entities if e.verification_status == VerificationStatus.unreviewed)
        review_status = _get_doctor_review_status(enc, entities)

        items.append(
            PatientReportSummaryItem(
                encounter_id=enc.id,
                patient_id=patient.id,
                opd_department=enc.opd_department or "General OPD",
                consultation_date=enc.created_at.strftime("%B %d, %Y"),
                queue_status=enc.queue_status.value,
                doctor_review_status=review_status,
                has_summary=summary is not None,
                total_entities=len(entities),
                unreviewed_count=unreviewed,
                summary_preview=summary.summary_text[:160] + "..." if summary and len(summary.summary_text) > 160 else (summary.summary_text if summary else None),
            )
        )

    return items


@router.get("/reports/{encounter_id}", response_model=PatientReportDetailResponse)
def get_patient_report(
    encounter_id: str,
    current_user: User = Depends(_require_patient_user),
    db: Session = Depends(get_db),
):
    patient, encounter = resolve_patient_encounter(encounter_id, current_user, db)

    summary = (
        db.query(ClinicalSummary)
        .filter(ClinicalSummary.encounter_id == encounter.id)
        .first()
    )

    entities = (
        db.query(ExtractedEntity)
        .filter(ExtractedEntity.encounter_id == encounter.id)
        .order_by(ExtractedEntity.created_at.asc())
        .all()
    )

    session = (
        db.query(IntakeSession)
        .filter(IntakeSession.encounter_id == encounter.id)
        .order_by(IntakeSession.created_at.desc())
        .first()
    )
    schema_id = session.schema_id if session else "allopathic_chest_pain_v1"

    documents = (
        db.query(Document)
        .filter(Document.encounter_id == encounter.id)
        .order_by(Document.upload_timestamp.desc())
        .all()
    )

    timeline_events = (
        db.query(TimelineEvent)
        .filter(TimelineEvent.encounter_id == encounter.id)
        .order_by(TimelineEvent.date_uncertain.asc(), TimelineEvent.date.asc())
        .all()
    )

    chief_complaint = None
    hpi_details: Dict[str, str] = {}
    medical_history: List[str] = []
    medications: List[str] = []
    allergies: List[str] = []
    other_history: Dict[str, str] = {}

    captured_field_names = set()
    entity_evidence_list: List[PatientEntityEvidence] = []

    for e in entities:
        captured_field_names.add(e.field_name)
        val = e.value.strip()

        if e.field_name == "chief_complaint":
            chief_complaint = val
        elif e.field_name in ("onset", "duration", "exertion_related", "radiation", "associated_symptoms"):
            hpi_details[FIELD_LABELS.get(e.field_name, e.field_name)] = val
        elif "medication" in e.field_name:
            medications.append(val)
        elif "allerg" in e.field_name:
            allergies.append(val)
        elif "medical_history" in e.field_name or "past_history" in e.field_name:
            medical_history.append(val)
        else:
            other_history[FIELD_LABELS.get(e.field_name, e.field_name)] = val

        entity_evidence_list.append(
            PatientEntityEvidence(
                field_name=e.field_name,
                label=FIELD_LABELS.get(e.field_name, e.field_name.replace("_", " ").title()),
                value=e.value,
                original_ai_value=e.original_ai_value,
                confidence=round(e.confidence, 2),
                low_confidence_flag=e.low_confidence_flag,
                verification_status=e.verification_status.value,
                source_type=e.source_type.value,
                source_location=e.source_location,
                reviewed_by=e.reviewed_by,
                reviewed_at=e.reviewed_at.isoformat() if e.reviewed_at else None,
            )
        )

    missing_fields: List[PatientMissingField] = []
    try:
        schema = get_schema(schema_id)
        for sf in schema.fields:
            if sf.field_name not in captured_field_names:
                missing_fields.append(
                    PatientMissingField(
                        field_name=sf.field_name,
                        label=FIELD_LABELS.get(sf.field_name, sf.field_name.replace("_", " ").title()),
                        status="Not provided",
                    )
                )
    except Exception:
        standard_fields = ["chief_complaint", "onset", "exertion_related", "radiation", "associated_symptoms", "medications", "allergies"]
        for f in standard_fields:
            if f not in captured_field_names:
                missing_fields.append(
                    PatientMissingField(
                        field_name=f,
                        label=FIELD_LABELS.get(f, f.replace("_", " ").title()),
                        status="Not provided",
                    )
                )

    doc_items: List[PatientDocumentItem] = []
    for d in documents:
        doc_entities_count = sum(1 for ent in entities if ent.document_id == d.id)
        doc_items.append(
            PatientDocumentItem(
                id=d.id,
                encounter_id=d.encounter_id,
                document_type=d.document_type,
                original_filename=d.original_filename,
                upload_timestamp=d.upload_timestamp.strftime("%b %d, %Y %I:%M %p"),
                entity_count=doc_entities_count,
            )
        )

    timeline_items: List[PatientTimelineItem] = [
        PatientTimelineItem(
            id=t.id,
            event_type=t.event_type,
            date=t.date,
            date_confidence=round(t.date_confidence, 2),
            date_uncertain=t.date_uncertain,
            created_at=t.created_at.strftime("%b %d, %Y"),
        )
        for t in timeline_events
    ]

    review_status = _get_doctor_review_status(encounter, entities)

    return PatientReportDetailResponse(
        patient_id=patient.id,
        patient_name=patient.full_name,
        patient_uid=patient.id,
        encounter_id=encounter.id,
        opd_department=encounter.opd_department or "General OPD",
        consultation_date=encounter.created_at.strftime("%B %d, %Y"),
        created_at=encounter.created_at.isoformat(),
        queue_status=encounter.queue_status.value,
        doctor_review_status=review_status,
        doctor_user_id=encounter.doctor_user_id,
        summary_text=summary.summary_text if summary else "No clinical summary text recorded yet.",
        summary_generated_at=summary.generated_at.strftime("%b %d, %Y %I:%M %p") if summary else None,
        chief_complaint=chief_complaint,
        hpi_details=hpi_details,
        medical_history=medical_history,
        medications=medications,
        allergies=allergies,
        other_history=other_history,
        missing_fields=missing_fields,
        extracted_entities=entity_evidence_list,
        documents=doc_items,
        timeline=timeline_items,
    )


@router.get("/documents", response_model=List[PatientDocumentItem])
def list_patient_documents(
    current_user: User = Depends(_require_patient_user),
    db: Session = Depends(get_db),
):
    patient = get_patient_for_user(current_user, db)

    encounter_ids = [
        enc.id for enc in db.query(Encounter.id).filter(Encounter.patient_id == patient.id).all()
    ]
    if not encounter_ids:
        return []

    docs = (
        db.query(Document)
        .filter(Document.encounter_id.in_(encounter_ids))
        .order_by(Document.upload_timestamp.desc())
        .all()
    )

    items: List[PatientDocumentItem] = []
    for d in docs:
        count = (
            db.query(ExtractedEntity)
            .filter(ExtractedEntity.document_id == d.id)
            .count()
        )
        items.append(
            PatientDocumentItem(
                id=d.id,
                encounter_id=d.encounter_id,
                document_type=d.document_type,
                original_filename=d.original_filename,
                upload_timestamp=d.upload_timestamp.strftime("%b %d, %Y %I:%M %p"),
                entity_count=count,
            )
        )
    return items


@router.get("/dashboard/metrics", response_model=PatientDashboardMetrics)
def get_dashboard_metrics(
    current_user: User = Depends(_require_patient_user),
    db: Session = Depends(get_db),
):
    patient = get_patient_for_user(current_user, db)

    encounters = db.query(Encounter).filter(Encounter.patient_id == patient.id).all()
    encounter_ids = [e.id for e in encounters]

    consultations_count = len(encounters)
    reports_count = sum(
        1 for e in encounters if e.queue_status in (EncounterStatus.ready_for_review, EncounterStatus.completed)
    )

    documents_count = 0
    if encounter_ids:
        documents_count = (
            db.query(Document)
            .filter(Document.encounter_id.in_(encounter_ids))
            .count()
        )

    return PatientDashboardMetrics(
        consultations_count=consultations_count,
        documents_count=documents_count,
        reports_count=reports_count,
    )
