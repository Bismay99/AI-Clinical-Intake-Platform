"""
tests/test_document_deletion.py

Production-quality clinical safety tests for Patient Document Center document deletion:
  - Scenario A: Patient deletes own uploaded document -> 200 OK, document record removed from DB.
  - Scenario B: Patient cannot delete another patient's document -> 404 Not Found (anti-enumeration).
  - Scenario C: Unauthenticated request -> 401 Unauthorized.
  - Scenario D: Doctor role attempts deletion via patient endpoint -> 403 Forbidden.
  - Scenario E: Non-existent document ID -> 404 Not Found.
  - Scenario F: Physical storage file deleted from disk after commit.
  - Scenario G: Extracted entities originating from document are deleted; intake entities preserved.
  - Scenario H: Pre-consultation report no longer reflects deleted document entities.
  - Scenario I: Provenance test - clinical facts supported by intake session remain intact.
  - Scenario J: Immutability guard - completed consultation (queue_status == 'completed') cannot be deleted -> 409 Conflict.
  - Scenario K: Clinical verification guard - document with doctor-reviewed entity (accepted/edited/rejected) cannot be deleted -> 409 Conflict.
  - Scenario L: Dashboard metrics document count decrements by 1.
  - Scenario M: Immutable AuditLog entry created with action="document.delete".
  - Scenario N: Background worker race condition test - if document deleted before worker persists entities, worker aborts cleanly.
"""

import io
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.document import Document
from backend.models.clinical_summary import ClinicalSummary
from backend.models.extracted_entity import ExtractedEntity, SourceType, VerificationStatus
from backend.models.timeline_event import TimelineEvent
from backend.models.audit_log import AuditLog
from backend.models.encounter import Encounter, EncounterStatus
from backend.routers.intake import process_document_background
from backend.config import settings


