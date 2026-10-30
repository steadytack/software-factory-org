"""Data-integrity tests for referential integrity and identifiers (stage 6).

Covers INT-1 (real FKs / cascade for comments and attachments), INT-2 / Q-D2
(case- and whitespace-insensitive site names), TYP-3 (UUID-typed `entity_id`)
and the deliberate exclusion of `changelog` from all of it.
"""

import io
import uuid

import pytest
from sqlalchemy import func, select, text

from app.models.changelog import ChangelogEntry
from app.models.comment import Attachment, Comment
from tests.test_data_integrity import _login, _site, _survey

pytestmark = pytest.mark.usefixtures("db_engine")


async def _comment_on(client, entity: str, entity_id: str) -> dict:
    response = await client.post(
        "/api/comments",
        json={"entity": entity, "entity_id": entity_id, "text": f"note on {entity}"},
    )
    assert response.status_code == 201, response.text
    return response.json()


# ── INT-1: deleting ANY parent cascades its comments and attachments ───────


@pytest.mark.parametrize("parent", ["site", "survey"])
async def test_deleting_any_parent_cascades_its_comments(client, admin_auth, db_connection, parent):
    """Referential integrity is enforced by the database for every parent:
    deleting a site or a survey directly removes its comments and attachments,
    not only the site delete path."""
    await _login(client, admin_auth)
    site = await _site(client)
    survey = await _survey(client, site["id"])
    records = {
        "site": (site["id"], f"/api/sites/{site['id']}"),
        "survey": (survey["id"], f"/api/surveys/{survey['id']}"),
    }
    parent_id, delete_url = records[parent]
    await _comment_on(client, parent, parent_id)

    assert (
        await db_connection.scalar(
            select(func.count())
            .select_from(Comment)
            .where(Comment.entity_id == uuid.UUID(parent_id))
        )
        == 1
    )

    assert (await client.delete(delete_url)).status_code == 204
    if parent != "site":
        # Surveys go to the recycle bin first; the cascade happens when they
        # are purged from it.
        purged = await client.delete(f"/api/admin/recycle-bin/{parent}/{parent_id}")
        assert purged.status_code == 204

    remaining = await db_connection.scalar(
        select(func.count()).select_from(Comment).where(Comment.entity_id == uuid.UUID(parent_id))
    )
    assert remaining == 0, f"deleting a {parent} left its comments orphaned"


