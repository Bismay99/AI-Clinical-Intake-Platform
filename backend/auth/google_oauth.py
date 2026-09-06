"""
backend/auth/google_oauth.py

Google OAuth 2.0 / OpenID Connect service for PS47.
Handles:
  1. OAuth state generation & CSRF verification (signed token).
  2. Authorization URL construction with minimal scopes (openid, email, profile).
  3. Server-side authorization-code exchange with Google token endpoint.
  4. Server-side OpenID Connect ID token cryptographic verification using
     google.oauth2.id_token (audience, issuer, signature validation).
  5. Short-lived single-use authentication exchange tickets to avoid exposing
     JWT tokens in browser URL redirects.
"""

import logging
import secrets
import time
import uuid
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import httpx
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jose import JWTError, jwt

from backend.config import settings

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
REQUIRED_SCOPES = "openid email profile"

# In-memory store for single-use short-lived exchange tickets (60s lifetime)
_EXCHANGE_TICKETS: Dict[str, Dict[str, Any]] = {}


def is_google_oauth_configured() -> bool:
    """Returns True if Google Client ID and Secret are configured."""
    return bool(settings.google_client_id and settings.google_client_secret)


def create_oauth_state(role_hint: Optional[str] = None) -> str:
    """
    Generates a cryptographically signed OAuth state token to prevent CSRF.
    Valid for 10 minutes.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {
        "nonce": secrets.token_urlsafe(24),
        "role_hint": role_hint,
        "type": "google_oauth_state",
        "exp": expire,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_oauth_state(state_token: str) -> Dict[str, Any]:
    """
    Decodes and validates the OAuth state token.
    Raises ValueError if state is invalid, expired, or forged.
    """
    try:
        payload = jwt.decode(
            state_token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "google_oauth_state":
            raise ValueError("Invalid OAuth state type")
        return payload
    except JWTError as exc:
        raise ValueError(f"Invalid or expired OAuth state: {exc}") from exc


def get_google_authorization_url(state: str) -> str:
    """Constructs the Google OAuth 2.0 authorization endpoint URL."""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": REQUIRED_SCOPES,
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> Dict[str, Any]:
    """
    Exchanges the Google authorization code for access and ID tokens via
    POST to https://oauth2.googleapis.com/token.
    """
    data = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(GOOGLE_TOKEN_URL, data=data)

    if response.status_code != 200:
        logger.error("Google token exchange failed with status %d", response.status_code)
        raise ValueError("Failed to exchange authorization code with Google")

    return response.json()


def verify_google_id_token(raw_id_token: str) -> Dict[str, Any]:
    """
    Verifies the cryptographic signature and claims of the Google OpenID Connect ID token.
    Uses Google's canonical google-auth library.
    Validates audience, issuer, and expiry against Google's public certificates.
    """
    request = google_requests.Request()
    try:
        claims = google_id_token.verify_oauth2_token(
            raw_id_token,
            request,
            audience=settings.google_client_id,
        )
        return claims
    except Exception as exc:
        logger.error("Google ID token verification failed: %s", exc)
        raise ValueError(f"Invalid Google ID token: {exc}") from exc


def create_exchange_ticket(payload: Dict[str, Any]) -> str:
    """
    Creates a single-use, 60-second authentication ticket.
    Prevents passing sensitive PS47 JWTs in URL query parameters.
    """
    now = time.time()
    # Prune expired tickets
    for key in [k for k, v in _EXCHANGE_TICKETS.items() if v["expires_at"] < now]:
        _EXCHANGE_TICKETS.pop(key, None)

    ticket = str(uuid.uuid4())
    _EXCHANGE_TICKETS[ticket] = {
        "payload": payload,
        "expires_at": now + 60,
    }
    return ticket


def redeem_exchange_ticket(ticket: str) -> Optional[Dict[str, Any]]:
    """
    Redeems a single-use exchange ticket.
    Immediately invalidates the ticket to prevent replay.
    """
    now = time.time()
    entry = _EXCHANGE_TICKETS.pop(ticket, None)
    if not entry or entry["expires_at"] < now:
        return None
    return entry["payload"]