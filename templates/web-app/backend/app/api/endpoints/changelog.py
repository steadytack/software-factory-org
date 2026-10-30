"""Changelog / audit trail: records who changed what, when.

Template pattern: a generic per-record audit log. Replace `entity`/`entity_id`
with your real domain's foreign keys when adapting.

Audit-trail integrity (audit F10 / AUDIT-1): there is deliberately NO delete
endpoint and NO manual-create endpoint — an admin-writable audit log isn't an
audit log. Entries are written only by the services, with the real actor.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_subject, has_role
from app.core.database import SessionDep
from app.models.changelog import ChangelogEntry
from app.models.user import User
from app.schemas.enums import ENTITIES

# Reads require authentication. There is deliberately no delete
# endpoint, and no manual-create endpoint either: an admin-writable audit log
# is not an audit log. Entries are written by the services.
# Record entities plus "user" (account events, admin-only).
ChangelogEntityValue = Literal["site", "survey", "user"]
assert set(ENTITIES) | {"user"} == set(ChangelogEntityValue.__args__)

router = APIRouter(
    prefix="/changelog",
    tags=["changelog"],
    dependencies=[Depends(get_current_subject)],
)


class ChangelogRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    entity: str
    entity_id: str
    action: str
    actor: str
    summary: str
    # {field: [old, new]} on updates recorded since migration 0022.
    changes: dict[str, list[Any]] | None = None
    created_at: datetime


class ChangelogList(BaseModel):
    total: int
    items: list[ChangelogRead]


def _to_read(entry: ChangelogEntry) -> ChangelogRead:
    return ChangelogRead(
        id=entry.id,
        entity=entry.entity,
        entity_id=entry.entity_id,
        action=entry.action,
        actor=entry.actor,
        summary=entry.summary,
        changes=entry.changes,
        created_at=entry.created_at,
    )


@router.get("", response_model=ChangelogList)
async def list_changelog(
    # `entity` is validated against the vocabulary rather than accepted
    # and matched against nothing, and both params are bounded to the column
    # width — the comments/attachments equivalents were already capped at
    # 100/64 while these accepted 300 characters.
    entity: ChangelogEntityValue | None = Query(default=None),
    entity_id: uuid.UUID | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = SessionDep,
    subject: str = Depends(get_current_subject),
) -> ChangelogList:
    stmt = select(ChangelogEntry)
    count_stmt = select(func.count()).select_from(ChangelogEntry)
    # Account history (emails, role changes, password resets) is for admins
    # only; everyone else sees the record history.
    user = (await session.execute(select(User).where(User.email == subject))).scalar_one_or_none()
    if not has_role(user, "admin"):
        if entity == "user":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")
        stmt = stmt.where(ChangelogEntry.entity != "user")
        count_stmt = count_stmt.where(ChangelogEntry.entity != "user")
    # `if entity:` is a FALSY test, so `?entity=` (empty string) fell
    # through and returned the *unfiltered* set — 51 rows where the caller
    # asked for a filtered one. `is not None` distinguishes "absent" from
    # "supplied but empty"; an empty value now fails validation outright
    # (EntityValue has no "" member), so it can never silently widen a query.
    if entity is not None:
        stmt = stmt.where(ChangelogEntry.entity == entity)
        count_stmt = count_stmt.where(ChangelogEntry.entity == entity)
    if entity_id is not None:
        # entity_id is stored as text (deliberately: changelog has no FK and
        # must survive its subject's deletion — TYP-3/INT-1), so the parsed
        # UUID is compared as its canonical string form.
        key = str(entity_id)
        stmt = stmt.where(ChangelogEntry.entity_id == key)
        count_stmt = count_stmt.where(ChangelogEntry.entity_id == key)
    total = await session.scalar(count_stmt) or 0
    # Secondary sort by id: Postgres freezes now() for the whole transaction,
    # so several changelog rows written within one request-cycle transaction
    # (or, in tests, one outer transaction with savepoints per request) can
    # share an identical created_at, making order-by-created_at-alone
    # nondeterministic. PKs are UUIDv7 (time-ordered/monotonic), so id DESC
    # is a stable tiebreaker that preserves "most recent first".
    result = await session.execute(
        stmt.order_by(ChangelogEntry.created_at.desc(), ChangelogEntry.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return ChangelogList(total=int(total), items=[_to_read(e) for e in result.scalars().all()])
