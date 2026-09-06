"""
tests/test_auth.py

Tests for the auth endpoints:
  POST /auth/register
  POST /auth/login
  GET  /auth/me

Covers: registration, login, JWT issuance, RBAC role in token,
        duplicate email rejection, wrong password rejection,
        /me with valid and invalid tokens.
"""

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def register_and_login(client: TestClient, email: str, password: str, role: str) -> str:
    """Registers a user and returns their access token."""
    r = client.post("/auth/register", json={
        "email": email,
        "password": password,
        "full_name": "Test User",
        "role": role,
    })
    assert r.status_code == 201, f"Register failed: {r.json()}"

    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"Login failed: {r.json()}"
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------
def test_register_patient_success(client: TestClient):
    r = client.post("/auth/register", json={
        "email": "patient1@test.com",
        "password": "secret123",
        "full_name": "Ramesh Kumar",
        "role": "patient",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["role"] == "patient"
    assert data["email"] == "patient1@test.com"
    assert "id" in data


def test_register_doctor_success(client: TestClient):
    r = client.post("/auth/register", json={
        "email": "doctor1@test.com",
        "password": "docpass123",
        "full_name": "Dr. Priya Sharma",
        "role": "doctor",
        "hospital_affiliation": "AIIMS Delhi",
    })
    assert r.status_code == 201
    assert r.json()["role"] == "doctor"


def test_register_duplicate_email_rejected(client: TestClient):
    payload = {"email": "dup@test.com", "password": "pass1234", "full_name": "A", "role": "patient"}
    r1 = client.post("/auth/register", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/auth/register", json=payload)
    assert r2.status_code == 400
    assert "already registered" in r2.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------
def test_login_returns_token(client: TestClient):
    client.post("/auth/register", json={
        "email": "logintest@test.com", "password": "pass1234",
        "full_name": "Login User", "role": "patient",
    })
    r = client.post("/auth/login", json={"email": "logintest@test.com", "password": "pass1234"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "patient"
    assert "user_id" in data


def test_login_wrong_password_rejected(client: TestClient):
    client.post("/auth/register", json={
        "email": "wrongpass@test.com", "password": "correct123",
        "full_name": "X", "role": "patient",
    })
    # Use a 6+ char wrong password so Pydantic validation passes and we get a real 401
    r = client.post("/auth/login", json={"email": "wrongpass@test.com", "password": "wrongpass"})
    assert r.status_code == 401


def test_login_unknown_email_rejected(client: TestClient):
    r = client.post("/auth/login", json={"email": "nobody@test.com", "password": "anything"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# /me — requires valid JWT
# ---------------------------------------------------------------------------
def test_me_returns_profile(client: TestClient):
    token = register_and_login(client, "me_test@test.com", "mypassword", "doctor")
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "me_test@test.com"
    assert r.json()["role"] == "doctor"


def test_me_no_token_rejected(client: TestClient):
    # FastAPI 0.141+ HTTPBearer returns 401 when Authorization header is missing
    r = client.get("/auth/me")
    assert r.status_code in (401, 403)  # either is an auth rejection


def test_me_invalid_token_rejected(client: TestClient):
    # HTTPBearer accepts the Bearer format but the JWT is invalid → 401 from our handler
    r = client.get("/auth/me", headers={"Authorization": "Bearer totally-fake-token"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# CORS Preflight — Regression tests for browser local development
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("origin", [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://[::1]:3001",
])
def test_cors_preflight_login_allowed_origins(client: TestClient, origin: str):
    headers = {
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
    }
    r = client.options("/auth/login", headers=headers)
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == origin
    assert r.headers.get("access-control-allow-credentials") == "true"


def test_cors_preflight_disallowed_origin(client: TestClient):
    headers = {
        "Origin": "http://evil.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
    }
    r = client.options("/auth/login", headers=headers)
    assert r.status_code == 400

