"""Notification service.

Business rules: notifications are system-generated (see services/notification.py)
with the recipient pinned to the acting user, and object-level authorisation — a
user can only read/update/delete their own notifications — is enforced here
via the user-scoped repository queries plus an explicit ownership check.
There is no manual create.
"""

import uuid

from app.core.logging import get_logger
from app.repositories.notification import NotificationRepository
from app.schemas.notification import NotificationList, NotificationRead
from app.services.notification import normalize_recipient

logger = get_logger(__name__)


def _to_read(n) -> NotificationRead:
    return NotificationRead(
        id=str(n.id),
        user_email=n.user_email,
        title=n.title,
        body=n.body,
        link=n.link,
        url=n.url,
        read=n.read,
        created_at=n.created_at,
    )


class NotificationService:
    def __init__(self, repository: NotificationRepository, actor: str) -> None:
        self._repo = repository
        # Normalised once, here, so every downstream comparison uses the same
        # form notify() writes.
        self._actor = normalize_recipient(actor)

    async def list(self, offset: int = 0, limit: int = 50) -> NotificationList:
        total, unread = await self._repo.counts_for(self._actor)
        items = await self._repo.list_for(self._actor, offset=offset, limit=limit)
        return NotificationList(total=total, unread=unread, items=[_to_read(n) for n in items])

    async def mark_read(self, notification_id: uuid.UUID) -> NotificationRead | None:
        n = await self._repo.get(notification_id)
        if n is None or n.user_email != self._actor:
            return None
        n.read = True
        await self._repo._session.flush()
        await self._repo._session.refresh(n)
        return _to_read(n)

    async def mark_all_read(self) -> None:
        for n in await self._repo.unread_for(self._actor):
            n.read = True
        await self._repo._session.flush()

    async def dismiss(self, notification_id: uuid.UUID) -> bool:
        """Hide one notification from the bell. Unlike delete, the row stays,
        so notify() won't re-create it."""
        n = await self._repo.get(notification_id)
        if n is None or n.user_email != self._actor:
            return False
        n.dismissed = True
        n.read = True
        await self._repo._session.flush()
        return True

    async def dismiss_all(self) -> None:
        await self._repo.dismiss_all_for(self._actor)

    async def delete(self, notification_id: uuid.UUID) -> bool:
        n = await self._repo.get(notification_id)
        if n is None or n.user_email != self._actor:
            return False
        link = n.link
        await self._repo.delete(n)
        # Deleting is a deliberate "re-arm" (notify() may recreate it), so it is
        # logged. It is not written to `changelog`: a notification is not a
        # domain record, and bell dismissals would bury the record changes.
        logger.info(
            "notification_deleted",
            notification_id=str(notification_id),
            actor=self._actor,
            link=link,
        )
        return True
