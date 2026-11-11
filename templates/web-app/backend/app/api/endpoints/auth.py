from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    SINGLE_USER_ONLY,
    check_password,
    effective_role,
    get_current_subject,
    single_user_allows,
    user_for_token,
)
from app.core.config import get_settings
from app.core.database import SessionDep
from app.core.logging import get_logger
from app.core.rate_limit import (
    TOO_MANY,
    account_locked,
    check_rate_limit,
    record_failure,
    record_success,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.revoked_token import RevokedToken
from app.models.user import User
from app.services.changelog import record_change

logger = get_logger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthStatus(BaseModel):
    """Outcome of login/refresh/logout — no tokens in the body (HttpOnly cookies)."""

    status: str


class MeResponse(BaseModel):
    """Current user, as consumed by the SPA's useAuth hook."""

    email: str
    display_name: str | None
    role: str
    is_admin: bool
    multi_user: bool


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(min_length=10, max_length=200)


def _set_auth_cookies(response: Response, user: User) -> None:
    settings = get_settings()
    secure = settings.cookie_secure
    subject = user.email
    response.set_cookie(
        ACCESS_COOKIE,
        create_access_token(subject, user.token_version),
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        REFRESH_COOKIE,
        create_refresh_token(subject, user.token_version),
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 24 * 3600,
    )


@router.post("/login", response_model=AuthStatus)
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = SessionDep,
) -> AuthStatus:
    await check_rate_limit(session, request, data.email)
    locked = await account_locked(session, data.email)
    user = await check_password(session, data.email, data.password)
    if user is None:
        await record_failure(session, request, data.email)
        if locked:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY)
        # Generic message — don't reveal which part was wrong.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not single_user_allows(user):
        # The password was right, so saying why reveals nothing new.
        raise HTTPException(status.HTTP_403_FORBIDDEN, SINGLE_USER_ONLY)
    # A correct password from an address with no failures against this
    # account gets in even while the account is under attack: that is the
    # real user, and locking them out was the attacker's goal.
    await record_success(session, request, data.email)
    # `last_login_at` is OVERWRITTEN on every login, so there is no
    # login history at all — only "the most recent one". Q-D6 rules out a new
    # table, so the event is emitted to the structured log, where
    # `login_failures` rows already have their counterpart. This gives a
    # successful sign-in the same visibility a failed one has.
    previous_login = user.last_login_at
    user.last_login_at = datetime.now(UTC)
    logger.info(
        "login_succeeded",
        email=user.email,
        previous_login_at=previous_login.isoformat() if previous_login else None,
    )
    # No explicit commit: get_session's transactional context commits on the
    # success path (and rolls back when the 401 above raises).
    await session.flush()
    _set_auth_cookies(response, user)
    return AuthStatus(status="authenticated")


# Two tabs whose access tokens expire together both refresh with the same
# cookie; the loser of that race is not an attacker.
REUSE_GRACE = timedelta(seconds=30)


async def _revoke(session: AsyncSession, payload: dict, *, grace: bool = True) -> str:
    """Spend a refresh token. Returns "spent" the first time, "concurrent"
    for a repeat within REUSE_GRACE, and "reused" for a later repeat: a
    copied token being replayed. `grace=False` (logout) spends it with no
    grace period, so any later use counts as a replay."""
    jti = str(payload.get("jti", ""))
    if not jti:
        return "spent"
    existing = await session.get(RevokedToken, jti)
    if existing is not None:
        recent = existing.revoked_at > datetime.now(UTC) - REUSE_GRACE
        return "concurrent" if recent else "reused"
    # Opportunistic prune: spent tokens only matter until they'd expire.
    await session.execute(delete(RevokedToken).where(RevokedToken.expires_at < datetime.now(UTC)))
    token = RevokedToken(jti=jti, expires_at=datetime.fromtimestamp(payload["exp"], UTC))
    if not grace:
        token.revoked_at = datetime.now(UTC) - REUSE_GRACE
    session.add(token)
    await session.flush()
    return "spent"


@router.post("/refresh", response_model=AuthStatus)
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = SessionDep,
) -> AuthStatus:
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token")
    try:
        payload = decode_token(token, expected_type="refresh")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from exc
    # Re-validates the account (active, current token_version) before
    # re-issuing cookies, same as get_current_subject for access tokens.
    user = await user_for_token(session, payload)
    # Rotation: each refresh token works once. A second use means a copy is
    # in someone else's hands, so end every session for the account.
    outcome = await _revoke(session, payload)
    if outcome == "reused":
        user.token_version += 1
        await session.commit()
        logger.warning("refresh_token_reused", email=user.email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session ended; sign in again")
    # "concurrent": the other tab's refresh already set fresh cookies, which
    # this browser shares; issuing more would only fork the chain.
    if outcome == "spent":
        _set_auth_cookies(response, user)
    return AuthStatus(status="refreshed")


@router.post("/logout", response_model=AuthStatus)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = SessionDep,
) -> AuthStatus:
    # Spend this device's refresh token so a copied cookie can't outlive the
    # logout. (The short-lived access token simply expires.)
    token = request.cookies.get(REFRESH_COOKIE)
    if token:
        try:
            await _revoke(session, decode_token(token, expected_type="refresh"), grace=False)
        except jwt.InvalidTokenError:
            pass
    response.delete_cookie(ACCESS_COOKIE)
    response.delete_cookie(REFRESH_COOKIE)
    return AuthStatus(status="logged_out")


@router.post("/password", response_model=AuthStatus)
async def change_password(
    data: PasswordChange,
    request: Request,
    response: Response,
    subject: str = Depends(get_current_subject),
    session: AsyncSession = SessionDep,
) -> AuthStatus:
    """Change your own password. Ends every other session (token_version
    bump) and re-issues cookies for this one."""
    if subject == get_settings().admin_email.strip().lower():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The bootstrap admin's password is managed in the secret file admin_password",
        )
    await check_rate_limit(session, request, subject)
    user = (await session.execute(select(User).where(User.email == subject))).scalar_one()
    if not verify_password(data.current_password, user.password_hash):
        await record_failure(session, request, subject)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if data.new_password == data.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose a different password")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1
    await session.flush()
    logger.info("password_changed", email=user.email)
    await record_change(
        session,
        entity="user",
        entity_id=str(user.id),
        action="updated",
        actor=user.email,
        summary="Changed their own password",
    )
    _set_auth_cookies(response, user)
    return AuthStatus(status="password_changed")


@router.get("/me", response_model=MeResponse)
async def me(
    subject: str = Depends(get_current_subject),
    session: AsyncSession = SessionDep,
) -> MeResponse:
    user = (await session.execute(select(User).where(User.email == subject))).scalar_one_or_none()
    return MeResponse(
        email=subject,
        display_name=user.display_name if user else None,
        role=effective_role(user),
        is_admin=effective_role(user) == "admin",
        multi_user=get_settings().multi_user_enabled,
    )
