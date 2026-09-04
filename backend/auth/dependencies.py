"""
backend/auth/dependencies.py

FastAPI dependency functions for authentication and role-based access control.

Usage in route handlers:
    @router.get("/protected")
    def protected(current_user: User = Depends(get_current_user)):
        ...

    @router.get("/doctor-only")
    def doctor_only(current_user: User = Depends(require_role("doctor"))):
        ...
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.auth.jwt_handler import decode_access_token
from backend.models.user import User, UserRole

# HTTPBearer extracts the token from the Authorization: Bearer <token> header
bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Validates the JWT and loads the user from the database.
    Raises HTTP 401 for any auth failure.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(credentials.credentials)
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if user is None:
        raise credentials_exception
    return user


def require_role(*allowed_roles: str):
    """
    Returns a FastAPI dependency that enforces role-based access.

    Example:
        Depends(require_role("doctor", "admin"))
    """
    def _check_role(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {list(allowed_roles)}",
            )
        return current_user
    return _check_role


# Convenience shortcuts
require_patient = require_role("patient")
require_doctor = require_role("doctor", "admin")
require_admin = require_role("admin")
