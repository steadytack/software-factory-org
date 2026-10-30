"""Recycle bin for surveys.

Deleting a survey used to remove it for good, and with it (by database
cascade) its comments and photos. Now a delete marks the record and its live
descendants with one `delete_batch`; they disappear from every list and count
but can be restored by an admin. They are removed for real when purged — by an
admin, or automatically after TRASH_RETENTION_DAYS (`python -m app.purge_trash`,
run by the scheduler).

Sites are not in the bin: they have Archive for "put away", and deleting a
site stays an admin-only permanent action.

To bin another entity: give its model `SoftDeleteMixin`, add it to `MODELS` and
`LEVEL` (parents lower), and teach `_live_descendants`, `_label` and `restore`
about its parent.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import delete_after_commit
from app.models.site import Site
from app.models.survey import Survey
from app.repositories.attachment_paths import paths_under
from app.services.changelog import record_change

MODELS = {"survey": Survey}
# Parent-first, so a batch's root is its highest-level member.
LEVEL = {"survey": 0}


class RestoreBlocked(Exception):
    """The record's parent is itself in the bin (or gone)."""


async def _live_descendants(session: AsyncSession, entity: str, obj) -> list:
    """Live child records that go to the bin with `obj`. Surveys have none."""
    return []


async def soft_delete(session: AsyncSession, entity: str, obj, actor: str) -> int:
    """Move `obj` and its live descendants to the bin. Returns how many
    descendants went with it."""
    batch = uuid.uuid4()
    now = datetime.now(UTC)
    descendants = await _live_descendants(session, entity, obj)
    for row in (obj, *descendants):
        row.deleted_at = now
        row.deleted_by = actor
        row.delete_batch = batch
    await session.flush()
    return len(descendants)


@dataclass
class BinItem:
    entity: str
    id: str
    label: str
    site_id: str | None
    site_name: str | None
    deleted_at: datetime
    deleted_by: str | None
    # Records that went to the bin with it.
    with_count: int


async def _label(session: AsyncSession, entity: str, obj) -> tuple[str, str | None, str | None]:
    """(label, site_id, site_name) for a bin row."""
    label = f"Survey {obj.survey_date.isoformat()} by {obj.surveyor}"
    site = await session.get(Site, obj.site_id)
    return label[:200], (str(site.id) if site else None), (site.name if site else None)


async def list_bin(session: AsyncSession) -> list[BinItem]:
    """One entry per delete: the record the user deleted, with a count of
    what went with it — not every row of the batch."""
    batches: dict[uuid.UUID, list[tuple[str, object]]] = {}
    for entity, model in MODELS.items():
        rows = (await session.scalars(select(model).where(model.deleted_at.is_not(None)))).all()
        for row in rows:
            batches.setdefault(row.delete_batch or row.id, []).append((entity, row))
    items: list[BinItem] = []
    for members in batches.values():
        members.sort(key=lambda m: LEVEL[m[0]])
        entity, root = members[0]
        label, site_id, site_name = await _label(session, entity, root)
        items.append(
            BinItem(
                entity=entity,
                id=str(root.id),
                label=label,
                site_id=site_id,
                site_name=site_name,
                deleted_at=root.deleted_at,
                deleted_by=root.deleted_by,
                with_count=len(members) - 1,
            )
        )
    items.sort(key=lambda i: i.deleted_at, reverse=True)
    return items


async def _deleted(session: AsyncSession, entity: str, record_id: uuid.UUID):
    model = MODELS.get(entity)
    obj = await session.get(model, record_id) if model else None
    if obj is None or obj.deleted_at is None:
        return None
    return obj


async def restore(session: AsyncSession, entity: str, record_id: uuid.UUID, actor: str) -> bool:
    obj = await _deleted(session, entity, record_id)
    if obj is None:
        return False
    batch = obj.delete_batch
    restored = 0
    for model in MODELS.values():
        condition = model.delete_batch == batch if batch else model.id == obj.id
        for row in (await session.scalars(select(model).where(condition))).all():
            row.deleted_at = row.deleted_by = row.delete_batch = None
            restored += 1
    await record_change(
        session,
        entity=entity,
        entity_id=str(record_id),
        action="updated",
        actor=actor,
        summary="Restored from the recycle bin"
        + (f" with {restored - 1} related record(s)" if restored > 1 else ""),
    )
    await session.flush()
    return True


async def purge(session: AsyncSession, entity: str, record_id: uuid.UUID, actor: str) -> bool:
    """Delete for good. The database cascades children, comments and
    attachment rows; the files go once the delete commits."""
    obj = await _deleted(session, entity, record_id)
    if obj is None:
        return False
    delete_after_commit(session, await paths_under(session, entity, obj.id))
    await session.delete(obj)
    await record_change(
        session,
        entity=entity,
        entity_id=str(record_id),
        action="deleted",
        actor=actor,
        summary="Permanently deleted from the recycle bin",
    )
    await session.flush()
    return True


async def purge_older_than(session: AsyncSession, days: int, actor: str = "trash-purge") -> int:
    cutoff = datetime.now(UTC) - timedelta(days=days)
    purged = 0
    for item in await list_bin(session):
        if item.deleted_at < cutoff and await purge(
            session, item.entity, uuid.UUID(item.id), actor
        ):
            purged += 1
    return purged
