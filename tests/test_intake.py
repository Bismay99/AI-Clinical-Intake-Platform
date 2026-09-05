"""
tests/test_intake.py

Phase 2 tests — patient intake API.

Test groups:
  A. Infrastructure helpers (fixtures that build the full ownership chain)
  B. Authentication & authorization guards
  C. Ownership isolation (one patient cannot access another's data)
  D. Patient profile and encounter creation
  E. Intake session start
  F. Intake turns
  G. Document upload
  H. Intake submission (full happy path)
  I. Safety invariants (all entities UNREVIEWED, provenance preserved)
  J. State machine (can't add turns after submit, etc.)
"""

import io
import pytest
from fastapi.testclient import TestClient


# ══════════════════════════════════════════════════════════════════════════════
# A. Fixtures — build the full patient → encounter chain
# ══════════════════════════════════════════════════════════════════════════════

def _register_and_login(client: TestClient, email: str, password: str, role: str) -> dict:
    """Registers a user and returns {"token": ..., "user_id": ...}."""
    r = client.post("/auth/register", json={
        "email": email, "password": password,
        "full_name": "Test User", "role": role,
    })
    assert r.status_code == 201, f"Register failed: {r.json()}"
    r2 = client.post("/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200
    data = r2.json()
    return {"token": data["access_token"], "user_id": data["user_id"]}


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_patient_chain(client: TestClient, suffix: str = "001") -> dict:
    """
    Creates a full patient ownership chain and returns all IDs/tokens.
    Returns: {token, user_id, patient_id, encounter_id}
    """
    # 1. Register + login as patient
    creds = _register_and_login(
        client, f"patient_{suffix}@test.com", "password123", "patient"
    )
    headers = _auth_headers(creds["token"])

    # 2. Create patient profile
    r = client.post("/patients/profile", json={
        "full_name": f"Test Patient {suffix}",
        "preferred_language": "en",
    }, headers=headers)
    assert r.status_code == 201, f"Profile create failed: {r.json()}"
    patient_id = r.json()["id"]

    # 3. Create encounter
    r = client.post("/encounters", json={"opd_department": "Cardiology"}, headers=headers)
    assert r.status_code == 201, f"Encounter create failed: {r.json()}"
    encounter_id = r.json()["id"]

    return {
        "token": creds["token"],
        "user_id": creds["user_id"],
        "patient_id": patient_id,
        "encounter_id": encounter_id,
        "headers": headers,
    }


# ══════════════════════════════════════════════════════════════════════════════
# B. Authentication & authorization guards
# ══════════════════════════════════════════════════════════════════════════════

def test_session_start_requires_auth(client: TestClient):
    r = client.post("/intake/session/start", json={
        "encounter_id": "any", "language": "en", "schema_id": "allopathic_chest_pain_v1"
    })
    assert r.status_code in (401, 403)


def test_session_start_doctor_forbidden(client: TestClient):
    """Doctors must not access patient intake endpoints."""
    doc = _register_and_login(client, "doctorX@test.com", "docpass1", "doctor")
    r = client.post("/intake/session/start", json={
        "encounter_id": "any", "language": "en", "schema_id": "allopathic_chest_pain_v1"
    }, headers=_auth_headers(doc["token"]))
    assert r.status_code == 403


def test_intake_turn_requires_auth(client: TestClient):
    r = client.post("/intake/turn", json={
        "session_id": "x", "encounter_id": "y", "touch_answer": "test"
    })
    assert r.status_code in (401, 403)


def test_document_upload_requires_auth(client: TestClient):
    r = client.post("/intake/document/upload", data={
        "encounter_id": "x", "document_type": "prescription"
    }, files={"file": ("test.pdf", b"bytes", "application/pdf")})
    assert r.status_code in (401, 403)


def test_intake_submit_requires_auth(client: TestClient):
    r = client.post("/intake/submit", json={"session_id": "x", "encounter_id": "y"})
    assert r.status_code in (401, 403)


# ══════════════════════════════════════════════════════════════════════════════
# C. Ownership isolation
# ══════════════════════════════════════════════════════════════════════════════

def test_patient_cannot_access_another_patients_encounter(client: TestClient):
    """Patient A must get 404 when using Patient B's encounter_id."""
    chain_a = _create_patient_chain(client, "isolA")
    chain_b = _create_patient_chain(client, "isolB")

    # Patient A tries to start a session using Patient B's encounter
    r = client.post("/intake/session/start", json={
        "encounter_id": chain_b["encounter_id"],
        "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=chain_a["headers"])
    # Must be 404 — not 403 (avoids leaking that the encounter exists)
    assert r.status_code == 404


def test_patient_without_profile_gets_404(client: TestClient):
    """A patient user who skips profile creation gets a clear 404."""
    creds = _register_and_login(client, "noprofile@test.com", "password1", "patient")
    r = client.post("/intake/session/start", json={
        "encounter_id": "some-enc-id",
        "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=_auth_headers(creds["token"]))
    assert r.status_code == 404
    assert "patient profile" in r.json()["detail"].lower()


# ══════════════════════════════════════════════════════════════════════════════
# D. Patient profile and encounter creation
# ══════════════════════════════════════════════════════════════════════════════

def test_create_patient_profile_success(client: TestClient):
    creds = _register_and_login(client, "proftest@test.com", "password1", "patient")
    r = client.post("/patients/profile", json={
        "full_name": "Ramesh Kumar",
        "preferred_language": "hi",
        "date_of_birth": "1985-03-15",
        "gender": "male",
        "phone": "9876543210",
    }, headers=_auth_headers(creds["token"]))
    assert r.status_code == 201
    data = r.json()
    assert data["full_name"] == "Ramesh Kumar"
    assert data["preferred_language"] == "hi"
    assert data["user_id"] == creds["user_id"]


def test_duplicate_patient_profile_rejected(client: TestClient):
    creds = _register_and_login(client, "dupprof@test.com", "password1", "patient")
    payload = {"full_name": "Duplicate", "preferred_language": "en"}
    client.post("/patients/profile", json=payload, headers=_auth_headers(creds["token"]))
    r2 = client.post("/patients/profile", json=payload, headers=_auth_headers(creds["token"]))
    assert r2.status_code == 409


def test_get_patient_profile(client: TestClient):
    creds = _register_and_login(client, "getprof@test.com", "password1", "patient")
    client.post("/patients/profile", json={"full_name": "Fetch Me", "preferred_language": "en"},
                headers=_auth_headers(creds["token"]))
    r = client.get("/patients/profile", headers=_auth_headers(creds["token"]))
    assert r.status_code == 200
    assert r.json()["full_name"] == "Fetch Me"


def test_doctor_cannot_create_patient_profile(client: TestClient):
    creds = _register_and_login(client, "docprofile@test.com", "password1", "doctor")
    r = client.post("/patients/profile", json={"full_name": "Dr X", "preferred_language": "en"},
                    headers=_auth_headers(creds["token"]))
    assert r.status_code == 403


def test_create_encounter(client: TestClient):
    creds = _register_and_login(client, "enctest@test.com", "password1", "patient")
    client.post("/patients/profile", json={"full_name": "Enc Test", "preferred_language": "en"},
                headers=_auth_headers(creds["token"]))
    r = client.post("/encounters", json={"opd_department": "General"},
                    headers=_auth_headers(creds["token"]))
    assert r.status_code == 201
    data = r.json()
    assert data["queue_status"] == "registered"
    assert "id" in data


def test_list_my_encounters(client: TestClient):
    creds = _register_and_login(client, "listenc@test.com", "password1", "patient")
    headers = _auth_headers(creds["token"])
    client.post("/patients/profile", json={"full_name": "List Enc", "preferred_language": "en"},
                headers=headers)
    client.post("/encounters", json={}, headers=headers)
    client.post("/encounters", json={}, headers=headers)
    r = client.get("/encounters/mine", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) >= 2


# ══════════════════════════════════════════════════════════════════════════════
# E. Intake session start
# ══════════════════════════════════════════════════════════════════════════════

def test_session_start_success(client: TestClient):
    chain = _create_patient_chain(client, "sessA")
    r = client.post("/intake/session/start", json={
        "encounter_id": chain["encounter_id"],
        "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=chain["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["session_id"]
    assert data["encounter_id"] == chain["encounter_id"]
    assert data["status"] == "in_progress"
    # First question is the chief_complaint field
    assert data["first_question"] is not None
    assert data["first_question_field_name"] == "chief_complaint"


def test_session_start_advances_encounter_status(client: TestClient):
    chain = _create_patient_chain(client, "sessB")
    client.post("/intake/session/start", json={
        "encounter_id": chain["encounter_id"],
        "language": "hi",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=chain["headers"])
    r = client.get("/encounters/mine", headers=chain["headers"])
    encounter = next(e for e in r.json() if e["id"] == chain["encounter_id"])
    assert encounter["queue_status"] == "intake_in_progress"


def test_session_start_invalid_schema_rejected(client: TestClient):
    chain = _create_patient_chain(client, "sessC")
    r = client.post("/intake/session/start", json={
        "encounter_id": chain["encounter_id"],
        "language": "en",
        "schema_id": "nonexistent_schema_v99",
    }, headers=chain["headers"])
    assert r.status_code == 422


def test_session_start_ayush_schema(client: TestClient):
    """Schema switch works — same endpoint, different schema_id."""
    chain = _create_patient_chain(client, "sessD")
    r = client.post("/intake/session/start", json={
        "encounter_id": chain["encounter_id"],
        "language": "en",
        "schema_id": "ayush_general_v1",
    }, headers=chain["headers"])
    assert r.status_code == 201
    data = r.json()
    assert data["first_question_field_name"] == "chief_complaint"


# ══════════════════════════════════════════════════════════════════════════════
# F. Intake turns
# ══════════════════════════════════════════════════════════════════════════════

def _start_session(client: TestClient, chain: dict, schema_id: str = "allopathic_chest_pain_v1") -> str:
    """Starts a session and returns the session_id."""
    r = client.post("/intake/session/start", json={
        "encounter_id": chain["encounter_id"],
        "language": "en",
        "schema_id": schema_id,
    }, headers=chain["headers"])
    assert r.status_code == 201
    return r.json()["session_id"]


def test_intake_turn_returns_next_question(client: TestClient):
    chain = _create_patient_chain(client, "turnA")
    session_id = _start_session(client, chain)
    r = client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": chain["encounter_id"],
        "touch_answer": "I have chest pain",
        "answering_field_name": "chief_complaint",
    }, headers=chain["headers"])
    assert r.status_code == 200
    data = r.json()
    assert data["session_id"] == session_id
    assert data["next_question"] is not None        # should get a follow-up
    assert data["next_question_field_name"] is not None
    assert data["turn_number"] == 1


def test_intake_turn_increments_turn_count(client: TestClient):
    chain = _create_patient_chain(client, "turnB")
    session_id = _start_session(client, chain)

    for i, (field, answer) in enumerate([
        ("chief_complaint", "chest pain"),
        ("onset", "3 days"),
    ], start=1):
        r = client.post("/intake/turn", json={
            "session_id": session_id,
            "encounter_id": chain["encounter_id"],
            "touch_answer": answer,
            "answering_field_name": field,
        }, headers=chain["headers"])
        assert r.status_code == 200
        assert r.json()["turn_number"] == i


def test_intake_turn_pathway_advances(client: TestClient):
    """Each turn should ask a different field — the question engine advances."""
    chain = _create_patient_chain(client, "turnC")
    session_id = _start_session(client, chain)

    r1 = client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": chain["encounter_id"],
        "touch_answer": "Chest pain",
        "answering_field_name": "chief_complaint",
    }, headers=chain["headers"])
    first_next = r1.json()["next_question_field_name"]

    r2 = client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": chain["encounter_id"],
        "touch_answer": "3 days ago",
        "answering_field_name": first_next,
    }, headers=chain["headers"])
    second_next = r2.json()["next_question_field_name"]

    # Fields must be different
    assert first_next != "chief_complaint"
    assert second_next != first_next or r2.json()["pathway_complete"]


def test_intake_turn_wrong_session_for_encounter(client: TestClient):
    """Using a session_id from a different encounter must return 404."""
    chain_a = _create_patient_chain(client, "xsessA")
    chain_b = _create_patient_chain(client, "xsessB")
    sess_b = _start_session(client, chain_b)

    r = client.post("/intake/turn", json={
        "session_id": sess_b,
        "encounter_id": chain_a["encounter_id"],  # wrong encounter
        "touch_answer": "test",
        "answering_field_name": "chief_complaint",
    }, headers=chain_a["headers"])
    assert r.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# G. Document upload
# ══════════════════════════════════════════════════════════════════════════════

def test_document_upload_prescription_success(client: TestClient):
    chain = _create_patient_chain(client, "docA")
    fake_pdf = io.BytesIO(b"fake-prescription-bytes")
    r = client.post(
        "/intake/document/upload",
        data={
            "encounter_id": chain["encounter_id"],
            "document_type": "prescription",
            "language_hint": "en",
        },
        files={"file": ("prescription.pdf", fake_pdf, "application/pdf")},
        headers=chain["headers"],
    )
    assert r.status_code == 201
    data = r.json()
    assert data["document_id"]
    assert data["encounter_id"] == chain["encounter_id"]
    assert data["entity_count"] > 0


def test_document_upload_lab_report_success(client: TestClient):
    chain = _create_patient_chain(client, "docB")
    r = client.post(
        "/intake/document/upload",
        data={"encounter_id": chain["encounter_id"], "document_type": "lab_report"},
        files={"file": ("lab.pdf", io.BytesIO(b"lab-bytes"), "application/pdf")},
        headers=chain["headers"],
    )
    assert r.status_code == 201
    assert r.json()["entity_count"] > 0


def test_document_upload_invalid_type_rejected(client: TestClient):
    chain = _create_patient_chain(client, "docC")
    r = client.post(
        "/intake/document/upload",
        data={"encounter_id": chain["encounter_id"], "document_type": "xray"},
        files={"file": ("x.pdf", io.BytesIO(b"bytes"), "application/pdf")},
        headers=chain["headers"],
    )
    assert r.status_code == 422


def test_document_upload_entities_have_provenance(client: TestClient):
    chain = _create_patient_chain(client, "docD")
    r = client.post(
        "/intake/document/upload",
        data={"encounter_id": chain["encounter_id"], "document_type": "prescription"},
        files={"file": ("p.pdf", io.BytesIO(b"bytes"), "application/pdf")},
        headers=chain["headers"],
    )
    for entity in r.json()["entities_extracted"]:
        assert entity["source_type"] in ("document", "intake_session")
        assert entity["source_location"] is not None


def test_document_upload_wrong_encounter_rejected(client: TestClient):
    chain_a = _create_patient_chain(client, "xdocA")
    chain_b = _create_patient_chain(client, "xdocB")
    r = client.post(
        "/intake/document/upload",
        data={"encounter_id": chain_b["encounter_id"], "document_type": "prescription"},
        files={"file": ("p.pdf", io.BytesIO(b"bytes"), "application/pdf")},
        headers=chain_a["headers"],  # Patient A uses Patient B's encounter
    )
    assert r.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# H. Full intake flow (happy path — end to end)
# ══════════════════════════════════════════════════════════════════════════════

def test_full_intake_happy_path(client: TestClient):
    """
    End-to-end: session start → turn → document upload → submit.
    Mirrors the Ramesh Kumar demo scenario from the PRD.
    """
    chain = _create_patient_chain(client, "happyA")
    enc_id = chain["encounter_id"]
    headers = chain["headers"]

    # 1. Start session
    r = client.post("/intake/session/start", json={
        "encounter_id": enc_id,
        "language": "hi",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=headers)
    assert r.status_code == 201
    session_id = r.json()["session_id"]
    first_field = r.json()["first_question_field_name"]

    # 2. First turn — answer chief_complaint
    r = client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": enc_id,
        "touch_answer": "seene mein dard, 3 din se",
        "answering_field_name": first_field,
    }, headers=headers)
    assert r.status_code == 200
    assert r.json()["pathway_complete"] is False
    second_field = r.json()["next_question_field_name"]

    # 3. Second turn
    r = client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": enc_id,
        "touch_answer": "Started 3 days ago",
        "answering_field_name": second_field,
    }, headers=headers)
    assert r.status_code == 200

    # 4. Upload prescription
    r = client.post(
        "/intake/document/upload",
        data={"encounter_id": enc_id, "document_type": "prescription"},
        files={"file": ("rx.pdf", io.BytesIO(b"fake-prescription"), "application/pdf")},
        headers=headers,
    )
    assert r.status_code == 201
    assert r.json()["entity_count"] > 0

    # 5. Submit
    r = client.post("/intake/submit", json={
        "session_id": session_id,
        "encounter_id": enc_id,
    }, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ready_for_review"
    assert data["total_entities"] > 0
    assert data["timeline_events"] >= 0
    assert data["summary_preview"]

    # 6. Confirm encounter status changed
    r = client.get("/encounters/mine", headers=headers)
    encounter = next(e for e in r.json() if e["id"] == enc_id)
    assert encounter["queue_status"] == "ready_for_review"


def test_submit_produces_clinical_summary(client: TestClient):
    chain = _create_patient_chain(client, "summaryA")
    headers = chain["headers"]
    enc_id = chain["encounter_id"]

    r = client.post("/intake/session/start", json={
        "encounter_id": enc_id, "language": "en",
        "schema_id": "allopathic_chest_pain_v1",
    }, headers=headers)
    session_id = r.json()["session_id"]
    first_field = r.json()["first_question_field_name"]

    client.post("/intake/turn", json={
        "session_id": session_id, "encounter_id": enc_id,
        "touch_answer": "chest pain", "answering_field_name": first_field,
    }, headers=headers)

    # Upload a document so there are entities with dates for the summary
    client.post(
        "/intake/document/upload",
        data={"encounter_id": enc_id, "document_type": "prescription"},
        files={"file": ("rx.pdf", io.BytesIO(b"prescription-bytes"), "application/pdf")},
        headers=headers,
    )

    r = client.post("/intake/submit", json={
        "session_id": session_id, "encounter_id": enc_id,
    }, headers=headers)
    assert r.status_code == 200
    assert len(r.json()["summary_preview"]) > 0


# ══════════════════════════════════════════════════════════════════════════════
# I. Safety invariants
# ══════════════════════════════════════════════════════════════════════════════

def test_all_entities_are_unreviewed_after_turn(client: TestClient, db):
    """
    Directly verifies the DB: every entity inserted by an intake turn
    must have verification_status == 'unreviewed'.
    """
    from backend.models.extracted_entity import ExtractedEntity, VerificationStatus

    chain = _create_patient_chain(client, "safetyA")
    session_id = _start_session(client, chain)

    client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": chain["encounter_id"],
        "touch_answer": "chest pain for 3 days",
        "answering_field_name": "chief_complaint",
    }, headers=chain["headers"])

    entities = db.query(ExtractedEntity).filter(
        ExtractedEntity.encounter_id == chain["encounter_id"]
    ).all()

    assert len(entities) > 0, "Expected at least one entity to be persisted"
    for e in entities:
        assert e.verification_status == VerificationStatus.unreviewed, (
            f"Entity '{e.field_name}' has status '{e.verification_status}' — "
            "only doctors can change verification status"
        )