def _register_login(client: TestClient, email: str, password: str, role: str) -> dict:
    r = client.post("/auth/register", json={
        "email": email, "password": password, "full_name": "Test User", "role": role,
    })
    assert r.status_code == 201, f"Register failed: {r.json()}"
    r2 = client.post("/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200
    d = r2.json()
    return {"token": d["access_token"], "user_id": d["user_id"],
            "headers": {"Authorization": f"Bearer {d['access_token']}"}}


def _create_patient_and_encounter(client: TestClient, suffix: str) -> dict:
    p = _register_login(client, f"pt_del_{suffix}@test.com", "password123", "patient")
    client.post("/patients/profile",
                json={"full_name": f"Patient {suffix}", "preferred_language": "en"},
                headers=p["headers"])
    r = client.post("/encounters", json={"opd_department": "General OPD"}, headers=p["headers"])
    assert r.status_code == 201
    return {**p, "encounter_id": r.json()["id"]}


def _upload_test_document(client: TestClient, patient_chain: dict, doc_type: str = "prescription") -> dict:
    enc_id = patient_chain["encounter_id"]
    h = patient_chain["headers"]
    file_bytes = b"%PDF-1.4 simulated test medical report bytes for deletion testing"
    r = client.post(
        "/intake/document/upload",
        data={"encounter_id": enc_id, "document_type": doc_type},
        files={"file": (f"{doc_type}_test.pdf", io.BytesIO(file_bytes), "application/pdf")},
        headers=h,
    )
    assert r.status_code in (200, 201), f"Upload failed: {r.json()}"
    return r.json()


def test_scenario_a_patient_deletes_own_document(client: TestClient, db: Session):
    """Patient can successfully delete their own uploaded document."""
    p = _create_patient_and_encounter(client, "a")
    up_res = _upload_test_document(client, p)
    doc_id = up_res["document_id"]

    # Verify document exists in DB
    doc_before = db.query(Document).filter(Document.id == doc_id).first()
    assert doc_before is not None

    # Delete the document
    del_res = client.delete(f"/patients/documents/{doc_id}", headers=p["headers"])
    assert del_res.status_code == 200
    body = del_res.json()
    assert body["ok"] is True
    assert body["document_id"] == doc_id
    assert "deleted" in body["message"].lower()

    # Verify document is gone from DB
    db.expire_all()
    doc_after = db.query(Document).filter(Document.id == doc_id).first()
    assert doc_after is None


def test_scenario_b_anti_enumeration_other_patient_returns_404(client: TestClient):
    """Patient cannot delete another patient's document; returns 404 (not 403) to prevent ID enumeration."""
    p1 = _create_patient_and_encounter(client, "b1")
    p2 = _create_patient_and_encounter(client, "b2")

    doc1 = _upload_test_document(client, p1)
    doc_id = doc1["document_id"]

    # Patient 2 tries to delete Patient 1's document
    res = client.delete(f"/patients/documents/{doc_id}", headers=p2["headers"])
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_scenario_c_unauthenticated_returns_401(client: TestClient):
    """Unauthenticated delete request returns 401."""
    res = client.delete("/patients/documents/00000000-0000-0000-0000-000000000000")
    assert res.status_code == 401


def test_scenario_d_doctor_role_returns_403(client: TestClient):
    """Doctor role cannot call patient document deletion endpoint."""
    p = _create_patient_and_encounter(client, "d_p")
    doc = _upload_test_document(client, p)

    dr = _register_login(client, "dr_del_test@test.com", "password123", "doctor")
    res = client.delete(f"/patients/documents/{doc['document_id']}", headers=dr["headers"])
    assert res.status_code == 403


def test_scenario_e_nonexistent_document_returns_404(client: TestClient):
    """Nonexistent document ID returns 404."""
    p = _create_patient_and_encounter(client, "e")
    res = client.delete("/patients/documents/12345678-1234-1234-1234-123456789abc", headers=p["headers"])
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_scenario_f_physical_file_deleted_from_disk(client: TestClient, db: Session):
    """Physical storage file on disk is deleted after database commit."""
    p = _create_patient_and_encounter(client, "f")
    doc = _upload_test_document(client, p)
    doc_id = doc["document_id"]

    doc_row = db.query(Document).filter(Document.id == doc_id).first()
    assert doc_row is not None
    file_path = doc_row.storage_ref

    # Confirm the physical file exists
    assert os.path.exists(file_path), f"File {file_path} should exist on disk"

    # Delete via API
    res = client.delete(f"/patients/documents/{doc_id}", headers=p["headers"])
    assert res.status_code == 200

    # Confirm the physical file is gone from disk
    assert not os.path.exists(file_path), f"File {file_path} should have been removed from disk"


def test_scenario_g_h_i_provenance_and_cascade_entity_deletion(client: TestClient, db: Session):
    """
    Extracted entities tied to document are deleted.
    Extracted entities from intake turns are preserved.
    Summary is refreshed.
    """
    p = _create_patient_and_encounter(client, "ghi")
    enc_id = p["encounter_id"]
    h = p["headers"]

    # 1. Start intake and record an intake turn entity
    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    assert r_start.status_code == 201
    sess_id = r_start.json()["session_id"]
    first_field = r_start.json()["first_question_field_name"]

    client.post("/intake/turn", json={
        "session_id": sess_id, "encounter_id": enc_id,
        "touch_answer": "severe retrosternal squeezing chest pain",
        "answering_field_name": first_field,
    }, headers=h)

    # 2. Upload document which generates a document entity
    doc_res = _upload_test_document(client, p, "lab_report")
    doc_id = doc_res["document_id"]

    # Verify we have entities in DB
    db.expire_all()
    intake_ents = db.query(ExtractedEntity).filter(
        ExtractedEntity.encounter_id == enc_id,
        ExtractedEntity.source_type == SourceType.intake_session,
    ).all()
    assert len(intake_ents) >= 1

    doc_ents = db.query(ExtractedEntity).filter(
        ExtractedEntity.encounter_id == enc_id,
        ExtractedEntity.document_id == doc_id,
    ).all()
    assert len(doc_ents) >= 1

    # Submit intake to generate clinical summary
    client.post("/intake/submit", json={"session_id": sess_id, "encounter_id": enc_id}, headers=h)

    # Check report before deletion has document entities
    r_rep1 = client.get(f"/patients/reports/{enc_id}", headers=h)
    assert r_rep1.status_code == 200
    rep1_data = r_rep1.json()
    assert len(rep1_data["documents"]) == 1

    # Delete the document
    del_res = client.delete(f"/patients/documents/{doc_id}", headers=h)
    assert del_res.status_code == 200

    db.expire_all()

    # Document entities MUST be deleted
    remaining_doc_ents = db.query(ExtractedEntity).filter(
        ExtractedEntity.document_id == doc_id
    ).all()
    assert len(remaining_doc_ents) == 0

    # Intake turn entities MUST still be preserved!
    remaining_intake_ents = db.query(ExtractedEntity).filter(
        ExtractedEntity.encounter_id == enc_id,
        ExtractedEntity.source_type == SourceType.intake_session,
    ).all()
    assert len(remaining_intake_ents) >= 1

    # Check report after deletion
    r_rep2 = client.get(f"/patients/reports/{enc_id}", headers=h)
    assert r_rep2.status_code == 200
    rep2_data = r_rep2.json()
    assert len(rep2_data["documents"]) == 0
    # The intake entity remains in report
    assert len(rep2_data["extracted_entities"]) >= 1


def test_scenario_j_completed_encounter_cannot_be_deleted(client: TestClient, db: Session):
    """If consultation is completed (queue_status == 'completed'), document cannot be deleted (409 Conflict)."""
    p = _create_patient_and_encounter(client, "j")
    enc_id = p["encounter_id"]
    doc = _upload_test_document(client, p)
    doc_id = doc["document_id"]

    # Mark encounter as completed
    enc = db.query(Encounter).filter(Encounter.id == enc_id).first()
    enc.queue_status = EncounterStatus.completed
    db.commit()

    # Attempt deletion
    res = client.delete(f"/patients/documents/{doc_id}", headers=p["headers"])
    assert res.status_code == 409
    assert "completed consultation and cannot be deleted" in res.json()["detail"]


def test_scenario_k_verified_entity_cannot_be_deleted(client: TestClient, db: Session):
    """If any extracted entity from this document was reviewed by a clinician (accepted/edited/rejected), returns 409 Conflict."""
    p = _create_patient_and_encounter(client, "k")
    doc = _upload_test_document(client, p)
    doc_id = doc["document_id"]

    # Mark one of its entities as accepted
    ent = db.query(ExtractedEntity).filter(ExtractedEntity.document_id == doc_id).first()
    assert ent is not None
    ent.verification_status = VerificationStatus.accepted
    db.commit()

    # Attempt deletion
    res = client.delete(f"/patients/documents/{doc_id}", headers=p["headers"])
    assert res.status_code == 409
    assert "already been reviewed by a clinician" in res.json()["detail"]


def test_scenario_l_dashboard_metrics_count_decrements(client: TestClient):
    """Dashboard metrics documents_count decrements by 1 after document deletion."""
    p = _create_patient_and_encounter(client, "l")
    doc1 = _upload_test_document(client, p, "prescription")
    doc2 = _upload_test_document(client, p, "lab_report")

    # Check metrics
    m1 = client.get("/patients/dashboard/metrics", headers=p["headers"]).json()
    assert m1["documents_count"] == 2

    # Delete one document
    res = client.delete(f"/patients/documents/{doc1['document_id']}", headers=p["headers"])
    assert res.status_code == 200

    # Check metrics again
    m2 = client.get("/patients/dashboard/metrics", headers=p["headers"]).json()
    assert m2["documents_count"] == 1


def test_scenario_m_audit_log_created(client: TestClient, db: Session):
    """An immutable AuditLog record with action 'document.delete' is created."""
    p = _create_patient_and_encounter(client, "m")
    doc = _upload_test_document(client, p)
    doc_id = doc["document_id"]

    res = client.delete(f"/patients/documents/{doc_id}", headers=p["headers"])
    assert res.status_code == 200

    db.expire_all()
    audit = db.query(AuditLog).filter(
        AuditLog.action == "document.delete",
        AuditLog.target_entity_id == doc_id,
    ).first()
    assert audit is not None
    assert audit.user_id == p["user_id"]
    assert audit.target_entity_type == "document"
    assert doc_id in audit.detail


def test_scenario_n_background_worker_race_condition(client: TestClient, db: Session):
    """
    Race condition guard: If a document is deleted while background worker is running,
    process_document_background safely aborts before persisting draft entities.
    """
    # Create patient & encounter
    p_user = _create_patient_and_encounter(client, "race_cond")
    enc_id = p_user["encounter_id"]

    temp_path = os.path.join(settings.upload_dir, "test_race_doc.txt")
    with open(temp_path, "wb") as f:
        f.write(b"Simulated document content for race condition test")

    doc = Document(
        encounter_id=enc_id,
        document_type="prescription",
        original_filename="race_test.txt",
        storage_ref=temp_path,
        file_size=len(b"Simulated document content for race condition test"),
        mime_type="text/plain",
        processing_status="processing",
    )
    db.add(doc)
    db.commit()

    doc_id = doc.id

    # Now delete the document from DB before the background job runs its DB persistence check
    db.delete(doc)
    db.commit()

    # Run the background worker function directly
    # It should detect that the document no longer exists and abort cleanly without raising an unhandled error
    process_document_background(
        document_id=doc_id,
        encounter_id=enc_id,
        document_type="prescription",
        file_bytes=b"%PDF-1.4 simulated bytes",
        language_hint="en",
    )

    # Verify no entities were persisted for this deleted document
    entities = db.query(ExtractedEntity).filter(ExtractedEntity.document_id == doc_id).all()
    assert len(entities) == 0

    if os.path.exists(temp_path):
        os.remove(temp_path)
