"""
tests/test_health.py

Tests for the /health and /status endpoints.
These are the most basic smoke tests — if these pass, the FastAPI app starts
and the ai_orchestration package is importable.
"""

from fastapi.testclient import TestClient


def test_health_returns_200(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200


def test_health_payload(client: TestClient):
    response = client.get("/health")
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "ps47-core-backend"
    assert "version" in data


def test_status_returns_200(client: TestClient):
    response = client.get("/status")
    assert response.status_code == 200


def test_status_database_check_passes(client: TestClient):
    response = client.get("/status")
    data = response.json()
    assert data["checks"]["database"] == "ok", (
        f"Database check failed: {data['checks']['database']}"
    )


def test_status_ai_orchestration_importable(client: TestClient):
    response = client.get("/status")
    data = response.json()
    assert data["checks"]["ai_orchestration"] == "ok", (
        f"ai_orchestration import failed: {data['checks']['ai_orchestration']}"
    )


def test_status_overall_ok(client: TestClient):
    response = client.get("/status")
    data = response.json()
    assert data["status"] == "ok", f"Overall status degraded: {data}"
