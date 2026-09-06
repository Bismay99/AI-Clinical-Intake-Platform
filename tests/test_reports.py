"""
tests/test_reports.py

Tests for patient-facing Pre-Consultation Reports and Documents API:
  - Patient can list their submitted reports (ready_for_review and completed).
  - Patient can view the detailed structured pre-consultation report for their own encounter.
  - Ownership isolation: Patient cannot access another patient's report (returns 404).
  - Doctor JWT cannot access patient report endpoints (returns 403).
  - Missing fields are identified as "Not provided" (never inferred).
  - Extraction evidence preserves confidence, provenance, and verification status.
  - Patient dashboard metrics reflect authoritative counts from database.
"""

import io
import pytest
from fastapi.testclient import TestClient


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
    p = _register_login(client, f"pt_rep_{suffix}@test.com", "password123", "patient")
    client.post("/patients/profile",
                json={"full_name": f"Patient {suffix}", "preferred_language": "en"},
                headers=p["headers"])
    r = client.post("/encounters", json={"opd_department": "General OPD"}, headers=p["headers"])
    assert r.status_code == 201
    return {**p, "encounter_id": r.json()["id"]}


def _run_intake_and_submit(client: TestClient, patient_chain: dict) -> str:
    enc_id = patient_chain["encounter_id"]
    h = patient_chain["headers"]

    r = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=h)
    assert r.status_code == 201
    session_id = r.json()["session_id"]
    first_field = r.json()["first_question_field_name"]

    client.post("/intake/turn", json={
        "session_id": session_id, "encounter_id": enc_id,
        "touch_answer": "severe chest pain for three days radiating to left arm",
        "answering_field_name": first_field,
    }, headers=h)

    client.post(
        "/intake/document/upload",
        data={"encounter_id": enc_id, "document_type": "prescription"},
        files={"file": ("prescription.pdf", io.BytesIO(b"%PDF-1.4 test prescription file"), "application/pdf")},
        headers=h,
    )

    r_sub = client.post("/intake/submit",
                        json={"session_id": session_id, "encounter_id": enc_id},
                        headers=h)
    assert r_sub.status_code == 200
    assert r_sub.json()["status"] == "ready_for_review"
    return session_id


def test_reports_require_patient_auth(client: TestClient):
    r = client.get("/patients/reports")
    assert r.status_code == 401

    doc = _register_login(client, "dr_unauth_rep@test.com", "password123", "doctor")
    r2 = client.get("/patients/reports", headers=doc["headers"])
    assert r2.status_code == 403


def test_empty_reports_list(client: TestClient):
    p = _create_patient_and_encounter(client, "empty")
    r = client.get("/patients/reports", headers=p["headers"])
    assert r.status_code == 200
    # Encounter is only in registered status, not ready_for_review
    assert len(r.json()) == 0


def test_submitted_intake_creates_patient_report(client: TestClient):
    p = _create_patient_and_encounter(client, "sub")
    _run_intake_and_submit(client, p)

    r = client.get("/patients/reports", headers=p["headers"])
    assert r.status_code == 200
    reports = r.json()
    assert len(reports) == 1
    rep = reports[0]
    assert rep["encounter_id"] == p["encounter_id"]
    assert rep["queue_status"] == "ready_for_review"
    assert rep["doctor_review_status"] == "Awaiting Doctor Review"
    assert rep["has_summary"] is True
    assert rep["total_entities"] >= 1


def test_patient_report_detail_fields(client: TestClient):
    p = _create_patient_and_encounter(client, "det")
    _run_intake_and_submit(client, p)

    r = client.get(f"/patients/reports/{p['encounter_id']}", headers=p["headers"])
    assert r.status_code == 200
    data = r.json()

    # 1. Patient identity & encounter
    assert data["patient_name"] == "Patient det"
    assert data["patient_uid"] != ""
    assert data["encounter_id"] == p["encounter_id"]
    assert data["queue_status"] == "ready_for_review"
    assert data["doctor_review_status"] == "Awaiting Doctor Review"

    # 2. Clinical summary & entities
    assert data["summary_text"] is not None
    assert len(data["extracted_entities"]) >= 1
    first_ent = data["extracted_entities"][0]
    assert "field_name" in first_ent
    assert "value" in first_ent
    assert "confidence" in first_ent
    assert "verification_status" in first_ent
    assert first_ent["verification_status"] == "unreviewed"

    # 3. Missing fields are explicitly "Not provided"
    assert len(data["missing_fields"]) >= 1
    for mf in data["missing_fields"]:
        assert mf["status"] == "Not provided"

    # 4. Documents & timeline
    assert len(data["documents"]) == 1
    assert data["documents"][0]["original_filename"] == "prescription.pdf"


def test_patient_cannot_access_another_patients_report(client: TestClient):
    p1 = _create_patient_and_encounter(client, "p1")
    _run_intake_and_submit(client, p1)

    p2 = _create_patient_and_encounter(client, "p2")

    # Patient 2 tries to fetch Patient 1's report
    r = client.get(f"/patients/reports/{p1['encounter_id']}", headers=p2["headers"])
    # MUST return 404 (not 403) to prevent enumeration of encounter existence
    assert r.status_code == 404


def test_patient_documents_and_metrics(client: TestClient):
    p = _create_patient_and_encounter(client, "met")
    _run_intake_and_submit(client, p)

    # Documents endpoint
    r_docs = client.get("/patients/documents", headers=p["headers"])
    assert r_docs.status_code == 200
    docs = r_docs.json()
    assert len(docs) == 1
    assert docs[0]["document_type"] == "prescription"

    # Dashboard metrics endpoint
    r_met = client.get("/patients/dashboard/metrics", headers=p["headers"])
    assert r_met.status_code == 200
    metrics = r_met.json()
    assert metrics["consultations_count"] == 1
    assert metrics["documents_count"] == 1
    assert metrics["reports_count"] == 1
