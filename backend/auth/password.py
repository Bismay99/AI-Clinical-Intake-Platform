"""
backend/auth/password.py

Password hashing and verification.

Uses sha256_crypt (via passlib) — compatible with Python 3.14 and passlib 1.7.4
without requiring bcrypt's binary extension. For production, switch to argon2
or bcrypt once a compatible version of passlib is available.

Note: passlib 1.7.4 has a known incompatibility with bcrypt >= 4.x
(bcrypt.__about__ attribute removed). sha256_crypt is a safe fallback
for the MVP/hackathon demo.
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
