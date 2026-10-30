"""Generic service base for simple CRUD entities.

The four domain services repeated the same create/get/list/update/delete
skeleton, including the changelog `record_change` calls and the
`changes = data.model_dump(...)` + `fields = ", ".join(...)` summary pattern.
Subclasses declare the entity name, schema types and the per-entity changelog
summaries; everything else is inherited.
"""

# Lazy annotations: these classes define a `list` method, which shadows the
# builtin in later annotations on Python 3.12 (`list[str]` would raise).
from __future__ import annotations

import uuid
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from app.core.logging import get_logger
from app.services.changelog import diff, record_change
from app.services.client_ids import existing_for_client_id

logger = get_logger(__name__)

R = TypeVar("R", bound=BaseModel)  # Read schema
L = TypeVar("L", bound=BaseModel)  # List schema


class ParentNotFoundError(Exception):
    """Referenced parent record does not exist — endpoints map this to 404."""


class RuleViolationError(Exception):
    """A business rule refuses this write (a due date before its survey, an
    owner edited on an action assigned to a user) — mapped to 422 with the
    message, so the person sees what to change."""


class CrudService(Generic[R, L]):  # noqa: UP046 — Generic subclass kept for py3.12 typing clarity
    """Base service: business logic for one CRUD entity, no HTTP concerns."""

    entity: str  # changelog entity name
    list_schema: type[L]

    # Override in subclasses for human-readable changelog summaries.
    def _create_summary(self, obj: Any) -> str:
        return f"Created {self.entity}"

    def _update_summary(self, obj: Any, fields: str) -> str:
        return f"Updated {fields} on {self.entity}"

    def _delete_summary(self, obj: Any) -> str:
        return f"Deleted {self.entity}"

    def __init__(self, repository: Any, actor: str = "system") -> None:
        self._repo = repository
        self._actor = actor

    def _to_read(self, obj: Any) -> R:
        raise NotImplementedError

    def _create_fields(self, data: Any) -> dict:
        raise NotImplementedError

    async def _read_many(self, objs: list[Any]) -> list[R]:
        """Read schemas for a batch of rows. Override to attach context that
        needs extra queries (parent names, child counts) in one round trip."""
        return [self._to_read(o) for o in objs]

    async def _read_one(self, obj: Any) -> R:
        return (await self._read_many([obj]))[0]

    async def create(self, data: Any, *, is_demo: bool = False) -> R:
        """Create one record.

        `is_demo` marks rows written by the demo seeder,
        which now goes through this same path rather than constructing ORM
        objects directly — so seeded rows are validated, get
        changelog entries, and are identifiable as demo data.
        """
        # A replayed offline create (same client id) returns what was saved.
        client_id = getattr(data, "id", None)
        existing = await existing_for_client_id(self._repo._session, self._repo.model, client_id)
        if existing is not None:
            return await self._read_one(existing)
        fields = self._create_fields(data)
        if client_id is not None:
            fields["id"] = client_id
        obj = await self._repo.create(**fields, is_demo=is_demo)
        await record_change(
            self._repo._session,
            entity=self.entity,
            entity_id=str(obj.id),
            action="created",
            actor=self._actor,
            summary=self._create_summary(obj),
        )
        logger.info("entity_created", entity=self.entity, entity_id=str(obj.id))
        return await self._read_one(obj)

    async def get(self, obj_id: uuid.UUID) -> R | None:
        obj = await self._repo.get(obj_id)
        return await self._read_one(obj) if obj else None

    async def list(self, offset: int = 0, limit: int = 50, **filters: Any) -> L:
        items, total = await self._repo.list(offset=offset, limit=limit, **filters)
        return self.list_schema(total=total, items=await self._read_many(items))

    async def update(self, obj_id: uuid.UUID, data: Any) -> R | None:
        obj = await self._repo.get(obj_id)
        if obj is None:
            return None
        # exclude_unset only: an explicitly-sent null clears the field.
        # (exclude_none previously made it impossible to null address/notes/
        # due_date/summary back — audit F4.)
        changes = data.model_dump(exclude_unset=True)
        before = {field: getattr(obj, field, None) for field in changes}
        updated = await self._repo.update(obj, changes)
        fields = ", ".join(sorted(changes.keys()))
        await record_change(
            self._repo._session,
            entity=self.entity,
            entity_id=str(obj_id),
            action="updated",
            actor=self._actor,
            summary=self._update_summary(updated, fields),
            changes=diff(before, changes),
        )
        logger.info("entity_updated", entity=self.entity, entity_id=str(obj_id))
        return await self._read_one(updated)

    async def _attachment_paths(self, obj: Any) -> list[str]:
        """Stored files under this record (override per entity); removed
        from disk after the delete commits."""
        return []

    async def delete(self, obj_id: uuid.UUID) -> bool:
        """Soft-deletable entities go to the recycle bin (with their live
        descendants); anything else is deleted outright."""
        obj = await self._repo.get(obj_id)
        if obj is None:
            return False
        if self._repo.soft_deletes():
            from app.services.recycle_bin import soft_delete

            took = await soft_delete(self._repo._session, self.entity, obj, self._actor)
            summary = self._delete_summary(obj) + " (moved to the recycle bin"
            summary += f" with {took} related record(s))" if took else ")"
        else:
            from app.core.storage import delete_after_commit

            delete_after_commit(self._repo._session, await self._attachment_paths(obj))
            await self._repo.delete(obj)
            summary = self._delete_summary(obj)
        await record_change(
            self._repo._session,
            entity=self.entity,
            entity_id=str(obj_id),
            action="deleted",
            actor=self._actor,
            summary=summary,
        )
        logger.info("entity_deleted", entity=self.entity, entity_id=str(obj_id))
        return True