def test_all_entities_have_source_provenance_after_document_upload(client: TestClient, db):
    """Every entity from document upload must have source_type + source_id."""
    from backend.models.extracted_entity import ExtractedEntity

    chain = _create_patient_chain(client, "safetyB")
    client.post(
        "/intake/document/upload",
        data={"encounter_id": chain["encounter_id"], "document_type": "prescription"},
        files={"file": ("p.pdf", io.BytesIO(b"bytes"), "application/pdf")},
        headers=chain["headers"],
    )

    entities = db.query(ExtractedEntity).filter(
        ExtractedEntity.encounter_id == chain["encounter_id"]
    ).all()

    assert len(entities) > 0
    for e in entities:
        assert e.source_type is not None
        assert e.source_id is not None and e.source_id != ""
        assert e.source_location is not None


def test_document_entities_confidence_in_valid_range(client: TestClient, db):
    """Confidence for every persisted entity must be [0.0, 1.0]."""
    from backend.models.extracted_entity import ExtractedEntity

    chain = _create_patient_chain(client, "safetyC")
    client.post(
        "/intake/document/upload",
        data={"encounter_id": chain["encounter_id"], "document_type": "prescription"},
        files={"file": ("p.pdf", io.BytesIO(b"bytes"), "application/pdf")},
        headers=chain["headers"],
    )

    entities = db.query(ExtractedEntity).filter(
        ExtractedEntity.encounter_id == chain["encounter_id"]
    ).all()

    for e in entities:
        assert 0.0 <= e.confidence <= 1.0, (
            f"Entity '{e.field_name}' has invalid confidence: {e.confidence}"
        )


