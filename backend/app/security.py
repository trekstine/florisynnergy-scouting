"""Auth primitives — PIN/password hashing and JWT issue/verify."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import JWTError, jwt

from .config import get_settings

settings = get_settings()


def hash_secret(secret: str) -> str:
    return bcrypt.hashpw(secret.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_secret(secret: str, secret_hash: str | None) -> bool:
    if not secret_hash:
        return False
    try:
        return bcrypt.checkpw(secret.encode("utf-8"), secret_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: str, role: str, employee_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    claims: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "eid": employee_id,
        "exp": expire,
    }
    return jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:  # pragma: no cover
        raise ValueError("Invalid or expired token") from exc
