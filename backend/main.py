"""
backend/main.py

FastAPI application factory and startup logic.

Architecture note (per implementation plan):
  - ai_orchestration is imported as a sibling package in the same Python process.
  - The Core Backend calls brain.py functions directly (no HTTP hop).
  - brain.py never writes to the database — all persistence happens here.
"""

import os
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from backend.config import settings
from backend.models import Base       # imports all ORM models, registers them with Base.metadata
from backend.database import get_engine
from backend.routers import health, auth, patients, encounters, intake, doctor, reports


# ---------------------------------------------------------------------------
# Lifespan: run setup/teardown at startup/shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create upload directory if it doesn't exist
    os.makedirs(settings.upload_dir, exist_ok=True)

    # In development/test, attempt to create all tables via SQLAlchemy directly.
    # Wrapped in try/except so the app starts even when PostgreSQL is unavailable
    # (tests use SQLite via get_db dependency override; Alembic handles production).
    if settings.app_env in ("development", "test"):
        try:
            Base.metadata.create_all(bind=get_engine())
        except Exception:
            pass  # DB not reachable — Alembic handles production migrations

    yield  # application runs here


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------
app = FastAPI(
    title="PS 47 — AI Pre-Consultation Intake System",
    description=(
        "Core Backend API for the PS47 AI-powered clinical intake system. "
        "Provides patient intake management, document processing orchestration, "
        "and doctor verification workflows. "
        "AI orchestration is handled internally via ai_orchestration/brain.py."
    ),
    version=settings.app_version,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# Explicit origins required when allow_credentials=True.
# ---------------------------------------------------------------------------
cors_origins = list(settings.cors_origins)
if settings.frontend_url and settings.frontend_url not in cors_origins:
    cors_origins.append(settings.frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(patients.router)
app.include_router(encounters.router)
app.include_router(intake.router)
app.include_router(doctor.router)
app.include_router(reports.router)


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def root():
    return {"message": "PS47 Core Backend is running. See /docs for the API reference."}
