"""
backend/routers/health.py

Health and status endpoints — the first thing to verify after deployment.

GET /health  — simple liveness probe (no DB required)
GET /status  — readiness probe: checks DB connection and ai_orchestration import
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.database import get_db
from backend.config import settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    """Liveness check — returns 200 immediately if the process is alive."""
    return {
        "status": "ok",
        "service": "ps47-core-backend",
        "version": settings.app_version,
        "env": settings.app_env,
    }


@router.get("/status")
def status(db: Session = Depends(get_db)):
    """
    Readiness check:
      - Verifies DB connectivity with a trivial query.
      - Verifies the ai_orchestration package can be imported and its
        core contracts are accessible.
    """
    checks = {}

    # 1. Database connectivity
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    # 2. AI orchestration package importability
    try:
        from ai_orchestration.brain import (
            handle_document, handle_intake_turn, handle_timeline, handle_summary,
        )
        from ai_orchestration.contracts import ExtractedEntity, IntakeRequest
        checks["ai_orchestration"] = "ok"
    except Exception as exc:
        checks["ai_orchestration"] = f"error: {exc}"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {
        "status": overall,
        "checks": checks,
        "version": settings.app_version,
    }
