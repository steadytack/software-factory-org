"""Generic repository base for simple CRUD entities.

The domain repositories (site, survey, …) repeated the same
create/get/list/update/delete skeleton verbatim — only the model, the filter
columns and the order-by differed. Subclasses declare those three things and
inherit everything else. Site stays separate (geometry + dependent-row
cleanup); repositories with extra filters override `list`.
"""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import Base


def contains(column: Any, text: str) -> Any:
    """Case-insensitive substring match with LIKE wildcards in `text`
    escaped, so a search for "50%" means the characters, not a pattern."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return column.ilike(f"%{escaped}%", escape="\\")


class Repository:
    """Base repository: session management + generic CRUD for one model."""

    model: type[Base]
    # Columns usable as list filters, mapped to their query-param names.
    # Subclasses with extra/complex filters override `list` instead.
    filter_columns: dict[str, Any] = {}
    order_by: Any = None  # defaults to created_at.desc()

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    @classmethod
    def stable_order(cls, *columns: Any) -> tuple[Any, ...]:
        """The given sort columns plus `id DESC` as a final tiebreaker.

        Offset pagination over a non-unique ORDER BY is **not deterministic**:
        Postgres freezes `now()` per transaction, so rows written in one
        transaction (the seeder, a bulk write, a test) share an identical
        `created_at`, and consecutive pages are served by separate queries
        that may order the tied rows differently. The result is rows returned
        twice and other rows never returned at all, while `total` stays
        correct so nothing looks wrong (, reproduced on sites
        and surveys).

        PKs are UUIDv7 — time-ordered and unique — so `id DESC` both breaks
        every tie and preserves "most recent first". This is the fix
        `api/endpoints/changelog.py` already carried; it now lives in one
        place and every list query uses it.
        """
        base = columns or (cls.model.created_at.desc(),)
        return (*base, cls.model.id.desc())

    async def create(self, **fields: Any) -> Base:
        obj = self.model(**fields)
        self._session.add(obj)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    @classmethod
    def soft_deletes(cls) -> bool:
        return hasattr(cls.model, "deleted_at")

    async def get(self, obj_id: uuid.UUID) -> Base | None:
        """A live row: one in the recycle bin reads as missing."""
        obj = await self._session.get(self.model, obj_id)
        if obj is not None and self.soft_deletes() and obj.deleted_at is not None:
            return None
        return obj

    async def get_any(self, obj_id: uuid.UUID) -> Base | None:
        """Live or in the recycle bin (restore/purge)."""
        return await self._session.get(self.model, obj_id)

    async def list(
        self,
        offset: int = 0,
        limit: int = 50,
        **filters: Any,
    ) -> tuple[list[Base], int]:
        stmt = select(self.model)
        count_stmt = select(func.count()).select_from(self.model)
        if self.soft_deletes():
            stmt = stmt.where(self.model.live())
            count_stmt = count_stmt.where(self.model.live())
        for param, value in filters.items():
            if value is None:
                continue
            column = self.filter_columns[param]
            stmt = stmt.where(column == value)
            count_stmt = count_stmt.where(column == value)
        order = (
            self.stable_order(self.order_by) if self.order_by is not None else self.stable_order()
        )
        total = await self._session.scalar(count_stmt) or 0
        result = await self._session.execute(stmt.order_by(*order).offset(offset).limit(limit))
        return list(result.scalars().all()), int(total)

    async def update(self, obj: Base, changes: dict) -> Base:
        for field, value in changes.items():
            setattr(obj, field, value)
        await self._session.flush()
        await self._session.refresh(obj)
        return obj

    async def delete(self, obj: Base) -> None:
        await self._session.delete(obj)
        await self._session.flush()
