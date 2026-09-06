"""
backend/routers/auth.py

Authentication endpoints:
  POST /auth/register        — internal/demo use; creates a user record
  POST /auth/login           — any role; returns JWT
  GET  /auth/me              — returns the current authenticated user's profile
  GET  /auth/google          — initiates Google OAuth 2.0 flow
  GET  /auth/google/callback — handles Google redirect, verifies ID token, links/creates user
  POST /auth/google/exchange — exchanges single-use ticket for PS47 JWT
"""

import logging
import urllib.parse
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.models.user import User, UserRole
from backend.auth.password import hash_password, verify_password
from backend.auth.jwt_handler import create_access_token
from backend.auth.dependencies import get_current_user
from backend.schemas.auth import (
    LoginRequest,
    TokenResponse,
    RegisterRequest,
    UserResponse,
    ExchangeTicketRequest,
)
from backend.auth.google_oauth import (
    is_google_oauth_configured,
    create_oauth_state,
    verify_oauth_state,
    get_google_authorization_url,
    exchange_code_for_tokens,
    verify_google_id_token,
    create_exchange_ticket,
    redeem_exchange_ticket,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """
    Creates a new user. In production this would be restricted to admins or
    the hospital onboarding workflow. Exposed openly here for demo/seeding.
    """
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        hospital_affiliation=payload.hospital_affiliation,
    )
    db.add(user)
    db.flush()   # get user.id without committing (commit happens in get_db on exit)
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """
    Unified login for all roles. The JWT carries the role so downstream
    endpoints can enforce RBAC without an extra DB query.
    """
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()
    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    token = create_access_token(user_id=user.id, role=user.role.value)
    return TokenResponse(access_token=token, role=user.role.value, user_id=user.id)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns the authenticated user's profile."""
    return current_user


# ---------------------------------------------------------------------------
# Google OAuth 2.0 / OpenID Connect Endpoints (Phase 2D)
# ---------------------------------------------------------------------------

@router.get("/google")
def google_login(role: Optional[str] = Query(None, description="UI role hint: patient or doctor")):
    """
    Initiates Google OAuth 2.0 authorization code flow.
    Generates a secure, signed CSRF state token and redirects to Google.
    """
    if not is_google_oauth_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on this server.",
        )

    # Validate role hint if supplied
    normalized_role = role.lower().strip() if role else None
    if normalized_role and normalized_role not in ("patient", "doctor"):
        normalized_role = None

    state = create_oauth_state(role_hint=normalized_role)
    authorization_url = get_google_authorization_url(state)
    return RedirectResponse(url=authorization_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/google/callback")
async def google_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Receives Google authorization code, verifies state token, exchanges code
    for tokens, cryptographically validates the Google OpenID Connect ID token,
    resolves/links the PS47 user, issues a PS47 JWT, and redirects to the frontend
    with a single-use exchange ticket.
    """
    frontend_base = settings.frontend_url.rstrip("/")

    # 1. Handle user cancellation or Google authorization errors
    if error:
        logger.warning("Google OAuth error: %s (%s)", error, error_description)
        redirect_url = f"{frontend_base}/login?error=google_auth_failed&detail={urllib.parse.quote(error)}"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    if not code or not state:
        redirect_url = f"{frontend_base}/login?error=invalid_request"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # 2. Validate signed CSRF state token
    try:
        state_data = verify_oauth_state(state)
    except ValueError as exc:
        logger.warning("Google OAuth state validation failed: %s", exc)
        redirect_url = f"{frontend_base}/login?error=invalid_state"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    role_hint = state_data.get("role_hint")

    # 3. Exchange authorization code for tokens
    try:
        token_data = await exchange_code_for_tokens(code)
    except ValueError as exc:
        logger.error("Failed Google token exchange: %s", exc)
        redirect_url = f"{frontend_base}/login?error=exchange_failed"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    id_token_raw = token_data.get("id_token")
    if not id_token_raw:
        logger.error("Google token response missing id_token")
        redirect_url = f"{frontend_base}/login?error=missing_id_token"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # 4. Verify Google ID token signature and claims server-side
    try:
        claims = verify_google_id_token(id_token_raw)
    except ValueError as exc:
        logger.error("Google ID token verification failed: %s", exc)
        redirect_url = f"{frontend_base}/login?error=invalid_identity"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    email = claims.get("email")
    email_verified = claims.get("email_verified", False)
    google_sub = claims.get("sub")
    name = claims.get("name")

    if not email or not google_sub:
        redirect_url = f"{frontend_base}/login?error=invalid_identity"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # Reject unverified emails
    if not email_verified:
        logger.warning("Rejected unverified Google email %s", email)
        redirect_url = f"{frontend_base}/login?error=unverified_email"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    email_clean = email.strip().lower()

    # 5. Account resolution & RBAC enforcement
    try:
        # Check 5a: Existing user with linked google_subject_id
        user = db.query(User).filter(User.google_subject_id == google_sub).first()

        if not user:
            # Check 5b: Existing user by verified email
            user = db.query(User).filter(User.email == email_clean).first()
            if user:
                # Safe account linking: link google_subject_id to verified account
                user.google_subject_id = google_sub
                if not user.full_name and name:
                    user.full_name = name
                db.flush()
            else:
                # Check 5c: New user creation
                # DOCTOR SECURITY: Google authentication does NOT grant doctor privileges.
                if role_hint == "doctor":
                    logger.warning("Unregistered Google user attempted to register as doctor: %s", email_clean)
                    redirect_url = f"{frontend_base}/login?error=doctor_account_required"
                    return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

                # New patients can be registered with minimal verified identity
                user = User(
                    email=email_clean,
                    role=UserRole.patient,
                    full_name=name or email_clean.split("@")[0],
                    google_subject_id=google_sub,
                    hashed_password=None,
                    is_active=True,
                )
                db.add(user)
                db.flush()
                db.refresh(user)

        if not user.is_active:
            redirect_url = f"{frontend_base}/login?error=account_disabled"
            return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

        # If the user selected doctor, verify their account is actually authorized as a doctor
        if role_hint == "doctor" and user.role != UserRole.doctor and user.role != UserRole.admin:
            logger.warning("Non-doctor user %s attempted to enter doctor portal", user.email)
            redirect_url = f"{frontend_base}/login?error=unauthorized_doctor"
            return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception as db_exc:
        logger.error("Database error during Google OAuth user resolution: %s", db_exc, exc_info=True)
        db.rollback()
        redirect_url = f"{frontend_base}/login?error=database_error"
        return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)

    # 6. Issue PS47 JWT
    token = create_access_token(user_id=user.id, role=user.role.value)

    # 7. Create single-use short-lived exchange ticket (prevents JWT in URL)
    ticket = create_exchange_ticket({
        "access_token": token,
        "token_type": "bearer",
        "role": user.role.value,
        "user_id": user.id,
    })

    redirect_url = f"{frontend_base}/auth/callback?ticket={urllib.parse.quote(ticket)}"
    return RedirectResponse(url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.post("/google/exchange", response_model=TokenResponse)
def exchange_ticket(payload: ExchangeTicketRequest):
    """
    Redeems a single-use authentication ticket issued by Google callback.
    Returns the PS47 JWT payload. Replay is prevented by immediate ticket deletion.
    """
    token_data = redeem_exchange_ticket(payload.ticket)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired authentication ticket.",
        )
    return TokenResponse(**token_data)