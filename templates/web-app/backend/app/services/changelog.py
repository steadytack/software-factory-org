"""Service-level helper for writing audit-trail entries.

Domain services call `record_change` so every create/update/delete is
recorded in the generic changelog. The entry is added to the caller's
session and flushed with the rest of the unit of work, so a rolled-back
domain change never leaves a stray changelog row.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.changelog import ChangelogEntry

logger = get_logger(__name__)


async def record_change(
    session: AsyncSession,
    *,
    entity: str,
    entity_id: str,
    action: str,
    actor: str,
    summary: str,
    changes: dict[str, list[Any]] | None = None,
) -> None:
    """Append one changelog entry within the caller's transaction."""
    session.add(
        ChangelogEntry(
            entity=entity,
            entity_id=entity_id,
            action=action,
            actor=actor,
            summary=summary[:500],
            changes=changes or None,
        )
    )
    await session.flush()
    logger.info("changelog_recorded", entity=entity, action=action, actor=actor)


def _jsonable(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    return value


def diff(before: dict[str, Any], after: dict[str, Any]) -> dict[str, list[Any]]:
    """{field: [old, new]} for the fields whose value actually changed —
    a PATCH that re-sends the same value is not a change worth recording."""
    return {
        field: [_jsonable(before.get(field)), _jsonable(value)]
        for field, value in after.items()
        if _jsonable(before.get(field)) != _jsonable(value)
    }
