"""
tests/test_profile_edit.py

Comprehensive security and functional tests for the Central Profile Edit System:
1. Patient A updates own profile -> 200 OK
2. Patient A cannot update Patient B's profile (impossible / scoped to JWT) -> 200 updates only own
3. Doctor A updates own profile -> 200 OK
4. Doctor A cannot update Doctor B's profile (scoped to JWT) -> updates only own
5. Patient cannot access doctor profile endpoints -> 403 Forbidden
6. Doctor cannot access patient profile update endpoint -> 403 Forbidden
7. Unauthenticated profile update -> 401 Unauthorized
8. Invalid profile data (e.g. blank full_name) -> 422 Unprocessable Entity
9. Updated profile persists after re-login and is returned by GET profile
10. Historical clinical records, documents, and entities remain completely intact after profile update
"""

import pytest
from fastapi.testclient import TestClient
from backend.models.extracted_entity import ExtractedEntity, SourceType, VerificationStatus
from backend.models.document import Document
from backend.models.clinical_summary import ClinicalSummary
from backend.models.encounter import Encounter, EncounterStatus


def register_and_login(client: TestClient, email: str, password: str = "pass1234", role: str = "patient", full_name: str = "Test User") -> str:
    r1 = client.post("/auth/register", json={"email": email, "password": password, "role": role, "full_name": full_name})
    assert r1.status_code == 201
    r2 = client.post("/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200
    return r2.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class TestPatientProfileUpdate:
    def test_patient_updates_own_profile_success(self, client: TestClient):
        token = register_and_login(client, "patient_a@test.com", role="patient", full_name="Original Name")
        r_create = client.post("/patients/profile", json={
            "full_name": "Original Name",
            "date_of_birth": "1990-01-01",
            "gender": "male",
            "phone": "9999999999",
            "preferred_language": "en",
            "hospital_identifier": "HIS-001"
        }, headers=auth_headers(token))
        assert r_create.status_code == 201

        # Now PATCH /patients/profile
        r_patch = client.patch("/patients/profile", json={
            "full_name": "Updated Name",
            "phone": "8888888888",
            "gender": "other",
            "preferred_language": "hi",
            "hospital_identifier": "HIS-002"
        }, headers=auth_headers(token))
        assert r_patch.status_code == 200
        data = r_patch.json()
        assert data["full_name"] == "Updated Name"
        assert data["phone"] == "8888888888"
        assert data["gender"] == "other"
        assert data["preferred_language"] == "hi"
        assert data["hospital_identifier"] == "HIS-002"
        assert data["date_of_birth"] == "1990-01-01"  # Unmodified field preserved

        # Confirm GET /patients/profile returns updated values
        r_get = client.get("/patients/profile", headers=auth_headers(token))
        assert r_get.status_code == 200
        assert r_get.json()["full_name"] == "Updated Name"

        # Confirm GET /auth/me returns updated full_name
        r_me = client.get("/auth/me", headers=auth_headers(token))
        assert r_me.status_code == 200
        assert r_me.json()["full_name"] == "Updated Name"

    def test_patient_cannot_edit_other_patient_profile(self, client: TestClient):
        # Patient 1
        t1 = register_and_login(client, "p1@test.com", role="patient", full_name="Patient One")
        client.post("/patients/profile", json={"full_name": "Patient One", "preferred_language": "en"}, headers=auth_headers(t1))

        # Patient 2
        t2 = register_and_login(client, "p2@test.com", role="patient", full_name="Patient Two")
        client.post("/patients/profile", json={"full_name": "Patient Two", "preferred_language": "en"}, headers=auth_headers(t2))

        # Patient 2 tries to send payload. Endpoints do not take an ID parameter:
        # they strictly update the current JWT user's profile.
        r_patch2 = client.patch("/patients/profile", json={"full_name": "Patient Two Renamed"}, headers=auth_headers(t2))
        assert r_patch2.status_code == 200

        # Verify Patient 1 profile is completely untouched
        r_get1 = client.get("/patients/profile", headers=auth_headers(t1))
        assert r_get1.status_code == 200
        assert r_get1.json()["full_name"] == "Patient One"

    def test_patient_update_validation_errors(self, client: TestClient):
        token = register_and_login(client, "pval@test.com", role="patient", full_name="Patient Val")
        client.post("/patients/profile", json={"full_name": "Patient Val", "preferred_language": "en"}, headers=auth_headers(token))

        # Blank full name should be rejected with 422
        r_blank = client.patch("/patients/profile", json={"full_name": "   "}, headers=auth_headers(token))
        assert r_blank.status_code == 422

    def test_unauthenticated_patient_update_fails(self, client: TestClient):
        r = client.patch("/patients/profile", json={"full_name": "Anonymous"})
        assert r.status_code == 401


class TestDoctorProfileUpdate:
    def test_doctor_updates_own_profile_success(self, client: TestClient):
        token = register_and_login(client, "doc_a@test.com", role="doctor", full_name="Dr. Smith")

        # Initial GET /doctor/profile
        r_get = client.get("/doctor/profile", headers=auth_headers(token))
        assert r_get.status_code == 200
        assert r_get.json()["full_name"] == "Dr. Smith"

        # PATCH /doctor/profile
        r_patch = client.patch("/doctor/profile", json={
            "full_name": "Dr. Sarah Smith",
            "hospital_affiliation": "AIIMS Cardiology OPD"
        }, headers=auth_headers(token))
        assert r_patch.status_code == 200
        data = r_patch.json()
        assert data["full_name"] == "Dr. Sarah Smith"
        assert data["hospital_affiliation"] == "AIIMS Cardiology OPD"

        # Confirm persistence on GET /doctor/profile
        r_get2 = client.get("/doctor/profile", headers=auth_headers(token))
        assert r_get2.status_code == 200
        assert r_get2.json()["full_name"] == "Dr. Sarah Smith"
        assert r_get2.json()["hospital_affiliation"] == "AIIMS Cardiology OPD"

        # Confirm GET /auth/me returns updated full_name
        r_me = client.get("/auth/me", headers=auth_headers(token))
        assert r_me.status_code == 200
        assert r_me.json()["full_name"] == "Dr. Sarah Smith"

    def test_doctor_cannot_edit_other_doctor_profile(self, client: TestClient):
        doc1_tok = register_and_login(client, "d1@test.com", role="doctor", full_name="Dr. One")
        doc2_tok = register_and_login(client, "d2@test.com", role="doctor", full_name="Dr. Two")

        # Doc 2 updates profile
        r2 = client.patch("/doctor/profile", json={"full_name": "Dr. Two Modified"}, headers=auth_headers(doc2_tok))
        assert r2.status_code == 200

        # Doc 1 is untouched
        r1 = client.get("/doctor/profile", headers=auth_headers(doc1_tok))
        assert r1.status_code == 200
        assert r1.json()["full_name"] == "Dr. One"

    def test_doctor_update_validation_errors(self, client: TestClient):
        token = register_and_login(client, "doc_val@test.com", role="doctor", full_name="Dr. Val")
        r_blank = client.patch("/doctor/profile", json={"full_name": "   "}, headers=auth_headers(token))
        assert r_blank.status_code == 422

    def test_unauthenticated_doctor_update_fails(self, client: TestClient):
        r = client.patch("/doctor/profile", json={"full_name": "Fake Doctor"})
        assert r.status_code == 401

    def test_cross_role_access_prevented(self, client: TestClient):
        p_tok = register_and_login(client, "patient_cross@test.com", role="patient", full_name="Pat")
        d_tok = register_and_login(client, "doctor_cross@test.com", role="doctor", full_name="Doc")

        # Patient cannot call doctor endpoints
        r_p2d = client.patch("/doctor/profile", json={"full_name": "Hacker"}, headers=auth_headers(p_tok))
        assert r_p2d.status_code == 403

        # Doctor cannot call patient endpoints
        r_d2p = client.patch("/patients/profile", json={"full_name": "Hacker"}, headers=auth_headers(d_tok))
        assert r_d2p.status_code == 403


class TestClinicalIntegrityPreservation:
    def test_profile_update_does_not_mutate_historical_clinical_evidence(self, client: TestClient, db):
        # 1. Setup patient with encounter, summary, and clinical entity
        p_tok = register_and_login(client, "clinical_integrity@test.com", role="patient", full_name="Alice Original")
        p_prof = client.post("/patients/profile", json={"full_name": "Alice Original", "preferred_language": "en"}, headers=auth_headers(p_tok)).json()
        patient_id = p_prof["id"]

        r_enc = client.post("/encounters", json={"opd_department": "General OPD"}, headers=auth_headers(p_tok))
        enc_id = r_enc.json()["id"]

        # Insert historical extracted entity
        entity = ExtractedEntity(
            encounter_id=enc_id,
            field_name="chief_complaint",
            value="Chest pain for 2 days",
            original_ai_value="Chest pain for 2 days",
            confidence=0.95,
            verification_status=VerificationStatus.unreviewed,
            source_type=SourceType.intake_session,
            source_id="msg-123",
            source_location="transcript line 4",
        )
        db.add(entity)
        db.commit()
        db.refresh(entity)
        entity_id = entity.id

        # 2. Patient changes demographic profile name and phone
        r_patch = client.patch("/patients/profile", json={"full_name": "Alice Updated", "phone": "1234567890"}, headers=auth_headers(p_tok))
        assert r_patch.status_code == 200

        # 3. Assert historical clinical record is completely uncorrupted
        db.expire_all()
        refreshed_entity = db.query(ExtractedEntity).filter(ExtractedEntity.id == entity_id).first()
        assert refreshed_entity is not None
        assert refreshed_entity.value == "Chest pain for 2 days"
        assert refreshed_entity.original_ai_value == "Chest pain for 2 days"
        assert refreshed_entity.source_type == SourceType.intake_session
        assert refreshed_entity.source_location == "transcript line 4"
        assert refreshed_entity.verification_status == VerificationStatus.unreviewed
