from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin


class AppSetting(Base):
    """An admin-editable setting (key → value), for the few things that
    belong in the app rather than the deployment's environment — e.g. where
    feedback is emailed. Secrets (SMTP password) stay in the environment."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[str | None] = mapped_column(String(200))


class FeedbackReport(Base, UUIDPkMixin, TimestampMixin):
    """A bug report, problem or idea sent from Help → Report or suggest.
    Always stored, so nothing is lost when email isn't set up or fails."""

    __tablename__ = "feedback_reports"
    __table_args__ = (Index("ix_feedback_reports_created_at", "created_at"),)

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    summary: Mapped[str] = mapped_column(String(150), nullable=False)
    details: Mapped[str | None] = mapped_column(Text)
    # Who sent it — from the session, never from the request body.
    reporter_email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    reporter_role: Mapped[str] = mapped_column(String(20), nullable=False)
    # Page, browser, device, recent errors… as collected by the browser.
    context: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    screenshot_path: Mapped[str | None] = mapped_column(String(500))
    emailed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    email_error: Mapped[str | None] = mapped_column(Text)
