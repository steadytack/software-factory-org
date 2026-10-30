import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    Base,
    SoftDeleteMixin,
    TimestampMixin,
    UUIDPkMixin,
    vocabulary_check,
)


class Survey(Base, UUIDPkMixin, TimestampMixin, SoftDeleteMixin):
    """An inspection visit to a site."""

    __tablename__ = "surveys"
    __table_args__ = (
        Index("ix_surveys_survey_date_id", "survey_date", "id"),
        Index("ix_surveys_created_at_id", "created_at", "id"),
        vocabulary_check("surveys", "status"),
    )

    site_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    surveyor: Mapped[str] = mapped_column(String(200), nullable=False)
    survey_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft", server_default="draft"
    )
    summary: Mapped[str | None] = mapped_column(Text)
    # demo and real rows were indistinguishable in the
    # deployment database. Set by the seeder, false for anything the API
    # creates, so demo data can be identified and removed without guessing
    # from names.
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false"), index=True
    )
