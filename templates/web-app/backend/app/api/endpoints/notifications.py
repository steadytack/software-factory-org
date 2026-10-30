"""Notifications endpoints — thin HTTP adapters over NotificationService
(schemas in schemas/notification.py, queries in repositories/notification.py,
rules in services/notification_service.py).

Notifications are system-generated (services/notification.notify) only. There is
deliberately NO manual-create endpoint: an app cannot
forge its own alerts, and the free-form `url` a client could set was an
unvalidated navigation target. Mark-read/delete remain user-scoped.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.auth import get_current_subject
from app.core.database import SessionDep
from app.repositories.notification import NotificationRepository
from app.schemas.notification import NotificationList, NotificationRead
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


def get_service(
    session=SessionDep,
    actor: str = Depends(get_current_subject),
) -> NotificationService:
    return NotificationService(NotificationRepository(session), actor=actor)


@router.get("", response_model=NotificationList)
async def list_notifications(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    service: NotificationService = Depends(get_service),
) -> NotificationList:
    return await service.list(offset=offset, limit=limit)


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: uuid.UUID,
    service: NotificationService = Depends(get_service),
) -> NotificationRead:
    n = await service.mark_read(notification_id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    return n


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    service: NotificationService = Depends(get_service),
) -> None:
    await service.mark_all_read()


@router.post("/dismiss-all", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_all(
    service: NotificationService = Depends(get_service),
) -> None:
    """Clear the bell: hide every notification (they stay dismissed —
    notify() won't bring them back)."""
    await service.dismiss_all()


@router.post("/{notification_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss(
    notification_id: uuid.UUID,
    service: NotificationService = Depends(get_service),
) -> None:
    if not await service.dismiss(notification_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: uuid.UUID,
    service: NotificationService = Depends(get_service),
) -> None:
    if not await service.delete(notification_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