def test_low_confidence_entities_are_flagged(client: TestClient, db):
    """Entities with confidence < 0.65 must have low_confidence_flag=True."""
    from backend.models.extracted_entity import ExtractedEntity

    chain = _create_patient_chain(client, "safetyD")
    client.post(
        "/intake/document/upload",
        data={"encounter_id": chain["encounter_id"], "document_type": "prescription"},
        files={"file": ("p.pdf", io.BytesIO(b"bytes"), "application/pdf")},
        headers=chain["headers"],
    )

    entities = db.query(ExtractedEntity).filter(
        ExtractedEntity.encounter_id == chain["encounter_id"]
    ).all()

    for e in entities:
        if e.confidence < 0.65:
            assert e.low_confidence_flag is True, (
                f"Entity '{e.field_name}' (conf={e.confidence:.2f}) "
                "should have low_confidence_flag=True"
            )


def test_patient_endpoint_cannot_set_accepted_status(client: TestClient, db):
    """
    Patient endpoints must never produce ACCEPTED/EDITED/REJECTED entities.
    Verifies directly in the DB.
    """
    from backend.models.extracted_entity import ExtractedEntity, VerificationStatus

    chain = _create_patient_chain(client, "safetyE")
    session_id = _start_session(client, chain)

    client.post("/intake/turn", json={
        "session_id": session_id,
        "encounter_id": chain["encounter_id"],
        "touch_answer": "chest pain",
        "answering_field_name": "chief_complaint",
    }, headers=chain["headers"])

    forbidden_statuses = {VerificationStatus.accepted, VerificationStatus.edited, VerificationStatus.rejected}
    entities = db.query(ExtractedEntity).filter(
        ExtractedEntity.encounter_id == chain["encounter_id"]
    ).all()

    for e in entities:
        assert e.verification_status not in forbidden_statuses, (
            f"Entity '{e.field_name}' has verification_status='{e.verification_status}' — "
            "patient endpoints must never set this."
        )


