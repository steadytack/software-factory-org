import uuid

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPkMixin, vocabulary_check

# ── Generic reference with real referential integrity ────
#
# `entity` + `entity_id` is the polymorphic read key every query and index
# already uses, and it stays. What it never had was integrity: no FK, so
# deleting a record left its comments and attachments orphaned until an admin
# pressed the cleanup button.
#
# The fix is the standard exclusive-arc pattern: one nullable FK column per
# possible parent, each with a genuine `ON DELETE CASCADE`, populated from
# `entity_id` when `entity` matches. A CHECK constraint asserts that exactly
# the arc named by `entity` is set and that it equals `entity_id`, so the
# polymorphic key and the enforced key cannot drift.
#
# `changelog` is deliberately NOT given any of this — it must survive the
# deletion of its subject (34 existing rows reference deleted sites, by
# design), so an FK there would either block deletes or destroy the audit
# trail.
ARC_PARENTS: dict[str, str] = {
    "site": "sites",
    "survey": "surveys",
}
ARC_COLUMNS: dict[str, str] = {entity: f"{entity}_id" for entity in ARC_PARENTS}


def _arc(table: str, parent_table: str, column: str):
    """One arc column: a nullable FK to `parent_table` that cascades on delete.

    The constraint and index are named explicitly so `metadata.create_all`
    (the test schema) matches migration 0017 byte for byte — an unnamed FK
    gets SQLAlchemy's `<table>_<column>_fkey`, a different name from the
    migration's `fk_<table>_<column>`, and that kind of invisible divergence
    between the test and production schemas is exactly.
    """
    return mapped_column(
        column,
        ForeignKey(f"{parent_table}.id", ondelete="CASCADE", name=f"fk_{table}_{column}"),
        nullable=True,
    )


def _entity_arc_check(table: str) -> CheckConstraint:
    arms = " OR ".join(
        "(entity = '{entity}' AND {column} = entity_id AND {nulls})".format(
            entity=entity,
            column=column,
            nulls=" AND ".join(
                f"{other} IS NULL" for other in ARC_COLUMNS.values() if other != column
            ),
        )
        for entity, column in ARC_COLUMNS.items()
    )
    return CheckConstraint(arms, name=f"ck_{table}_entity_arc")


def arc_fields(entity: str, entity_id: uuid.UUID) -> dict[str, uuid.UUID]:
    """The arc column to populate for this entity — `{"<entity>_id": id}`.

    Callers pass this straight into the model constructor, so there is one
    place that knows how the polymorphic key maps onto the enforced one.
    """
    return {ARC_COLUMNS[entity]: entity_id}


class Comment(Base, UUIDPkMixin, TimestampMixin):
    """A discussion comment attached to any domain record (generic ref)."""

    __tablename__ = "comments"
    __table_args__ = (
        Index("idx_comments_entity", "entity", "entity_id"),
        Index("ix_comments_created_at_id", "created_at", "id"),
        *(Index(f"ix_comments_{c}", c) for c in ARC_COLUMNS.values()),
        vocabulary_check("comments", "entity"),
        _entity_arc_check("comments"),
    )

    entity: Mapped[str] = mapped_column(String(100), nullable=False)
    # Real `uuid`, not VARCHAR(64) holding UUID text — the
    # mismatch already caused one production 500 and forced casts in the
    # orphan cleanup.
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    site_id: Mapped[uuid.UUID | None] = _arc("comments", "sites", "site_id")
    survey_id: Mapped[uuid.UUID | None] = _arc("comments", "surveys", "survey_id")
    author: Mapped[str] = mapped_column(String(200), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)


class Attachment(Base, UUIDPkMixin, TimestampMixin):
    """A file attached to any domain record.

    Files are stored on the filesystem (ATTACHMENTS_DIR, a Docker volume);
    this row tracks metadata and the stored path.

    There used to be a nullable `url` column here, declared for
    "externally-hosted links registered without an upload". No code path ever
    wrote it — `AttachmentRepository.create` hard-coded `url=None` — so the
    distinction it was meant to carry never existed. Removed in migration
    0018.
    """

    __tablename__ = "attachments"
    __table_args__ = (
        Index("idx_attachments_entity", "entity", "entity_id"),
        Index("ix_attachments_created_at_id", "created_at", "id"),
        *(Index(f"ix_attachments_{c}", c) for c in ARC_COLUMNS.values()),
        vocabulary_check("attachments", "entity"),
        _entity_arc_check("attachments"),
    )

    entity: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    site_id: Mapped[uuid.UUID | None] = _arc("attachments", "sites", "site_id")
    survey_id: Mapped[uuid.UUID | None] = _arc("attachments", "surveys", "survey_id")
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Explicitly BigInteger: the migration creates `bigint`, but with no
    # declared type SQLAlchemy infers 32-bit `Integer`, so the test schema
    # (metadata.create_all) silently differed from production.
    size_bytes: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )
    content_type: Mapped[str | None] = mapped_column(String(100))
    uploaded_by: Mapped[str] = mapped_column(String(200), nullable=False)
    stored_path: Mapped[str | None] = mapped_column(String(500))
