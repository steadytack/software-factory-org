"""Notification repository — extracted from the endpoints module."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


class NotificationRepository:
    """All storage access for Notification lives here. All queries are scoped
    to the owning user (object-level authorisation lives in the service)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def counts_for(self, user_email: str) -> tuple[int, int]:
        """Total and unread counts in one round-trip (hardening EFF-1)."""
        row = (
            await self._session.execute(
                select(
                    func.count().label("total"),
                    func.count().filter(Notification.read.is_(False)).label("unread"),
                )
                .select_from(Notification)
                .where(Notification.user_email == user_email, Notification.dismissed.is_(False))
            )
        ).one()
        return int(row.total), int(row.unread)

    async def list_for(
        self, user_email: str, offset: int = 0, limit: int = 50
    ) -> list[Notification]:
        result = await self._session.execute(
            select(Notification)
            .where(Notification.user_email == user_email, Notification.dismissed.is_(False))
            # `id DESC` tiebreaker: a sweep writes every notification in one
            # transaction, so they all share a created_at.
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def unread_for(self, user_email: str) -> list[Notification]:
        result = await self._session.execute(
            select(Notification).where(
                Notification.user_email == user_email,
                Notification.read.is_(False),
                Notification.dismissed.is_(False),
            )
        )
        return list(result.scalars().all())

    async def dismiss_all_for(self, user_email: str) -> None:
        """Hide every visible notification for one user (and mark it read)."""
        await self._session.execute(
            update(Notification)
            .where(Notification.user_email == user_email, Notification.dismissed.is_(False))
            .values(dismissed=True, read=True)
        )
        await self._session.flush()

    async def get(self, notification_id: uuid.UUID) -> Notification | None:
        return await self._session.get(Notification, notification_id)

    async def delete(self, notification: Notification) -> None:
        await self._session.delete(notification)
        await self._session.flush()
