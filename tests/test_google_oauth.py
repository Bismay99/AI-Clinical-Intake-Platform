"""
tests/test_google_oauth.py

Unit and integration tests for Google OAuth 2.0 / OpenID Connect (Phase 2D).
Tests cover:
  1. Google OAuth configuration detection.
  2. Missing configuration handling (HTTP 503).
  3. OAuth state generation & CSRF verification.
  4. Invalid / forged OAuth state rejection.
  5. User cancellation handling.
  6. Google provider error handling.
  7. Invalid Google identity rejection.
  8. Unverified Google email rejection.
  9. Existing Google-linked patient login.
  10. Existing Google-linked doctor login.
  11. Unauthorized Google account cannot become doctor.
  12. Successful Google authentication issues valid PS47 JWT (single-use ticket).
  13. Existing email/password /auth/login and /auth/me endpoints continue working.
"""

import urllib.parse
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models.user import User, UserRole
from backend.auth.password import hash_password
from backend.auth.jwt_handler import decode_access_token
from backend.auth.google_oauth import (
    is_google_oauth_configured,
    create_oauth_state,
    verify_oauth_state,
    create_exchange_ticket,
    redeem_exchange_ticket,
)


# ---------------------------------------------------------------------------
# Test 1: Google OAuth configuration detection
# ---------------------------------------------------------------------------
def test_google_oauth_config_present(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")
    assert is_google_oauth_configured() is True


# ---------------------------------------------------------------------------
# Test 2: Missing configuration handled safely
# ---------------------------------------------------------------------------
def test_missing_google_oauth_config_handled_safely(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", None)
    monkeypatch.setattr(settings, "google_client_secret", None)
    response = client.get("/auth/google", follow_redirects=False)
    assert response.status_code == 503
    assert "Google OAuth is not configured" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Test 3: OAuth state generated and verified
# ---------------------------------------------------------------------------
def test_oauth_state_generation_and_verification():
    state = create_oauth_state(role_hint="patient")
    assert isinstance(state, str)
    assert len(state) > 20

    data = verify_oauth_state(state)
    assert data["role_hint"] == "patient"
    assert "nonce" in data
    assert data["type"] == "google_oauth_state"


# ---------------------------------------------------------------------------
# Test 4: Invalid / forged OAuth state rejected
# ---------------------------------------------------------------------------
def test_invalid_oauth_state_rejected(client: TestClient):
    response = client.get(
        "/auth/google/callback?code=mock_code&state=tampered_invalid_state",
        follow_redirects=False,
    )
    assert response.status_code == 307
    redirect_url = response.headers["location"]
    assert "/login?error=invalid_state" in redirect_url


# ---------------------------------------------------------------------------
# Test 5: Google cancellation handled
# ---------------------------------------------------------------------------
def test_google_cancellation_handled(client: TestClient):
    response = client.get(
        "/auth/google/callback?error=access_denied&error_description=User+denied+access",
        follow_redirects=False,
    )
    assert response.status_code == 307
    redirect_url = response.headers["location"]
    assert "error=google_auth_failed" in redirect_url
    assert "detail=access_denied" in redirect_url


# ---------------------------------------------------------------------------
# Test 6: Google callback error handled
# ---------------------------------------------------------------------------
def test_google_callback_error_handled(client: TestClient):
    response = client.get(
        "/auth/google/callback?error=server_error",
        follow_redirects=False,
    )
    assert response.status_code == 307
    redirect_url = response.headers["location"]
    assert "error=google_auth_failed" in redirect_url


# ---------------------------------------------------------------------------
# Test 7: Invalid Google identity rejected
# ---------------------------------------------------------------------------
def test_invalid_google_identity_rejected(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    async def mock_exchange(code):
        return {"id_token": "fake_id_token", "access_token": "fake_access"}

    def mock_verify(token):
        raise ValueError("Invalid cryptographic signature")

    monkeypatch.setattr("backend.routers.auth.exchange_code_for_tokens", mock_exchange)
    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify)

    valid_state = create_oauth_state(role_hint="patient")
    response = client.get(
        f"/auth/google/callback?code=mock_code&state={valid_state}",
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert "/login?error=invalid_identity" in response.headers["location"]


# ---------------------------------------------------------------------------
# Test 8: Unverified Google email rejected
# ---------------------------------------------------------------------------
def test_unverified_google_email_rejected(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    async def mock_exchange(code):
        return {"id_token": "fake_id_token"}

    def mock_verify(token):
        return {
            "sub": "sub_unverified_123",
            "email": "unverified@example.com",
            "email_verified": False,
            "name": "Unverified User",
        }

    monkeypatch.setattr("backend.routers.auth.exchange_code_for_tokens", mock_exchange)
    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify)

    valid_state = create_oauth_state(role_hint="patient")
    response = client.get(
        f"/auth/google/callback?code=mock_code&state={valid_state}",
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert "/login?error=unverified_email" in response.headers["location"]


# ---------------------------------------------------------------------------
# Test 9: Existing Google-linked patient logs in
# ---------------------------------------------------------------------------
def test_existing_google_linked_patient_logs_in(client: TestClient, db: Session, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    patient_user = User(
        email="patient_linked@example.com",
        role=UserRole.patient,
        full_name="Linked Patient",
        google_subject_id="google_sub_patient_999",
        hashed_password=None,
        is_active=True,
    )
    db.add(patient_user)
    db.commit()

    async def mock_exchange(code):
        return {"id_token": "fake_id_token"}

    def mock_verify(token):
        return {
            "sub": "google_sub_patient_999",
            "email": "patient_linked@example.com",
            "email_verified": True,
            "name": "Linked Patient",
        }

    monkeypatch.setattr("backend.routers.auth.exchange_code_for_tokens", mock_exchange)
    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify)

    valid_state = create_oauth_state(role_hint="patient")
    response = client.get(
        f"/auth/google/callback?code=mock_code&state={valid_state}",
        follow_redirects=False,
    )
    assert response.status_code == 307
    loc = response.headers["location"]
    assert "/auth/callback?ticket=" in loc

    # Extract ticket and redeem
    ticket = loc.split("ticket=")[1]
    redeem_resp = client.post("/auth/google/exchange", json={"ticket": ticket})
    assert redeem_resp.status_code == 200
    token_data = redeem_resp.json()
    assert token_data["role"] == "patient"
    assert token_data["user_id"] == patient_user.id
    assert "access_token" in token_data


# ---------------------------------------------------------------------------
# Test 10: Existing Google-linked doctor logs in
# ---------------------------------------------------------------------------
def test_existing_google_linked_doctor_logs_in(client: TestClient, db: Session, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    doctor_user = User(
        email="doctor_linked@example.com",
        role=UserRole.doctor,
        full_name="Dr. Linked Doctor",
        google_subject_id="google_sub_doctor_888",
        hospital_affiliation="City Hospital",
        hashed_password=None,
        is_active=True,
    )
    db.add(doctor_user)
    db.commit()

    async def mock_exchange(code):
        return {"id_token": "fake_id_token"}

    def mock_verify(token):
        return {
            "sub": "google_sub_doctor_888",
            "email": "doctor_linked@example.com",
            "email_verified": True,
            "name": "Dr. Linked Doctor",
        }

    monkeypatch.setattr("backend.routers.auth.exchange_code_for_tokens", mock_exchange)
    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify)

    valid_state = create_oauth_state(role_hint="doctor")
    response = client.get(
        f"/auth/google/callback?code=mock_code&state={valid_state}",
        follow_redirects=False,
    )
    assert response.status_code == 307
    loc = response.headers["location"]
    assert "/auth/callback?ticket=" in loc

    ticket = loc.split("ticket=")[1]
    redeem_resp = client.post("/auth/google/exchange", json={"ticket": ticket})
    assert redeem_resp.status_code == 200
    assert redeem_resp.json()["role"] == "doctor"


# ---------------------------------------------------------------------------
# Test 11: Unauthorized Google account cannot become doctor
# ---------------------------------------------------------------------------
def test_unauthorized_google_account_cannot_become_doctor(client: TestClient, db: Session, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    async def mock_exchange(code):
        return {"id_token": "fake_id_token"}

    # Scenario A: New user trying to sign in as doctor
    def mock_verify_new(token):
        return {
            "sub": "google_sub_imposter_1",
            "email": "imposter_new@example.com",
            "email_verified": True,
            "name": "Fake Doctor",
        }

    monkeypatch.setattr("backend.routers.auth.exchange_code_for_tokens", mock_exchange)
    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify_new)

    valid_state_doc = create_oauth_state(role_hint="doctor")
    response = client.get(
        f"/auth/google/callback?code=mock_code&state={valid_state_doc}",
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert "/login?error=doctor_account_required" in response.headers["location"]

    # Scenario B: Existing patient user trying to select doctor
    patient_user = User(
        email="existing_patient@example.com",
        role=UserRole.patient,
        full_name="Regular Patient",
        google_subject_id="google_sub_patient_only",
        hashed_password=None,
        is_active=True,
    )
    db.add(patient_user)
    db.commit()

    def mock_verify_patient(token):
        return {
            "sub": "google_sub_patient_only",
            "email": "existing_patient@example.com",
            "email_verified": True,
            "name": "Regular Patient",
        }

    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify_patient)

    response2 = client.get(
        f"/auth/google/callback?code=mock_code&state={valid_state_doc}",
        follow_redirects=False,
    )
    assert response2.status_code == 307
    assert "/login?error=unauthorized_doctor" in response2.headers["location"]


# ---------------------------------------------------------------------------
# Test 12: Successful Google authentication issues valid PS47 JWT (single-use ticket)
# ---------------------------------------------------------------------------
def test_successful_google_authentication_issues_ps47_jwt(client: TestClient, db: Session, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    async def mock_exchange(code):
        return {"id_token": "fake_id_token"}

    def mock_verify(token):
        return {
            "sub": "google_sub_new_patient_777",
            "email": "brand_new_patient@example.com",
            "email_verified": True,
            "name": "New Patient",
        }

    monkeypatch.setattr("backend.routers.auth.exchange_code_for_tokens", mock_exchange)
    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify)

    valid_state = create_oauth_state(role_hint="patient")
    response = client.get(
        f"/auth/google/callback?code=mock_code&state={valid_state}",
        follow_redirects=False,
    )
    assert response.status_code == 307
    loc = response.headers["location"]
    ticket = loc.split("ticket=")[1]

    # Redeem ticket
    redeem_resp = client.post("/auth/google/exchange", json={"ticket": ticket})
    assert redeem_resp.status_code == 200
    token_data = redeem_resp.json()
    jwt_token = token_data["access_token"]
    assert token_data["role"] == "patient"

    # Decode and verify JWT claims
    claims = decode_access_token(jwt_token)
    assert claims["sub"] == token_data["user_id"]
    assert claims["role"] == "patient"
    assert claims["type"] == "access"

    # Verify single-use: second redemption must fail
    replay_resp = client.post("/auth/google/exchange", json={"ticket": ticket})
    assert replay_resp.status_code == 400
    assert "Invalid or expired" in replay_resp.json()["detail"]


# ---------------------------------------------------------------------------
# Test 13: Existing /auth/login and /auth/me still work
# ---------------------------------------------------------------------------
def test_existing_auth_login_and_me_still_work(client: TestClient, db: Session):
    email = "legacy_user@example.com"
    pwd = "password123"
    user = User(
        email=email,
        hashed_password=hash_password(pwd),
        full_name="Legacy User",
        role=UserRole.patient,
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Test POST /auth/login
    login_resp = client.post("/auth/login", json={"email": email, "password": pwd})
    assert login_resp.status_code == 200
    data = login_resp.json()
    assert "access_token" in data
    assert data["role"] == "patient"

    # Test GET /auth/me
    me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["email"] == email
    assert me_data["role"] == "patient"


# ---------------------------------------------------------------------------
# Test 14: Google-only user cannot log in via password authentication
# ---------------------------------------------------------------------------
def test_google_only_user_cannot_login_with_password(client: TestClient, db: Session):
    email = "google_only_pt@example.com"
    user = User(
        email=email,
        hashed_password=None,
        full_name="Google Only User",
        google_subject_id="sub_google_only_123",
        role=UserRole.patient,
        is_active=True,
    )
    db.add(user)
    db.commit()

    # Attempt password login
    login_resp = client.post("/auth/login", json={"email": email, "password": "anypassword123"})
    assert login_resp.status_code == 401
    assert "Incorrect email or password" in login_resp.json()["detail"]


# ---------------------------------------------------------------------------
# Test 15: Returning Google account does not create duplicate user
# ---------------------------------------------------------------------------
def test_returning_google_account_does_not_create_duplicate(client: TestClient, db: Session, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    async def mock_exchange(code):
        return {"id_token": "fake_id_token"}

    def mock_verify(token):
        return {
            "sub": "sub_repeat_user_999",
            "email": "repeat_google@example.com",
            "email_verified": True,
            "name": "Repeat User",
        }

    monkeypatch.setattr("backend.routers.auth.exchange_code_for_tokens", mock_exchange)
    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify)

    # First sign in (creates user)
    state1 = create_oauth_state(role_hint="patient")
    resp1 = client.get(f"/auth/google/callback?code=mock_code&state={state1}", follow_redirects=False)
    assert resp1.status_code == 307
    assert "/auth/callback?ticket=" in resp1.headers["location"]

    # Second sign in (returning user)
    state2 = create_oauth_state(role_hint="patient")
    resp2 = client.get(f"/auth/google/callback?code=mock_code&state={state2}", follow_redirects=False)
    assert resp2.status_code == 307
    assert "/auth/callback?ticket=" in resp2.headers["location"]

    # Verify exactly one user in DB
    users = db.query(User).filter(User.email == "repeat_google@example.com").all()
    assert len(users) == 1
    assert users[0].google_subject_id == "sub_repeat_user_999"


# ---------------------------------------------------------------------------
# Test 16: Database error during Google callback redirects safely
# ---------------------------------------------------------------------------
def test_database_error_redirects_safely(client: TestClient, db: Session, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    async def mock_exchange(code):
        return {"id_token": "fake_id_token"}

    def mock_verify(token):
        return {
            "sub": "sub_db_error_123",
            "email": "dberror@example.com",
            "email_verified": True,
            "name": "DB Error User",
        }

    def mock_flush_error():
        raise RuntimeError("Simulated database failure")

    monkeypatch.setattr("backend.routers.auth.exchange_code_for_tokens", mock_exchange)
    monkeypatch.setattr("backend.routers.auth.verify_google_id_token", mock_verify)
    monkeypatch.setattr(db, "flush", mock_flush_error)

    state = create_oauth_state(role_hint="patient")
    resp = client.get(f"/auth/google/callback?code=mock_code&state={state}", follow_redirects=False)
    assert resp.status_code == 307
    loc = resp.headers["location"]
    assert "/login?error=database_error" in loc
    assert "Simulated database failure" not in loc