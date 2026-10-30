"""Notification schemas — extracted from the endpoints module.

Notifications are system-generated only (the overdue sweep); there is no
create schema because there is no manual-create endpoint (hardening SEC-1).
"""

from datetime import datetime

from pydantic import BaseModel


class NotificationRead(BaseModel):
    id: str
    user_email: str
    title: str
    body: str | None
    link: str | None
    url: str | None
    read: bool
    created_at: datetime


class NotificationList(BaseModel):
    total: int
    unread: int
    items: list[NotificationRead]
