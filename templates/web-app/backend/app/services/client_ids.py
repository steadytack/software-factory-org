"""Record ids chosen by the client, for offline creates.

A record made with no signal needs its id before it reaches the server, so
other offline work can point at it (a survey on a new site, photos on a new
survey). The app picks a UUID and sends it with the create. The outbox may
then send that create again (a timeout after the server had saved it, a
retry), so a create repeating an id that's already saved returns that
record rather than a duplicate or an error.
"""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Comment
from app.models.site import Site
from app.models.survey import Survey

_RECORD_MODELS: tuple[type, ...] = (Site, Survey, Comment)


class ClientIdConflictError(Exception):
    """The id is already used by a different kind of record — mapped to 409."""


async def existing_for_client_id(
    session: AsyncSession, model: type, client_id: uuid.UUID | None
) -> Any:
    """The `model` row already saved under `client_id` (a replayed create),
    or None when the id is free. Raises if another record type holds it, or
    if the record was saved and has since gone to the recycle bin (answering
    "created" with a record no list shows would lose the user's work quietly)."""
    if client_id is None:
        return None
    existing = await session.get(model, client_id)
    if existing is not None:
        if getattr(existing, "deleted_at", None) is not None:
            raise ClientIdConflictError(
                f"record {client_id} was already saved and has since been deleted"
            )
        return existing
    for other in _RECORD_MODELS:
        if other is not model and await session.get(other, client_id) is not None:
            raise ClientIdConflictError(f"id {client_id} is already used by another record")
    return None
