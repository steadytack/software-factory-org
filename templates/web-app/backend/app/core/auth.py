"""Multi-user authentication.

Accounts live in the `users` table (bcrypt hashes). The env-configured
ADMIN_EMAIL and the secret admin_password are the bootstrap admin: ensure_bootstrap_admin()
seeds it at startup when the table is empty (or resets its password when the
env value changes), so a fresh deployment can always sign in.

Authorisation is by role (viewer < editor < admin): require_role(min)
builds the dependency; require_editor / require_admin are the two in use.
Any active authenticated user passes get_current_subject. Inactive users are rejected
at token validation time, so deactivation kills sessions on their next
request without waiting for token expiry.
"""

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import SessionDep
from app.core.logging import get_logger
from app.core.security import decode_token, hash_password, verify_password
from app.models.user import User
from app.schemas.enums import USER_ROLES

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"

logger = get_logger(__name__)

# A fixed dummy hash so unknown emails still cost a bcrypt compare — prevents
# timing-based email enumeration.
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing", bcrypt.gensalt()).decode()

SINGLE_USER_ONLY = "Sign-in is limited to the administrator in single-user mode"


async def ensure_bootstrap_admin(session: AsyncSession) -> None:
    """Seed or sync the env bootstrap admin. Runs at startup (after
    migrations). Idempotent:
    - table empty → create the admin from env;
    - admin exists but env password changed → update the hash (env is the
      recovery path if the admin forgets their password);
    - admin exists with matching password → no-op.
    Non-admin users are never touched here."""
    settings = get_settings()
    email = settings.admin_email.strip().lower()
    existing = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing is None:
        session.add(
            User(
                email=email,
                password_hash=hash_password(settings.admin_password),
                role="admin",
                is_active=True,
            )
        )
        logger.info("bootstrap_admin_created", email=email)
    elif not verify_password(settings.admin_password, existing.password_hash):
        existing.password_hash = hash_password(settings.admin_password)
        existing.is_active = True  # recovery path re-activates the account
        existing.token_version += 1  # and ends sessions minted with the old password
        logger.info("bootstrap_admin_password_synced", email=email)
        from app.services.changelog import record_change

        await record_change(
            session,
            entity="user",
            entity_id=str(existing.id),
            action="updated",
            actor="system",
            summary=(
                "Bootstrap admin password reset from its secret (admin_password)"
                " and account re-activated"
            ),
        )
    await session.commit()


async def check_password(session: AsyncSession, email: str, password: str) -> User | None:
    """Verify credentials against the users table. Always runs a bcrypt
    compare (dummy hash on unknown email) so response timing doesn't reveal
    whether the email exists. Returns the user on success."""
    normalized = email.strip().lower()
    user = (
        await session.execute(select(User).where(User.email == normalized))
    ).scalar_one_or_none()
    if user is None:
        verify_password(password, _DUMMY_HASH)
        return None
    if not verify_password(password, user.password_hash):
        return None
    if not user.is_active:
        return None
    return user


async def get_current_subject(
    request: Request,
    session: AsyncSession = SessionDep,
) -> str:
    """Auth dependency: validates the access-token cookie AND the account
    (must exist and be active). The check lives here, server-side — never
    trust the UI for authorisation."""
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = decode_token(token, expected_type="access")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc
    user = await user_for_token(session, payload)
    return user.email


async def user_for_token(session: AsyncSession, payload: dict) -> User:
    """The active user a decoded token belongs to, or 401. A token minted
    before the user's last token_version bump (password change, deactivation,
    stolen-refresh detection) is rejected here."""
    subject = str(payload.get("sub", "")).strip().lower()
    user = (await session.execute(select(User).where(User.email == subject))).scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account disabled or unknown")
    if int(payload.get("ver", 0)) != user.token_version:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session ended; sign in again")
    if not single_user_allows(user):
        # A session minted while multi-user mode was on ends here too.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, SINGLE_USER_ONLY)
    return user


def single_user_allows(user: User) -> bool:
    """Single-user mode (MULTI_USER_ENABLED=false) admits only the bootstrap
    admin. Other accounts left over from multi-user use stay in the table
    but can't sign in — otherwise, since every caller is an admin there,
    switching modes would promote every viewer to admin."""
    settings = get_settings()
    return settings.multi_user_enabled or user.email == settings.admin_email.strip().lower()


ROLE_RANK = {role: rank for rank, role in enumerate(USER_ROLES)}


def effective_role(user: User | None) -> str:
    """Single-user mode (MULTI_USER_ENABLED=false) admits only the bootstrap
    admin (see single_user_allows), so every authenticated caller is an
    admin there."""
    if not get_settings().multi_user_enabled:
        return "admin"
    return user.role if user is not None else "viewer"


def has_role(user: User | None, minimum: str) -> bool:
    return ROLE_RANK[effective_role(user)] >= ROLE_RANK[minimum]


def require_role(minimum: str):
    """Dependency factory: 403 unless the caller's role is at least
    `minimum`. Returns the caller's email, like get_current_subject."""
    message = {
        "editor": "Editor or admin role required",
        "admin": "Admin privileges required",
    }.get(minimum, "Not permitted")

    async def dependency(
        subject: str = Depends(get_current_subject),
        session: AsyncSession = SessionDep,
    ) -> str:
        user = (
            await session.execute(select(User).where(User.email == subject))
        ).scalar_one_or_none()
        if not has_role(user, minimum):
            raise HTTPException(status.HTTP_403_FORBIDDEN, message)
        return subject

    dependency.__name__ = f"require_{minimum}"
    return dependency


require_admin = require_role("admin")
require_editor = require_role("editor")


async def require_admin_optional(request: Request) -> str:
    """Best-effort identity for audit attribution: returns the authenticated
    subject, or "anonymous" when no/invalid token is present. Never raises —
    authorisation is still enforced by require_admin on the write endpoints."""
    token = request.cookies.get(ACCESS_COOKIE)
    if not token:
        return "anonymous"
    try:
        payload = decode_token(token, expected_type="access")
        sub = str(payload.get("sub", "")).strip().lower()
    except jwt.InvalidTokenError:
        return "anonymous"
    return sub or "anonymous"
