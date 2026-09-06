"""
backend/config.py

Central settings loaded from environment variables (or a .env file).
All runtime configuration lives here — nothing else should read os.environ directly.
"""

import os
from typing import Optional
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://ps47user:ps47pass@localhost:5432/ps47db"

    # JWT
    jwt_secret_key: str = "dev-only-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60

    # App
    app_env: str = "development"
    app_version: str = "0.1.0-phase1"

    # Document storage
    upload_dir: str = "uploads"

    # Google OAuth 2.0 / OpenID Connect
    google_client_id: Optional[str] = None
    google_client_secret: Optional[str] = None
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    frontend_url: str = "http://localhost:3000"

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://[::1]:3001",
    ]
    cors_origin_regex: Optional[str] = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Singleton — import this everywhere instead of re-instantiating
settings = Settings()
