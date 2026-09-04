"""
backend/database.py

SQLAlchemy engine, session factory, and declarative base.

Design notes:
  - Uses sync SQLAlchemy 2.x for MVP simplicity.
  - Engine is created lazily on first access so tests can inject a SQLite
    URL via the DATABASE_URL env var before any import happens.
  - Session lifecycle is managed via the get_db FastAPI dependency so every
    request gets its own session that is committed or rolled back on exit.
  - Tests override get_db via app.dependency_overrides — the main engine
    is never touched by test code.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from typing import Generator

from backend.config import settings


# ---------------------------------------------------------------------------
# Declarative base — all ORM models inherit from this
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Engine factory
# ---------------------------------------------------------------------------
def _make_engine(url: str):
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    return create_engine(url, connect_args=connect_args, echo=False)


# Lazy engine — created on first use so env-var overrides in tests take effect.
_engine = None
_session_factory = None


def _get_engine():
    global _engine, _session_factory
    if _engine is None:
        _engine = _make_engine(settings.database_url)
        _session_factory = sessionmaker(autocommit=False, autoflush=False, bind=_engine)
    return _engine


def _get_session_factory():
    _get_engine()
    return _session_factory


# Convenience alias used by Alembic env.py and main.py create_all
@property
def engine():
    return _get_engine()


# The module-level `engine` attribute — accessed by main.py and alembic/env.py
# We expose it as a module-level name via a helper that forces creation.
def get_engine():
    return _get_engine()


# ---------------------------------------------------------------------------
# FastAPI dependency: yields a request-scoped DB session
# Tests override this via app.dependency_overrides[get_db] = ...
# ---------------------------------------------------------------------------
def get_db() -> Generator[Session, None, None]:
    db = _get_session_factory()()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
