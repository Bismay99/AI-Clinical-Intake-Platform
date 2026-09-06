"""
tests/test_doctor_search.py

Tests for the new doctor patient-discovery endpoints:
  GET /doctor/dashboard/stats
  GET /doctor/patients/search
  GET /doctor/available
  GET /doctor/patients/recommended
"""

import pytest
from fastapi.testclient import TestClient


# -- Helpers ------------------------------------------------------------------

def register_and_login(client: TestClient, email: str, password: str = "pass1234", role: str = "patient",
                       full_name: str = "Test User") -> str:
    r1 = client.post("/auth/register", json={"email": email, "password": password,
                                             "role": role, "full_name": full_name})
    assert r1.status_code == 201, f"Register failed: {r1.json()}"
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.json()}"
    return r.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_patient_profile(client: TestClient, token: str, full_name: str = "Test Patient") -> dict:
    r = client.post("/patients/profile",
                    json={"full_name": full_name, "date_of_birth": "1985-06-15",
                          "gender": "female", "phone": "9876543210",
                          "preferred_language": "en"},
                    headers=auth_headers(token))
    assert r.status_code == 201, f"Profile create failed: {r.json()}"
    return r.json()


def create_encounter(client: TestClient, token: str, dept: str = "General Medicine") -> dict:
    r = client.post("/encounters", json={"opd_department": dept},
                    headers=auth_headers(token))
    assert r.status_code == 201, f"Encounter create failed: {r.json()}"
    return r.json()


def submit_intake(client: TestClient, patient_token: str, encounter_id: str) -> None:
    sr = client.post("/intake/session/start",
                     json={"encounter_id": encounter_id,
                           "language": "en",
                           "schema_id": "allopathic_chest_pain_v1"},
                     headers=auth_headers(patient_token))
    assert sr.status_code == 201, f"Session start failed: {sr.json()}"
    session_id = sr.json()["session_id"]
    r = client.post("/intake/submit",
                    json={"session_id": session_id, "encounter_id": encounter_id},
                    headers=auth_headers(patient_token))
    assert r.status_code == 200, f"Intake submit failed: {r.json()}"


def assign_encounter(client: TestClient, doctor_token: str, encounter_id: str) -> None:
    r = client.post(f"/doctor/encounter/{encounter_id}/assign",
                    headers=auth_headers(doctor_token))
    assert r.status_code == 200, f"Assign failed: {r.json()}"


# -- Test: /doctor/dashboard/stats --------------------------------------------

def test_stats_requires_doctor_jwt(client: TestClient):
    r = client.get("/doctor/dashboard/stats")
    assert r.status_code == 401


def test_stats_rejects_patient_jwt(client: TestClient):
    pt = register_and_login(client, "statspatient@test.com", role="patient")
    r = client.get("/doctor/dashboard/stats", headers=auth_headers(pt))
    assert r.status_code == 403


def test_stats_returns_zero_for_new_doctor(client: TestClient):
    dt = register_and_login(client, "newdoc_stats@test.com", role="doctor", full_name="Dr Stats")
    r = client.get("/doctor/dashboard/stats", headers=auth_headers(dt))
    assert r.status_code == 200
    data = r.json()
    assert data["awaiting_review"] == 0
    assert data["in_review"] == 0
    assert data["completed"] == 0


def test_stats_counts_correctly_after_assignment(client: TestClient):
    pt = register_and_login(client, "statspt2@test.com", role="patient")
    create_patient_profile(client, pt)
    enc = create_encounter(client, pt)
    submit_intake(client, pt, enc["id"])

    dt = register_and_login(client, "doc_stats2@test.com", role="doctor", full_name="Dr Stats2")
    assign_encounter(client, dt, enc["id"])

    r = client.get("/doctor/dashboard/stats", headers=auth_headers(dt))
    assert r.status_code == 200
    data = r.json()
    assert data["awaiting_review"] == 1
    assert data["completed"] == 0


# -- Test: /doctor/patients/search --------------------------------------------

def test_search_requires_doctor_jwt(client: TestClient):
    r = client.get("/doctor/patients/search?patient_uid=anything")
    assert r.status_code == 401


def test_search_rejects_patient_jwt(client: TestClient):
    pt = register_and_login(client, "searchpatient@test.com", role="patient")
    r = client.get("/doctor/patients/search?patient_uid=anything",
                   headers=auth_headers(pt))
    assert r.status_code == 403


def test_search_unknown_uid_returns_404(client: TestClient):
    dt = register_and_login(client, "searchdoc@test.com", role="doctor", full_name="Dr Search")
    r = client.get("/doctor/patients/search?patient_uid=nonexistent-uid",
                   headers=auth_headers(dt))
    assert r.status_code == 404


def test_search_unauthorized_patient_returns_404(client: TestClient):
    pt = register_and_login(client, "unauth_search_pt@test.com", role="patient")
    profile = create_patient_profile(client, pt)
    patient_uid = profile["id"]

    dt = register_and_login(client, "unauth_search_doc@test.com", role="doctor", full_name="Dr Unauth")
    r = client.get(f"/doctor/patients/search?patient_uid={patient_uid}",
                   headers=auth_headers(dt))
    assert r.status_code == 404
    assert "No authorized patient found" in r.json()["detail"]