# ══════════════════════════════════════════════════════════════════════════════
# J. State machine guards
# ══════════════════════════════════════════════════════════════════════════════

def test_cannot_add_turn_after_submit(client: TestClient):
    """After /intake/submit, the session is 'submitted' — no more turns allowed."""
    chain = _create_patient_chain(client, "stateA")
    session_id = _start_session(client, chain)
    headers = chain["headers"]
    enc_id = chain["encounter_id"]

    # Submit immediately (no turns required for test)
    client.post("/intake/submit", json={
        "session_id": session_id, "encounter_id": enc_id,
    }, headers=headers)

    # Try adding a turn after submit
    r = client.post("/intake/turn", json={
        "session_id": session_id, "encounter_id": enc_id,
        "touch_answer": "extra info", "answering_field_name": "chief_complaint",
    }, headers=headers)
    assert r.status_code == 409


def test_cannot_submit_twice(client: TestClient):
    """Second submit on the same session must be rejected with 409."""
    chain = _create_patient_chain(client, "stateB")
    session_id = _start_session(client, chain)
    headers = chain["headers"]
    enc_id = chain["encounter_id"]

    r1 = client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id},
                     headers=headers)
    assert r1.status_code == 200

    r2 = client.post("/intake/submit", json={"session_id": session_id, "encounter_id": enc_id},
                     headers=headers)
    assert r2.status_code == 409