async def test_deleting_a_survey_cascades_its_attachments(client, admin_auth, db_connection):
    """INT-1 for attachments, which also hold bytes on the volume."""
    await _login(client, admin_auth)
    site = await _site(client)
    survey = await _survey(client, site["id"])
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "survey", "entity_id": survey["id"]},
        files={"file": ("note.txt", io.BytesIO(b"bytes"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text

    assert (await client.delete(f"/api/surveys/{survey['id']}")).status_code == 204
    purge_url = f"/api/admin/recycle-bin/survey/{survey['id']}"
    assert (await client.delete(purge_url)).status_code == 204
    remaining = await db_connection.scalar(
        select(func.count())
        .select_from(Attachment)
        .where(Attachment.entity_id == uuid.UUID(survey["id"]))
    )
    assert remaining == 0


async def test_site_delete_cascades_children_comments(client, admin_auth, db_connection):
    """The FK cascade must reach comments on the site's *descendants* too."""
    await _login(client, admin_auth)
    site = await _site(client)
    survey = await _survey(client, site["id"])
    for entity, record_id in (("site", site["id"]), ("survey", survey["id"])):
        await _comment_on(client, entity, record_id)

    assert (await client.delete(f"/api/sites/{site['id']}")).status_code == 204
    assert await db_connection.scalar(select(func.count()).select_from(Comment)) == 0


async def test_changelog_is_deliberately_not_cascaded(client, admin_auth, db_connection):
    """The audit trail must survive its subject's deletion — 34 existing rows
    reference deleted sites, by design. It is the one generic table that
    deliberately gets NO foreign key (see migration 0017's docstring)."""
    await _login(client, admin_auth)
    site = await _site(client)
    assert (await client.delete(f"/api/sites/{site['id']}")).status_code == 204

    surviving = await db_connection.scalar(
        select(func.count())
        .select_from(ChangelogEntry)
        .where(ChangelogEntry.entity_id == site["id"])
    )
    assert surviving >= 2, "the changelog must keep created + deleted for a gone record"

    fks = await db_connection.scalar(
        text(
            "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid "
            "WHERE c.contype = 'f' AND t.relname = 'changelog'"
        )
    )
    assert fks == 0, "changelog must have no foreign keys"


# ── TYP-3: entity_id is a real uuid column ─────────────────────────────────


@pytest.mark.parametrize("table", ["comments", "attachments"])
async def test_entity_id_is_uuid_typed(db_connection, table):
    """TYP-3: the same UUIDs were stored as `VARCHAR(64)` text, which already
    caused one production 500 (Prompt 1 SPEC-30) and forced
    `cast(Site.id, String)` in the orphan cleanup."""
    data_type = await db_connection.scalar(
        text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = 'entity_id'"
        ),
        {"t": table},
    )
    assert data_type == "uuid"


async def test_malformed_entity_id_is_404_not_a_500(client, admin_auth):
    """TYP-3: a junk entity_id must be a clean 404, never a type error."""
    await _login(client, admin_auth)
    response = await client.post(
        "/api/comments",
        json={"entity": "site", "entity_id": "not-a-uuid", "text": "t"},
    )
    assert response.status_code == 404


# ── INT-2 / Q-D2: case- and whitespace-insensitive site names ──────────────


@pytest.mark.parametrize(
    "variant",
    [
        "Case Test Bridge",  # exact
        "case test bridge",  # case
        "CASE TEST BRIDGE",
        "  Case Test Bridge  ",  # whitespace (trimmed on write, VAL-1)
        "  case test BRIDGE ",  # both
    ],
)
async def test_site_name_uniqueness_is_case_and_whitespace_insensitive(client, admin_auth, variant):
    """INT-2 / Q-D2: `uq_sites_name` was byte-exact, so `Name`, `name` and
    `Name ` all coexisted — exactly the variants a user retyping a name
    produces. Existing data had 0 violations, so the constraint was free to
    add."""
    await _login(client, admin_auth)
    await _site(client, name="Case Test Bridge")
    duplicate = await client.post(
        "/api/sites",
        json={
            "name": variant,
            "site_type": "bridge",
            "status": "active",
            "latitude": 51.5,
            "longitude": -0.12,
        },
    )
    assert duplicate.status_code == 409, duplicate.text


async def test_genuinely_different_site_names_still_allowed(client, admin_auth):
    """INT-2 regression guard: normalisation must not collapse real names."""
    await _login(client, admin_auth)
    await _site(client, name="North Bridge")
    other = await client.post(
        "/api/sites",
        json={
            "name": "North Bridge Annex",
            "site_type": "bridge",
            "status": "active",
            "latitude": 51.5,
            "longitude": -0.12,
        },
    )
    assert other.status_code == 201


# ── INT-3 / Q-D5: attribution survives, and is compared consistently ──────


async def test_attribution_email_survives_and_has_no_fk(db_connection):
    """Q-D5: accountability wins over erasure — attribution columns are plain
    stored strings with **no** FK to `users`, so a deleted user's email
    survives in the audit trail. INT-3's proposed FK is deliberately not
    added; what *is* fixed is the inconsistent case comparison (see
    `normalize_recipient`)."""
    for table in ("changelog", "comments", "attachments", "notifications"):
        fks = await db_connection.scalar(
            text(
                "SELECT count(*) FROM pg_constraint c "
                "JOIN pg_class t ON t.oid = c.conrelid "
                "JOIN pg_class r ON r.oid = c.confrelid "
                "WHERE c.contype = 'f' AND t.relname = :t AND r.relname = 'users'"
            ),
            {"t": table},
        )
        assert fks == 0, f"{table} must not FK to users — attribution must survive"
