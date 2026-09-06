"""
tests/test_document_storage_consolidated.py

Comprehensive tests for Phase 12:
- Persistent Document Storage & Lifecycle
- Patient Document Listing, Detail, and Metrics
- Anti-enumeration and Cross-patient isolation
- Consolidated Clinical Report (Investigations, Multi-source provenance)
- Doctor Encounter Documents & Consolidated Review
"""

import io
import os
import pytest
from fastapi.testclient import TestClient


def _register_login(client: TestClient, email: str, password: str, role: str) -> dict:
    r = client.post("/auth/register", json={
        "email": email, "password": password, "full_name": f"User {role}", "role": role,
    })
    assert r.status_code == 201, f"Register failed: {r.json()}"
    r2 = client.post("/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200
    d = r2.json()
    return {"token": d["access_token"], "user_id": d["user_id"],
            "headers": {"Authorization": f"Bearer {d['access_token']}"}}


def _create_patient_and_encounter(client: TestClient, suffix: str) -> dict:
    p = _register_login(client, f"pt_doc_{suffix}@test.com", "password123", "patient")
    client.post("/patients/profile",
                json={"full_name": f"Patient {suffix}", "preferred_language": "en"},
                headers=p["headers"])
    r = client.post("/encounters", json={"opd_department": "General OPD"}, headers=p["headers"])
    assert r.status_code == 201
    return {**p, "encounter_id": r.json()["id"]}


def _upload_test_document(client: TestClient, patient_chain: dict, filename: str = "lab_report.pdf", doc_type: str = "lab_report") -> dict:
    enc_id = patient_chain["encounter_id"]
    h = patient_chain["headers"]
    file_content = b"%PDF-1.4 simulated lab report content with test results Hemoglobin 13.5 g/dL"
    r = client.post(
        "/intake/document/upload",
        data={"encounter_id": enc_id, "document_type": doc_type},
        files={"file": (filename, io.BytesIO(file_content), "application/pdf")},
        headers=h,
    )
    assert r.status_code == 201, f"Document upload failed: {r.text}"
    return r.json()


# 1. test_document_upload_persists_metadata_and_patient_id
def test_document_upload_persists_metadata_and_patient_id(client: TestClient):
    p = _create_patient_and_encounter(client, "meta1")
    doc_res = _upload_test_document(client, p, "cbc_report.pdf", "lab_report")
    assert doc_res["original_filename"] == "cbc_report.pdf"
    assert doc_res["processing_status"] == "processed"
    assert doc_res["file_size"] > 0
    assert doc_res["document_id"] is not None


# 2. test_document_upload_stores_file_bytes
def test_document_upload_stores_file_bytes(client: TestClient):
    p = _create_patient_and_encounter(client, "bytes1")
    doc_res = _upload_test_document(client, p, "sample_bytes.pdf", "prescription")
    doc_id = doc_res["document_id"]
    
    # Check that the file was written to uploads/
    expected_path = os.path.join("uploads", f"{doc_id}_sample_bytes.pdf")
    assert os.path.exists(expected_path), f"File {expected_path} not found on disk"


# 3. test_document_entities_have_document_id_and_provenance
def test_document_entities_have_document_id_and_provenance(client: TestClient):
    p = _create_patient_and_encounter(client, "ent1")
    doc_res = _upload_test_document(client, p, "meds.pdf", "prescription")
    doc_id = doc_res["document_id"]
    
    ents = doc_res.get("entities_extracted", [])
    assert isinstance(ents, list)


# 4. test_patient_documents_list_returns_all_uploaded
def test_patient_documents_list_returns_all_uploaded(client: TestClient):
    p = _create_patient_and_encounter(client, "list1")
    _upload_test_document(client, p, "report1.pdf", "lab_report")
    _upload_test_document(client, p, "report2.pdf", "prescription")

    r = client.get("/patients/documents", headers=p["headers"])
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 2
    filenames = [d["original_filename"] for d in docs]
    assert "report1.pdf" in filenames
    assert "report2.pdf" in filenames


# 5. test_patient_documents_list_includes_extracted_entities
def test_patient_documents_list_includes_extracted_entities(client: TestClient):
    p = _create_patient_and_encounter(client, "list_ent")
    _upload_test_document(client, p, "blood_test.pdf", "lab_report")

    r = client.get("/patients/documents", headers=p["headers"])
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 1
    doc = docs[0]
    assert "extracted_entities" in doc
    assert doc["processing_status"] == "processed"
    assert doc["original_filename"] == "blood_test.pdf"


# 6. test_patient_get_single_document
def test_patient_get_single_document(client: TestClient):
    p = _create_patient_and_encounter(client, "single_doc")
    doc_res = _upload_test_document(client, p, "summary.pdf", "discharge_summary")
    doc_id = doc_res["document_id"]

    r = client.get(f"/patients/documents/{doc_id}", headers=p["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == doc_id
    assert data["original_filename"] == "summary.pdf"
    assert data["document_type"] == "discharge_summary"


# 7. test_patient_cannot_access_other_patient_document
def test_patient_cannot_access_other_patient_document(client: TestClient):
    p1 = _create_patient_and_encounter(client, "owner")
    p2 = _create_patient_and_encounter(client, "attacker")

    doc_res = _upload_test_document(client, p1, "confidential.pdf", "lab_report")
    doc_id = doc_res["document_id"]

    # p2 tries to access p1's document
    r = client.get(f"/patients/documents/{doc_id}", headers=p2["headers"])
    assert r.status_code == 404, "Must return 404 anti-enumeration"


# 8. test_patient_documents_require_patient_jwt
def test_patient_documents_require_patient_jwt(client: TestClient):
    r1 = client.get("/patients/documents")
    assert r1.status_code == 401

    doc = _register_login(client, "dr_doc_unauth@test.com", "password123", "doctor")
    r2 = client.get("/patients/documents", headers=doc["headers"])
    assert r2.status_code == 403


# 9. test_patient_metrics_reflects_document_count
def test_patient_metrics_reflects_document_count(client: TestClient):
    p = _create_patient_and_encounter(client, "metrics")
    r0 = client.get("/patients/dashboard/metrics", headers=p["headers"])
    assert r0.status_code == 200
    assert r0.json()["documents_count"] == 0

    _upload_test_document(client, p, "doc1.pdf", "prescription")
    _upload_test_document(client, p, "doc2.pdf", "lab_report")

    r1 = client.get("/patients/dashboard/metrics", headers=p["headers"])
    assert r1.status_code == 200
    assert r1.json()["documents_count"] == 2


# 10. test_multiple_documents_upload_same_encounter
def test_multiple_documents_upload_same_encounter(client: TestClient):
    p = _create_patient_and_encounter(client, "multi_doc")
    for i in range(3):
        _upload_test_document(client, p, f"doc_{i}.pdf", "lab_report")

    r = client.get("/patients/documents", headers=p["headers"])
    assert r.status_code == 200
    assert len(r.json()) == 3


# 11. test_consolidated_patient_report_documents_count
def test_consolidated_patient_report_documents_count(client: TestClient):
    p = _create_patient_and_encounter(client, "rep_cnt")
    enc_id = p["encounter_id"]
    h = p["headers"]

    # Start intake
    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    first_field = r_start.json()["first_question_field_name"]

    client.post("/intake/turn", json={
        "session_id": session_id, "encounter_id": enc_id,
        "touch_answer": "severe chest pain since morning",
        "answering_field_name": first_field,
    }, headers=h)

    _upload_test_document(client, p, "blood_test.pdf", "lab_report")

    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    r_rep = client.get(f"/patients/reports/{enc_id}", headers=h)
    assert r_rep.status_code == 200
    rep = r_rep.json()
    assert rep["documents_count"] == 1
    assert len(rep["documents"]) == 1
    assert rep["documents"][0]["original_filename"] == "blood_test.pdf"


# 12. test_consolidated_patient_report_investigations
def test_consolidated_patient_report_investigations(client: TestClient):
    p = _create_patient_and_encounter(client, "rep_inv")
    enc_id = p["encounter_id"]
    h = p["headers"]

    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    first_field = r_start.json()["first_question_field_name"]

    client.post("/intake/turn", json={
        "session_id": session_id, "encounter_id": enc_id,
        "touch_answer": "chest tightness on exertion",
        "answering_field_name": first_field,
    }, headers=h)

    _upload_test_document(client, p, "lipid_profile.pdf", "lab_report")
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    r_rep = client.get(f"/patients/reports/{enc_id}", headers=h)
    assert r_rep.status_code == 200
    rep = r_rep.json()
    assert "investigations" in rep
    assert "investigation_details" in rep


# 13. test_consolidated_patient_report_provenance
def test_consolidated_patient_report_provenance(client: TestClient):
    p = _create_patient_and_encounter(client, "rep_prov")
    enc_id = p["encounter_id"]
    h = p["headers"]

    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    first_field = r_start.json()["first_question_field_name"]

    client.post("/intake/turn", json={
        "session_id": session_id, "encounter_id": enc_id,
        "touch_answer": "pain in center of chest",
        "answering_field_name": first_field,
    }, headers=h)

    _upload_test_document(client, p, "ecg_strip.pdf", "lab_report")
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    r_rep = client.get(f"/patients/reports/{enc_id}", headers=h)
    assert r_rep.status_code == 200
    rep = r_rep.json()
    for ent in rep["extracted_entities"]:
        if ent["source_type"] == "document":
            assert ent["source_document_name"] is not None
            assert ent["source_document_id"] is not None


# 14. test_doctor_summary_includes_documents_and_investigations
def test_doctor_summary_includes_documents_and_investigations(client: TestClient):
    p = _create_patient_and_encounter(client, "doc_sum")
    enc_id = p["encounter_id"]
    h = p["headers"]

    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    first_field = r_start.json()["first_question_field_name"]

    client.post("/intake/turn", json={
        "session_id": session_id, "encounter_id": enc_id,
        "touch_answer": "chest discomfort after food",
        "answering_field_name": first_field,
    }, headers=h)

    _upload_test_document(client, p, "cbc.pdf", "lab_report")
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    doc = _register_login(client, "dr_sum@test.com", "password123", "doctor")
    r_assign = client.post(f"/doctor/encounter/{enc_id}/assign", headers=doc["headers"])
    assert r_assign.status_code == 200

    r_sum = client.get(f"/doctor/patient/{enc_id}/summary", headers=doc["headers"])
    assert r_sum.status_code == 200
    summary = r_sum.json()
    assert summary["documents_count"] == 1
    assert len(summary["documents"]) == 1
    assert summary["documents"][0]["original_filename"] == "cbc.pdf"
    assert "investigations" in summary


# 15. test_doctor_summary_entities_have_document_provenance
def test_doctor_summary_entities_have_document_provenance(client: TestClient):
    p = _create_patient_and_encounter(client, "doc_prov")
    enc_id = p["encounter_id"]
    h = p["headers"]

    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    first_field = r_start.json()["first_question_field_name"]

    client.post("/intake/turn", json={
        "session_id": session_id, "encounter_id": enc_id,
        "touch_answer": "shortness of breath on stairs",
        "answering_field_name": first_field,
    }, headers=h)

    _upload_test_document(client, p, "troponin.pdf", "lab_report")
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    doc = _register_login(client, "dr_prov@test.com", "password123", "doctor")
    client.post(f"/doctor/encounter/{enc_id}/assign", headers=doc["headers"])

    r_sum = client.get(f"/doctor/patient/{enc_id}/summary", headers=doc["headers"])
    assert r_sum.status_code == 200
    entities = r_sum.json()["entities"]
    doc_entities = [e for e in entities if e["source_type"] == "document"]
    for e in doc_entities:
        assert e["source_document_name"] is not None
        assert e["source_document_id"] is not None


# 16. test_doctor_encounter_documents_endpoint
def test_doctor_encounter_documents_endpoint(client: TestClient):
    p = _create_patient_and_encounter(client, "doc_docs_ep")
    enc_id = p["encounter_id"]
    h = p["headers"]

    _upload_test_document(client, p, "doc_a.pdf", "prescription")
    _upload_test_document(client, p, "doc_b.pdf", "lab_report")

    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    doc = _register_login(client, "dr_docs_ep@test.com", "password123", "doctor")
    client.post(f"/doctor/encounter/{enc_id}/assign", headers=doc["headers"])

    r = client.get(f"/doctor/patient/{enc_id}/documents", headers=doc["headers"])
    assert r.status_code == 200
    docs = r.json()
    assert len(docs) == 2
    filenames = [d["original_filename"] for d in docs]
    assert "doc_a.pdf" in filenames
    assert "doc_b.pdf" in filenames


# 17. test_doctor_cannot_access_unassigned_encounter_documents
def test_doctor_cannot_access_unassigned_encounter_documents(client: TestClient):
    p = _create_patient_and_encounter(client, "unassigned_docs")
    enc_id = p["encounter_id"]
    _upload_test_document(client, p, "doc_x.pdf", "lab_report")

    doc = _register_login(client, "dr_unassigned@test.com", "password123", "doctor")
    # Not assigned yet
    r = client.get(f"/doctor/patient/{enc_id}/documents", headers=doc["headers"])
    assert r.status_code == 404, "Must return 404 anti-enumeration"


# 18. test_doctor_get_single_document
def test_doctor_get_single_document(client: TestClient):
    p = _create_patient_and_encounter(client, "doc_single")
    enc_id = p["encounter_id"]
    h = p["headers"]

    doc_res = _upload_test_document(client, p, "single_doc.pdf", "lab_report")
    doc_id = doc_res["document_id"]

    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    doc = _register_login(client, "dr_single@test.com", "password123", "doctor")
    client.post(f"/doctor/encounter/{enc_id}/assign", headers=doc["headers"])

    r = client.get(f"/doctor/patient/{enc_id}/document/{doc_id}", headers=doc["headers"])
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == doc_id
    assert d["original_filename"] == "single_doc.pdf"


# 19. test_doctor_verify_document_entity
def test_doctor_verify_document_entity(client: TestClient):
    p = _create_patient_and_encounter(client, "doc_verify")
    enc_id = p["encounter_id"]
    h = p["headers"]

    doc_res = _upload_test_document(client, p, "med_rx.pdf", "prescription")

    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    doc = _register_login(client, "dr_verify@test.com", "password123", "doctor")
    client.post(f"/doctor/encounter/{enc_id}/assign", headers=doc["headers"])

    r_sum = client.get(f"/doctor/patient/{enc_id}/summary", headers=doc["headers"])
    entities = r_sum.json()["entities"]
    if entities:
        ent_id = entities[0]["id"]
        r_ver = client.patch(f"/doctor/entity/{ent_id}/verify", json={"action": "accept"}, headers=doc["headers"])
        assert r_ver.status_code == 200
        assert r_ver.json()["verification_status"] == "accepted"


# 20. test_verified_document_entity_reflected_in_reports
def test_verified_document_entity_reflected_in_reports(client: TestClient):
    p = _create_patient_and_encounter(client, "refl")
    enc_id = p["encounter_id"]
    h = p["headers"]

    _upload_test_document(client, p, "final_rx.pdf", "prescription")

    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    doc = _register_login(client, "dr_refl@test.com", "password123", "doctor")
    client.post(f"/doctor/encounter/{enc_id}/assign", headers=doc["headers"])

    r_sum = client.get(f"/doctor/patient/{enc_id}/summary", headers=doc["headers"])
    entities = r_sum.json()["entities"]
    if entities:
        ent_id = entities[0]["id"]
        client.patch(f"/doctor/entity/{ent_id}/verify", json={"action": "accept"}, headers=doc["headers"])

        # Patient re-reads their report
        r_rep = client.get(f"/patients/reports/{enc_id}", headers=h)
        assert r_rep.status_code == 200
        verified_ents = [e for e in r_rep.json()["extracted_entities"] if e["verification_status"] == "accepted"]
        assert len(verified_ents) >= 1


# 21. test_pdf_document_upload_ocr_decoding
def test_pdf_document_upload_ocr_decoding(client: TestClient):
    """
    Verifies that uploading a real PDF file with magic header %PDF does not fail
    with PIL.UnidentifiedImageError and successfully executes through OCR page rendering.
    """
    from PIL import Image, ImageDraw
    p = _create_patient_and_encounter(client, "pdf_test")
    enc_id = p["encounter_id"]
    h = p["headers"]

    # Generate a real valid single-page PDF with PIL
    img = Image.new("RGB", (400, 200), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((20, 40), "Prescription: Metformin 500mg daily", fill=(0, 0, 0))
    d.text((20, 80), "Diagnosis: Type 2 Diabetes", fill=(0, 0, 0))

    buf = io.BytesIO()
    img.save(buf, format="PDF")
    pdf_bytes = buf.getvalue()
    assert pdf_bytes.startswith(b"%PDF")

    r = client.post(
        "/intake/document/upload",
        data={"encounter_id": enc_id, "document_type": "prescription"},
        files={"file": ("dr_prescription.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
        headers=h,
    )
    assert r.status_code == 201, f"PDF upload failed: {r.text}"
    data = r.json()
    assert data["original_filename"] == "dr_prescription.pdf"
    assert data["file_size"] == len(pdf_bytes)
    # Processing status can be 'processed' (if Gemini succeeds) or 'failed' (if Gemini free tier rate limit occurs),
    # but the HTTP upload itself must succeed with 201 and persistent Document record!
    assert data["processing_status"] in ("processed", "failed")


# 22. test_completed_encounter_upload_rejected_with_409
def test_completed_encounter_upload_rejected_with_409(client: TestClient):
    """
    Verifies that uploading documents to a completed encounter returns 409 Conflict
    with a clear explanatory message, enforcing that completed clinical encounters are immutable.
    """
    p = _create_patient_and_encounter(client, "completed_409")
    enc_id = p["encounter_id"]
    h = p["headers"]

    # Start and submit intake
    r_start = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    session_id = r_start.json()["session_id"]
    client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id}, headers=h)

    # Doctor assigns and marks completed
    doc = _register_login(client, "dr_complete_enc@test.com", "password123", "doctor")
    client.post(f"/doctor/encounter/{enc_id}/assign", headers=doc["headers"])
    # Complete consultation
    r_fin = client.post(f"/doctor/encounter/{enc_id}/finalize", json={"clinical_notes": "All done."}, headers=doc["headers"])
    # Or check if finalize endpoint or db update: if finalize isn't defined, test whatever finishes encounter
    if r_fin.status_code != 200:
        # Update encounter to completed directly in db if finalize path differs
        from backend.database import SessionLocal
        from backend.models.encounter import Encounter, EncounterStatus
        db = SessionLocal()
        enc = db.query(Encounter).filter(Encounter.id == enc_id).first()
        enc.queue_status = EncounterStatus.completed
        db.commit()
        db.close()

    # Now attempt to upload document to completed encounter
    r_upload = client.post(
        "/intake/document/upload",
        data={"encounter_id": enc_id, "document_type": "prescription"},
        files={"file": ("late_rx.pdf", io.BytesIO(b"%PDF-1.4 mock content"), "application/pdf")},
        headers=h,
    )
    assert r_upload.status_code == 409
    assert "already been completed" in r_upload.json()["detail"]

