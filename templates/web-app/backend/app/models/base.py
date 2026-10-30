import uuid
from datetime import UTC, datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.schemas.enums import CHECKED_COLUMNS, check_constraint_name


def vocabulary_check(table: str, column: str) -> CheckConstraint:
    """The same CHECK constraint migration 0016 creates, declared on the model.

    Declaring it here too means `metadata.create_all` (the test schema) carries
    the constraint, so a test can never pass against a schema laxer than
    production. Both sides read the values
    from `schemas.enums.CHECKED_COLUMNS`, so there is still exactly one
    definition of each vocabulary.
    """
    values = CHECKED_COLUMNS[(table, column)]
    rendered = ", ".join("'" + v.replace("'", "''") + "'" for v in values)
    return CheckConstraint(f"{column} IN ({rendered})", name=check_constraint_name(table, column))


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


def uuid7() -> uuid.UUID:
    """UUIDv7 PK: time-ordered. uuid6 is a hard dependency — no silent
    fallback to uuid4 (which would lose time-ordering; audit F16)."""
    from uuid6 import uuid7

    return uuid7()


class UUIDPkMixin:
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid7)


class SoftDeleteMixin:
    """Recycle bin: a deleted row stays until it is restored or purged.

    Deleting a record marks its live descendants in the same
    `delete_batch`, so a restore brings back exactly what went with it, and
    rows deleted separately beforehand stay deleted.
    """

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    deleted_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    delete_batch: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    @classmethod
    def live(cls):
        """WHERE clause for rows not in the recycle bin."""
        return cls.deleted_at.is_(None)
