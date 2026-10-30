"""baseline schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-10-05

The whole schema as of the template's creation, in one step. New projects start
here and add their own migrations on top; the template's own history was
collapsed into this file.
"""

from collections.abc import Sequence

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PostGIS must exist before any Geometry column can be created. The
    # postgis/postgis image bundles the extension but does not enable it per
    # database, so the migration chain has to.
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_by", sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint("key"),
    )
    op.create_table(
        "changelog",
        sa.Column("entity", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("actor", sa.String(length=200), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "action IN ('created', 'updated', 'deleted')", name="ck_changelog_action"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_changelog_entity", "changelog", ["entity", "entity_id"], unique=False)
    op.create_index("ix_changelog_created_at_id", "changelog", ["created_at", "id"], unique=False)
    op.create_table(
        "feedback_reports",
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("summary", sa.String(length=150), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("reporter_email", sa.String(length=200), nullable=False),
        sa.Column("reporter_role", sa.String(length=20), nullable=False),
        sa.Column(
            "context",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("screenshot_path", sa.String(length=500), nullable=True),
        sa.Column("emailed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("email_error", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_feedback_reports_created_at", "feedback_reports", ["created_at"], unique=False
    )
    op.create_index(
        op.f("ix_feedback_reports_reporter_email"),
        "feedback_reports",
        ["reporter_email"],
        unique=False,
    )
    op.create_table(
        "login_failures",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("client_key", sa.String(length=300), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_login_failures_key_created",
        "login_failures",
        ["client_key", "created_at"],
        unique=False,
    )
    op.create_table(
        "notifications",
        sa.Column("user_email", sa.String(length=200), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("read", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("dismissed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("link", sa.String(length=200), nullable=True),
        sa.Column("url", sa.String(length=300), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notifications_created_at_id", "notifications", ["created_at", "id"], unique=False
    )
    op.create_index(
        op.f("ix_notifications_user_email"), "notifications", ["user_email"], unique=False
    )
    op.create_table(
        "revoked_tokens",
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("jti"),
    )
    op.create_index(
        op.f("ix_revoked_tokens_expires_at"), "revoked_tokens", ["expires_at"], unique=False
    )
    # GeoAlchemy2 creates the GiST index on `location` with the table itself.
    op.create_table(
        "sites",
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("site_type", sa.String(length=50), server_default="other", nullable=False),
        sa.Column("status", sa.String(length=20), server_default="active", nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("postcode", sa.String(length=10), nullable=True),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column(
            "location",
            geoalchemy2.types.Geometry(
                geometry_type="POINT",
                srid=4326,
                dimension=2,
                from_text="ST_GeomFromEWKT",
                name="geometry",
                nullable=False,
            ),
            nullable=False,
        ),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "site_type IN ('bridge', 'building', 'playground', 'outfall', 'other')",
            name="ck_sites_site_type",
        ),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_sites_status"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sites_created_at_id", "sites", ["created_at", "id"], unique=False)
    op.create_index(op.f("ix_sites_is_demo"), "sites", ["is_demo"], unique=False)
    op.create_index(
        "uq_sites_name_normalized", "sites", [sa.literal_column("lower(btrim(name))")], unique=True
    )
    op.create_table(
        "users",
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=True),
        sa.Column("role", sa.String(length=20), server_default=sa.text("'viewer'"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("token_version", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint("role IN ('viewer', 'editor', 'admin')", name="ck_users_role"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table(
        "surveys",
        sa.Column("site_id", sa.UUID(), nullable=False),
        sa.Column("surveyor", sa.String(length=200), nullable=False),
        sa.Column("survey_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="draft", nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("is_demo", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.String(length=200), nullable=True),
        sa.Column("delete_batch", sa.UUID(), nullable=True),
        sa.CheckConstraint("status IN ('draft', 'completed')", name="ck_surveys_status"),
        sa.ForeignKeyConstraint(["site_id"], ["sites.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_surveys_created_at_id", "surveys", ["created_at", "id"], unique=False)
    op.create_index(op.f("ix_surveys_deleted_at"), "surveys", ["deleted_at"], unique=False)
    op.create_index(op.f("ix_surveys_is_demo"), "surveys", ["is_demo"], unique=False)
    op.create_index(op.f("ix_surveys_site_id"), "surveys", ["site_id"], unique=False)
    op.create_index("ix_surveys_survey_date_id", "surveys", ["survey_date", "id"], unique=False)
    op.create_table(
        "attachments",
        sa.Column("entity", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("site_id", sa.UUID(), nullable=True),
        sa.Column("survey_id", sa.UUID(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=True),
        sa.Column("uploaded_by", sa.String(length=200), nullable=False),
        sa.Column("stored_path", sa.String(length=500), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(entity = 'site' AND site_id = entity_id AND survey_id IS NULL) OR (entity = 'survey' AND survey_id = entity_id AND site_id IS NULL)",
            name="ck_attachments_entity_arc",
        ),
        sa.CheckConstraint("entity IN ('site', 'survey')", name="ck_attachments_entity"),
        sa.ForeignKeyConstraint(
            ["site_id"], ["sites.id"], name="fk_attachments_site_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["survey_id"], ["surveys.id"], name="fk_attachments_survey_id", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_attachments_entity", "attachments", ["entity", "entity_id"], unique=False)
    op.create_index(
        "ix_attachments_created_at_id", "attachments", ["created_at", "id"], unique=False
    )
    op.create_index("ix_attachments_site_id", "attachments", ["site_id"], unique=False)
    op.create_index("ix_attachments_survey_id", "attachments", ["survey_id"], unique=False)
    op.create_table(
        "comments",
        sa.Column("entity", sa.String(length=100), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("site_id", sa.UUID(), nullable=True),
        sa.Column("survey_id", sa.UUID(), nullable=True),
        sa.Column("author", sa.String(length=200), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(entity = 'site' AND site_id = entity_id AND survey_id IS NULL) OR (entity = 'survey' AND survey_id = entity_id AND site_id IS NULL)",
            name="ck_comments_entity_arc",
        ),
        sa.CheckConstraint("entity IN ('site', 'survey')", name="ck_comments_entity"),
        sa.ForeignKeyConstraint(
            ["site_id"], ["sites.id"], name="fk_comments_site_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["survey_id"], ["surveys.id"], name="fk_comments_survey_id", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_comments_entity", "comments", ["entity", "entity_id"], unique=False)
    op.create_index("ix_comments_created_at_id", "comments", ["created_at", "id"], unique=False)
    op.create_index("ix_comments_site_id", "comments", ["site_id"], unique=False)
    op.create_index("ix_comments_survey_id", "comments", ["survey_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_comments_survey_id", table_name="comments")
    op.drop_index("ix_comments_site_id", table_name="comments")
    op.drop_index("ix_comments_created_at_id", table_name="comments")
    op.drop_index("idx_comments_entity", table_name="comments")
    op.drop_table("comments")
    op.drop_index("ix_attachments_survey_id", table_name="attachments")
    op.drop_index("ix_attachments_site_id", table_name="attachments")
    op.drop_index("ix_attachments_created_at_id", table_name="attachments")
    op.drop_index("idx_attachments_entity", table_name="attachments")
    op.drop_table("attachments")
    op.drop_index("ix_surveys_survey_date_id", table_name="surveys")
    op.drop_index(op.f("ix_surveys_site_id"), table_name="surveys")
    op.drop_index(op.f("ix_surveys_is_demo"), table_name="surveys")
    op.drop_index(op.f("ix_surveys_deleted_at"), table_name="surveys")
    op.drop_index("ix_surveys_created_at_id", table_name="surveys")
    op.drop_table("surveys")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_index("uq_sites_name_normalized", table_name="sites")
    op.drop_index(op.f("ix_sites_is_demo"), table_name="sites")
    op.drop_index("ix_sites_created_at_id", table_name="sites")
    op.drop_table("sites")
    op.drop_index(op.f("ix_revoked_tokens_expires_at"), table_name="revoked_tokens")
    op.drop_table("revoked_tokens")
    op.drop_index(op.f("ix_notifications_user_email"), table_name="notifications")
    op.drop_index("ix_notifications_created_at_id", table_name="notifications")
    op.drop_table("notifications")
    op.drop_index("ix_login_failures_key_created", table_name="login_failures")
    op.drop_table("login_failures")
    op.drop_index(op.f("ix_feedback_reports_reporter_email"), table_name="feedback_reports")
    op.drop_index("ix_feedback_reports_created_at", table_name="feedback_reports")
    op.drop_table("feedback_reports")
    op.drop_index("ix_changelog_created_at_id", table_name="changelog")
    op.drop_index("idx_changelog_entity", table_name="changelog")
    op.drop_table("changelog")
    op.drop_table("app_settings")
