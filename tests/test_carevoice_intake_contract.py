"""
tests/test_carevoice_intake_contract.py

Contract verification tests for CareVoice -> FastAPI intake workflow.
Validates:
1. CareVoice conversational turns in English, Hindi, and Hinglish via POST /intake/turn.
2. Clinical safety invariants: persisted entities in DB must have verification_status == unreviewed,
   with source provenance preserved.
3. FastAPI question authority: turn progression, question selection, and pathway completion.
4. Security guards: 401 unauthenticated, 403 doctor role forbidden, 404 missing session.
5. Intake finalization: POST /intake/submit transitions encounter to ready_for_review.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from backend.models.extracted_entity import ExtractedEntity, VerificationStatus


def _register_and_login(client: TestClient, email: str, password: str, role: str) -> dict:
    r = client.post("/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "CareVoice Patient",
        "role": role,
    })
    assert r.status_code == 201, f"Register failed: {r.json()}"
    r2 = client.post("/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200
    data = r2.json()
    return {"token": data["access_token"], "user_id": data["user_id"]}


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _setup_patient_session(client: TestClient, suffix: str = "cv01") -> dict:
    """Sets up a patient, encounter, and active intake session."""
    creds = _register_and_login(
        client, f"carevoice_patient_{suffix}@test.com", "SecurePass123!", "patient"
    )
    headers = _auth_headers(creds["token"])

    # Create profile
    r_prof = client.post("/patients/profile", json={
        "full_name": f"CareVoice User {suffix}",
        "preferred_language": "hi",
    }, headers=headers)
    assert r_prof.status_code == 201

    # Create encounter
    r_enc = client.post("/encounters", json={
        "opd_department": "General Medicine"
    }, headers=headers)
    assert r_enc.status_code == 201
    encounter_id = r_enc.json()["id"]

    # Start intake session
    r_sess = client.post("/intake/session/start", json={
        "encounter_id": encounter_id,
        "language": "hi",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=headers)
    assert r_sess.status_code == 201
    sess_data = r_sess.json()

    return {
        "headers": headers,
        "token": creds["token"],
        "encounter_id": encounter_id,
        "session_id": sess_data["session_id"],
        "first_question": sess_data["first_question"],
        "first_field_name": sess_data["first_question_field_name"],
    }


# ==============================================================================
# 1. CareVoice Multilingual Turn Submission Contract Tests
# ==============================================================================

def test_carevoice_turn_english_transcript(client: TestClient, db: Session):
    """Simulates CareVoice streaming transcribed English answer to POST /intake/turn."""
    setup = _setup_patient_session(client, suffix="en")

    payload = {
        "session_id": setup["session_id"],
        "encounter_id": setup["encounter_id"],
        "touch_answer": "I have had severe chest pain and breathlessness for the past three days.",
        "answering_field_name": setup["first_field_name"],
    }

    r = client.post("/intake/turn", json=payload, headers=setup["headers"])
    assert r.status_code == 200, f"Turn submission failed: {r.text}"
    data = r.json()

    # Verify response schema contract
    assert data["session_id"] == setup["session_id"]
    assert data["turn_number"] == 1
    assert "entities_extracted" in data
    assert isinstance(data["entities_extracted"], list)

    for summary in data["entities_extracted"]:
        assert summary["field_name"]
        assert summary["source_type"] in ("intake_session", "document")
        assert "confidence" in summary

    # Invariant: Extracted entities in DB must be unreviewed with valid provenance
    db_entities = db.query(ExtractedEntity).filter_by(encounter_id=setup["encounter_id"]).all()
    for entity in db_entities:
        assert entity.verification_status == VerificationStatus.unreviewed
        assert entity.source_location is not None
        assert entity.source_id in (setup["session_id"], setup["encounter_id"])


def test_carevoice_turn_hindi_transcript(client: TestClient, db: Session):
    """Simulates CareVoice streaming transcribed Hindi answer to POST /intake/turn."""
    setup = _setup_patient_session(client, suffix="hi")

    payload = {
        "session_id": setup["session_id"],
        "encounter_id": setup["encounter_id"],
        "touch_answer": "मुझे तीन दिन से सीने में तेज दर्द हो रहा है और सांस लेने में तकलीफ है।",
        "answering_field_name": setup["first_field_name"],
    }

    r = client.post("/intake/turn", json=payload, headers=setup["headers"])
    assert r.status_code == 200, f"Turn submission failed: {r.text}"
    data = r.json()

    assert data["session_id"] == setup["session_id"]
    assert data["turn_number"] == 1
    assert "entities_extracted" in data

    db_entities = db.query(ExtractedEntity).filter_by(encounter_id=setup["encounter_id"]).all()
    for entity in db_entities:
        assert entity.verification_status == VerificationStatus.unreviewed


def test_carevoice_turn_hinglish_transcript(client: TestClient, db: Session):
    """Simulates CareVoice streaming transcribed Hinglish answer to POST /intake/turn."""
    setup = _setup_patient_session(client, suffix="hinglish")

    payload = {
        "session_id": setup["session_id"],
        "encounter_id": setup["encounter_id"],
        "touch_answer": "Mujhe 3 days se chest mein heavy pain ho raha hai aur breathing issue hai.",
        "answering_field_name": setup["first_field_name"],
    }

    r = client.post("/intake/turn", json=payload, headers=setup["headers"])
    assert r.status_code == 200, f"Turn submission failed: {r.text}"
    data = r.json()

    assert data["session_id"] == setup["session_id"]
    assert data["turn_number"] == 1
    assert "entities_extracted" in data

    db_entities = db.query(ExtractedEntity).filter_by(encounter_id=setup["encounter_id"]).all()
    for entity in db_entities:
        assert entity.verification_status == VerificationStatus.unreviewed


# ==============================================================================
# 2. Authentication and Authorization Guardrail Tests
# ==============================================================================

def test_carevoice_turn_requires_auth(client: TestClient):
    """Anonymous calls to /intake/turn must be rejected with 401/403."""
    r = client.post("/intake/turn", json={
        "session_id": "any-session",
        "encounter_id": "any-encounter",
        "touch_answer": "Patient answer without token",
    })
    assert r.status_code in (401, 403)


def test_carevoice_turn_doctor_role_forbidden(client: TestClient):
    """Doctor credentials must NOT be allowed to submit patient intake turns."""
    setup = _setup_patient_session(client, suffix="auth_doc")
    doctor = _register_and_login(client, "doctor_intruder@test.com", "DocPass123!", "doctor")

    r = client.post("/intake/turn", json={
        "session_id": setup["session_id"],
        "encounter_id": setup["encounter_id"],
        "touch_answer": "Doctor attempting patient turn",
    }, headers=_auth_headers(doctor["token"]))

    assert r.status_code == 403


def test_carevoice_turn_invalid_session_404(client: TestClient):
    """Non-existent session IDs must return 404."""
    setup = _setup_patient_session(client, suffix="404")

    r = client.post("/intake/turn", json={
        "session_id": "00000000-0000-0000-0000-000000000000",
        "encounter_id": setup["encounter_id"],
        "touch_answer": "Testing invalid session",
    }, headers=setup["headers"])

    assert r.status_code == 404


# ==============================================================================
# 3. Pathway Completion & Final Submission
# ==============================================================================

def test_carevoice_pathway_submit_workflow(client: TestClient):
    """
    Simulates CareVoice driving turns until pathway completes,
    then issuing POST /intake/submit to ready encounter for doctor review.
    """
    setup = _setup_patient_session(client, suffix="flow")

    # Submit turns until complete or max 6 turns
    field_name = setup["first_field_name"]

    for turn_idx in range(6):
        r = client.post("/intake/turn", json={
            "session_id": setup["session_id"],
            "encounter_id": setup["encounter_id"],
            "touch_answer": f"Turn {turn_idx + 1}: No other major issues, pain is moderate.",
            "answering_field_name": field_name,
        }, headers=setup["headers"])
        assert r.status_code == 200
        turn_data = r.json()
        field_name = turn_data.get("next_question_field_name")
        if turn_data.get("pathway_complete"):
            break

    # Now finalize intake via POST /intake/submit
    r_sub = client.post("/intake/submit", json={
        "session_id": setup["session_id"],
        "encounter_id": setup["encounter_id"],
    }, headers=setup["headers"])
    assert r_sub.status_code == 200, f"Submit failed: {r_sub.text}"
    sub_data = r_sub.json()

    assert sub_data["encounter_id"] == setup["encounter_id"]
    assert sub_data["status"] == "ready_for_review"
    assert "total_entities" in sub_data
    assert "timeline_events" in sub_data

    # Verify encounter cannot accept new turns once completed
    r_after = client.post("/intake/turn", json={
        "session_id": setup["session_id"],
        "encounter_id": setup["encounter_id"],
        "touch_answer": "Extra turn after submission",
    }, headers=setup["headers"])
    assert r_after.status_code in (400, 409)
