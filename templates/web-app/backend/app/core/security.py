import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings


def hash_password(plain: str) -> str:
    rounds = get_settings().bcrypt_rounds
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=rounds)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(
    subject: str, token_type: str, lifetime: timedelta, extra: dict | None = None
) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
        "jti": str(uuid.uuid4()),
        **(extra or {}),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str, version: int = 0) -> str:
    settings = get_settings()
    return create_token(
        subject,
        "access",
        timedelta(minutes=settings.access_token_expire_minutes),
        {"ver": version},
    )


def create_refresh_token(subject: str, version: int = 0) -> str:
    settings = get_settings()
    return create_token(
        subject,
        "refresh",
        timedelta(days=settings.refresh_token_expire_days),
        {"ver": version},
    )


def decode_token(token: str, expected_type: str) -> dict:
    """Decode and validate a JWT; raises jwt.InvalidTokenError on any problem."""
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError(f"expected {expected_type} token")
    return payload
