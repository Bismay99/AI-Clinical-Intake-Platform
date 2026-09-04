"""
backend/auth/jwt_handler.py

JWT creation and verification using python-jose.

Tokens carry the minimum required claims:
  sub   — user.id
  role  — UserRole value (for RBAC, so we don't need a DB hit on every request)
  type  — "access" (reserved for future refresh-token differentiation)
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt

from backend.config import settings


def create_access_token(user_id: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """
    Decodes and validates a JWT. Raises jose.JWTError on invalid/expired token.
    The caller (dependencies.py) is responsible for converting JWTError into
    an HTTP 401 response.
    """
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
