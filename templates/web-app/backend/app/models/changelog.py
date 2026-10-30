from sqlalchemy import JSON, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin, vocabulary_check


class ChangelogEntry(Base, TimestampMixin, UUIDPkMixin):
    """One audit-trail entry for a change to a domain record.

    Generic entity/entity_id pattern (same as comments/attachments) so the
    log covers any domain record. Rows are intentionally NOT cascade-deleted
    with their entity — the audit trail survives record deletion.
    """

    __tablename__ = "changelog"
    __table_args__ = (
        Index("idx_changelog_entity", "entity", "entity_id"),
        Index("ix_changelog_created_at_id", "created_at", "id"),
        vocabulary_check("changelog", "action"),
    )

    entity: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)  # created/updated/deleted
    actor: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str] = mapped_column(String(500), nullable=False)
    # {field: [old, new]} for updates, so the history says what a value WAS,
    # not just that it changed. Null for creates/deletes and older rows.
    changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
