"""User management endpoints (admin-only).

Admins can create users, deactivate/activate them, change passwords, and
toggle admin rights. The bootstrap admin (from .env) is protected: its
password is env-synced at startup, so API changes to it would be overwritten
— the endpoint refuses to modify or deactivate it and directs you to .env.
Self-deactivation/self-demotion are also refused (an admin can't lock
themselves out of user management).
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_subject, require_admin
from app.core.config import get_settings
from app.core.database import SessionDep
from app.core.logging import get_logger
from app.core.security import hash_password
from app.core.text import clean_text
from app.models.user import User
from app.schemas.enums import UserRoleValue
from app.schemas.validators import optional_text
from app.services.changelog import diff, record_change


def _multi_user_only() -> None:
    """404 when the app runs in single-user mode — user management simply
    doesn't exist there (no route leakage, no 403 hinting at hidden features)."""
    if not get_settings().multi_user_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")


router = APIRouter(
    prefix="/users",
    tags=["users"],
    dependencies=[Depends(require_admin), Depends(_multi_user_only)],
)
logger = get_logger(__name__)


class UserCreate(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(min_length=10, max_length=200)
    display_name: optional_text(100) = None  # type: ignore[valid-type]
    role: UserRoleValue = "viewer"

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        # Lightweight validation without the email-validator dependency:
        # local@domain.tld shape, no spaces. Real deliverability isn't this
        # app's concern (no outbound mail).
        v = clean_text(v).strip().lower()
        if " " in v or "@" not in v or v.count("@") != 1:
            raise ValueError("must be a valid email address")
        local, domain = v.rsplit("@", 1)
        if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
            raise ValueError("must be a valid email address")
        return v


class UserUpdate(BaseModel):
    display_name: optional_text(100) = None  # type: ignore[valid-type]
    is_active: bool | None = None
    role: UserRoleValue | None = None


class PasswordSet(BaseModel):
    password: str = Field(min_length=10, max_length=200)


class UserRead(BaseModel):
    id: str
    email: str
    display_name: str | None
    role: str
    is_admin: bool
    is_active: bool
    is_bootstrap: bool
    last_login_at: datetime | None
    created_at: datetime


def _bootstrap_email() -> str:
    return get_settings().admin_email.strip().lower()


def _to_read(u: User) -> UserRead:
    return UserRead(
        id=str(u.id),
        email=u.email,
        display_name=u.display_name,
        role=u.role,
        is_admin=u.is_admin,
        is_active=u.is_active,
        is_bootstrap=u.email == _bootstrap_email(),
        last_login_at=u.last_login_at,
        created_at=u.created_at,
    )


async def _get_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@router.get("", response_model=list[UserRead])
async def list_users(session: AsyncSession = SessionDep) -> list[UserRead]:
    rows = (await session.execute(select(User).order_by(User.created_at))).scalars().all()
    return [_to_read(u) for u in rows]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    session: AsyncSession = SessionDep,
    actor: str = Depends(get_current_subject),
) -> UserRead:
    email = data.email.strip().lower()
    existing = (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with that email already exists")
    user = User(
        email=email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
        role=data.role,
        is_active=True,
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)
    logger.info("user_created", email=email, role=data.role)
    await record_change(
        session,
        entity="user",
        entity_id=str(user.id),
        action="created",
        actor=actor,
        summary=f"Created user {email} as {data.role}",
    )
    return _to_read(user)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    session: AsyncSession = SessionDep,
    actor: str = Depends(get_current_subject),
) -> UserRead:
    user = await _get_user(session, user_id)
    if user.email == _bootstrap_email() and data.is_active is False:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The bootstrap admin cannot be deactivated (managed via .env)",
        )
    if user.email == actor:
        # Self-demotion/self-deactivation would lock the only admin out.
        if data.role is not None and data.role != "admin" and user.is_admin:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "You cannot revoke your own admin role"
            )
        if data.is_active is False and user.is_active:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "You cannot deactivate your own account"
            )
    before = {"display_name": user.display_name, "role": user.role, "is_active": user.is_active}
    if data.display_name is not None:
        user.display_name = data.display_name
    if user.email == _bootstrap_email() and data.role not in (None, "admin"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The bootstrap admin must stay an admin")
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        if user.is_active and not data.is_active:
            # Reactivating later must not revive tokens issued before.
            user.token_version += 1
        user.is_active = data.is_active
    await session.flush()
    await session.refresh(user)
    logger.info("user_updated", email=user.email, by=actor)
    after = {"display_name": user.display_name, "role": user.role, "is_active": user.is_active}
    changed = diff(before, after)
    if changed:
        await record_change(
            session,
            entity="user",
            entity_id=str(user.id),
            action="updated",
            actor=actor,
            summary=f"Updated {', '.join(sorted(changed))} for {user.email}",
            changes=changed,
        )
    return _to_read(user)


@router.post("/{user_id}/password", response_model=UserRead)
async def set_password(
    user_id: uuid.UUID,
    data: PasswordSet,
    session: AsyncSession = SessionDep,
    actor: str = Depends(get_current_subject),
) -> UserRead:
    user = await _get_user(session, user_id)
    if user.email == _bootstrap_email():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "The bootstrap admin's password is managed via ADMIN_PASSWORD in .env",
        )
    user.password_hash = hash_password(data.password)
    user.token_version += 1  # signs the user out everywhere
    await session.flush()
    await session.refresh(user)
    logger.info("user_password_set", email=user.email, by=actor)
    await record_change(
        session,
        entity="user",
        entity_id=str(user.id),
        action="updated",
        actor=actor,
        summary=f"Reset the password for {user.email}",
    )
    return _to_read(user)
