"""
backend/schemas/auth.py

Pydantic request/response models for the auth endpoints.
Kept minimal: only fields needed for login + token issuance.
"""

from pydantic import BaseModel, EmailStr, Field
from backend.models.user import UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


class RegisterRequest(BaseModel):
    """Used internally for seeding/demo — not exposed as a public endpoint in production."""
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str
    role: UserRole
    hospital_affiliation: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str
    hospital_affiliation: str | None
    is_active: bool

    model_config = {"from_attributes": True}