def test_invalid_session_id_returns_404(client: TestClient):
    chain = _create_patient_chain(client, "stateC")
    r = client.post("/intake/turn", json={
        "session_id": "nonexistent-session-id",
        "encounter_id": chain["encounter_id"],
        "touch_answer": "test",
        "answering_field_name": "chief_complaint",
    }, headers=chain["headers"])
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /intake/turn/voice tests (Phase 4C)
# ---------------------------------------------------------------------------

def test_voice_turn_requires_auth(client: TestClient):
    """Calling /intake/turn/voice without a JWT must return 401."""
    r = client.post("/intake/turn/voice", data={
        "encounter_id": "any",
        "session_id": "any",
    }, files={"audio_file": ("test.wav", b"RIFF....WAVE" + b"\x00" * 32, "audio/wav")})
    assert r.status_code == 401


def test_voice_turn_rejects_doctor_jwt(client: TestClient):
    """Doctor tokens cannot access patient /intake/turn/voice (403 Forbidden)."""
    chain = _create_patient_chain(client, "vDocA")
    session_id = _start_session(client, chain)

    doc_creds = _register_and_login(client, "doc_voice@test.com", "password123", "doctor")
    doc_headers = _auth_headers(doc_creds["token"])
    r = client.post(
        "/intake/turn/voice",
        data={
            "encounter_id": chain["encounter_id"],
            "session_id": session_id,
            "answering_field_name": "chief_complaint",
        },
        files={"audio_file": ("test.wav", b"RIFF....WAVE" + b"\x00" * 32, "audio/wav")},
        headers=doc_headers,
    )
    assert r.status_code == 403