def test_search_authorized_patient_returns_card(client: TestClient):
    pt = register_and_login(client, "auth_search_pt@test.com", role="patient", full_name="Auth Patient")
    profile = create_patient_profile(client, pt, full_name="Auth Patient")
    patient_uid = profile["id"]
    enc = create_encounter(client, pt)
    submit_intake(client, pt, enc["id"])

    dt = register_and_login(client, "auth_search_doc@test.com", role="doctor", full_name="Dr Auth")
    assign_encounter(client, dt, enc["id"])

    r = client.get(f"/doctor/patients/search?patient_uid={patient_uid}",
                   headers=auth_headers(dt))
    assert r.status_code == 200
    data = r.json()
    assert data["patient_id"] == patient_uid
    assert data["patient_name"] == "Auth Patient"
    assert isinstance(data["encounters"], list)
    assert len(data["encounters"]) >= 1
    assert data["encounters"][0]["encounter_id"] == enc["id"]


def test_search_by_encounter_uid_resolves_patient_for_assigned_doctor(client: TestClient):
    """
    REGRESSION TEST:
    REAL PATIENT UID + REAL ENCOUNTER + assigned_doctor_id == authenticated doctor
    = GET /doctor/patients/search?patient_uid={encounter_id} -> 200 OK.
    Verifies that searching by an assigned encounter ID (consultation token) resolves
    the patient and returns the correct patient and encounter details.
    """
    pt = register_and_login(client, "enc_search_pt@test.com", role="patient", full_name="Encounter Search Patient")
    profile = create_patient_profile(client, pt, full_name="Encounter Search Patient")
    patient_id = profile["id"]
    enc = create_encounter(client, pt, dept="Cardiology")
    submit_intake(client, pt, enc["id"])
    encounter_id = enc["id"]

    # Assigned doctor
    dt = register_and_login(client, "assigned_doc@test.com", role="doctor", full_name="Dr Assigned")
    assign_encounter(client, dt, encounter_id)

    # 1. Search using Encounter ID
    r = client.get(f"/doctor/patients/search?patient_uid={encounter_id}", headers=auth_headers(dt))
    assert r.status_code == 200, f"Expected 200 when searching by encounter ID, got {r.status_code}: {r.text}"
    data = r.json()
    assert data["patient_id"] == patient_id
    assert data["patient_name"] == "Encounter Search Patient"
    assert any(e["encounter_id"] == encounter_id for e in data["encounters"])

    # 2. Search using Encounter ID with leading/trailing whitespace and uppercase
    padded_uid = f"  {encounter_id.upper()}  "
    r_padded = client.get(f"/doctor/patients/search?patient_uid={padded_uid}", headers=auth_headers(dt))
    assert r_padded.status_code == 200
    assert r_padded.json()["patient_id"] == patient_id

    # 3. Unassigned doctor searching same encounter ID gets 404 (Anti-enumeration)
    other_dt = register_and_login(client, "unassigned_doc@test.com", role="doctor", full_name="Dr Other")
    r_unauth = client.get(f"/doctor/patients/search?patient_uid={encounter_id}", headers=auth_headers(other_dt))
    assert r_unauth.status_code == 404
    assert "No authorized patient found" in r_unauth.json()["detail"]


# -- Test: /doctor/available ---------------------------------------------------

def test_available_requires_doctor_jwt(client: TestClient):
    r = client.get("/doctor/available")
    assert r.status_code == 401


def test_available_shows_unassigned_ready_encounters(client: TestClient):
    pt = register_and_login(client, "avail_pt@test.com", role="patient")
    create_patient_profile(client, pt)
    enc = create_encounter(client, pt)
    submit_intake(client, pt, enc["id"])

    dt = register_and_login(client, "avail_doc@test.com", role="doctor", full_name="Dr Available")
    r = client.get("/doctor/available", headers=auth_headers(dt))
    assert r.status_code == 200
    data = r.json()
    ids = [item["encounter_id"] for item in data]
    assert enc["id"] in ids


# -- Test: /doctor/patients/recommended ---------------------------------------

def test_recommended_only_contains_authorized_encounters(client: TestClient):
    pt_other = register_and_login(client, "other_rec_pt@test.com", role="patient")
    create_patient_profile(client, pt_other)
    enc_other = create_encounter(client, pt_other)
    submit_intake(client, pt_other, enc_other["id"])

    dt = register_and_login(client, "rec_doc@test.com", role="doctor", full_name="Dr Rec")
    r = client.get("/doctor/patients/recommended", headers=auth_headers(dt))
    assert r.status_code == 200
    data = r.json()

    for item in data:
        if item["encounter_id"] == enc_other["id"]:
            assert item["reason"] == "Recently submitted pre-consultation"
            assert item["queue_status"] == "ready_for_review"