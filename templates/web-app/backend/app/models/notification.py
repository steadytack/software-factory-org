from sqlalchemy import Boolean, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class Notification(Base, UUIDPkMixin, TimestampMixin):
    """A per-user notification (single-admin model: one recipient row)."""

    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_created_at_id", "created_at", "id"),)

    # Single-admin app: recipient is the admin email. Kept as a string so the
    # model survives a future multi-user migration unchanged.
    user_email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Hidden from the bell but kept, so the overdue sweep's dedup still sees
    # it and doesn't re-create it (DELETE, by contrast, deliberately re-arms).
    dismissed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Optional link to a domain record, e.g. "site:<uuid>"
    link: Mapped[str | None] = mapped_column(String(200))
    # Optional in-app path to open when the notification is clicked, e.g.
    # "/sites/<uuid>". Separate from `link` because `link` is the dedup key
    # (action:<uuid>) and is not itself a navigable route.
    url: Mapped[str | None] = mapped_column(String(300))