def test_voice_turn_rejects_empty_audio(client: TestClient):
    """Empty audio file must be rejected with 422."""
    chain = _create_patient_chain(client, "vEmpty")
    session_id = _start_session(client, chain)

    r = client.post(
        "/intake/turn/voice",
        data={
            "encounter_id": chain["encounter_id"],
            "session_id": session_id,
            "answering_field_name": "chief_complaint",
        },
        files={"audio_file": ("empty.wav", b"", "audio/wav")},
        headers=chain["headers"],
    )
    assert r.status_code == 422


def test_voice_turn_rejects_oversized_audio(client: TestClient):
    """Audio file larger than 10MB must be rejected with 422."""
    chain = _create_patient_chain(client, "vBig")
    session_id = _start_session(client, chain)

    oversized = b"A" * (10 * 1024 * 1024 + 1)
    r = client.post(
        "/intake/turn/voice",
        data={
            "encounter_id": chain["encounter_id"],
            "session_id": session_id,
            "answering_field_name": "chief_complaint",
        },
        files={"audio_file": ("huge.wav", oversized, "audio/wav")},
        headers=chain["headers"],
    )
    assert r.status_code == 422


def test_voice_turn_happy_path(client: TestClient):
    """
    Submits a real voice audio payload:
    - Audio is transcribed (mocked in offline run)
    - Entities extracted and persisted with UNREVIEWED status
    - Raw transcript returned in response
    - Next schema question returned
    """
    chain = _create_patient_chain(client, "vHappy")
    session_id = _start_session(client, chain)

    sample_audio = b"RIFF....WAVEfmt " + b"\x00" * 64
    r = client.post(
        "/intake/turn/voice",
        data={
            "encounter_id": chain["encounter_id"],
            "session_id": session_id,
            "answering_field_name": "chief_complaint",
            "language": "en",
        },
        files={"audio_file": ("patient_turn1.wav", sample_audio, "audio/wav")},
        headers=chain["headers"],
    )
    assert r.status_code == 200
    data = r.json()
    assert data["session_id"] == session_id
    assert data["turn_number"] == 1
    assert data["raw_transcript"] is not None
    assert data["next_question"] is not None
    assert data["next_question_field_name"] == "onset"
    assert data["pathway_complete"] is False

    # Check entities
    assert len(data["entities_extracted"]) >= 1
    entity = data["entities_extracted"][0]
    assert entity["field_name"] == "chief_complaint"
    assert "chest pain" in entity["value"].lower()
    assert entity["source_type"] == "intake_session"

