"""Data-integrity tests for the seeder, demo flags, config and dead fields
(stage 8).

Covers MIG-2 (the seeder as a second unvalidated write path), Q-D7
(`is_demo` + the seeder gate), Q-D9 (the dead `attachments.url`) and GOV-4
(the duplicated database password).
"""

import pytest
from sqlalchemy import func, select, text

from app.models.site import Site
from app.models.survey import Survey
from tests.test_data_integrity import _login, _site

pytestmark = pytest.mark.usefixtures("db_engine")


@pytest.fixture
def seeding_enabled(monkeypatch):
    """Turn the (now opt-in) seeder on for one test."""
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "seed_enabled", True)


@pytest.fixture
def seeding_disabled(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "seed_enabled", False)


# ── Q-D7: the seeder is opt-in ─────────────────────────────────────────────


async def test_reseed_is_refused_when_disabled(client, admin_auth, seeding_disabled):
    """Q-D7 / GOV-3: the demo seeder shipped **enabled** and reachable at
    `POST /api/admin/reseed` in any deployment with admin credentials."""
    await _login(client, admin_auth)
    response = await client.post("/api/admin/reseed")
    assert response.status_code == 403
    assert "SEED_ENABLED" in response.json()["detail"]


async def test_seed_function_refuses_when_disabled(db_session, seeding_disabled):
    """The CLI path is gated by the same flag, not just the HTTP route."""
    from app.seed import SeedDisabledError, seed

    with pytest.raises(SeedDisabledError):
        await seed(db_session)


# ── MIG-2: the seeder writes through the API's own path ────────────────────


async def test_seeder_writes_validated_rows_with_changelog(
    client, admin_auth, db_session, seeding_enabled
):
    """The seeder goes through the same schema → service path as the API, so
    its rows are validated and leave an audit-trail entry."""
    from app.models.changelog import ChangelogEntry
    from app.seed import SEED_ACTOR, SEED_SITES, seed

    counts = await seed(db_session)
    assert counts.sites == len(SEED_SITES)
    assert counts.surveys > 0

    # Every seeded row produces an audit-trail entry, attributed to a
    # distinguishable actor.
    seeded_entries = await db_session.scalar(
        select(func.count()).select_from(ChangelogEntry).where(ChangelogEntry.actor == SEED_ACTOR)
    )
    assert seeded_entries >= counts.sites + counts.surveys


async def test_seeder_marks_every_row_is_demo(client, admin_auth, db_session, seeding_enabled):
    """Demo rows are distinguishable from real ones by `is_demo`."""
    from app.seed import seed

    await seed(db_session)
    for model in (Site, Survey):
        not_demo = await db_session.scalar(
            select(func.count()).select_from(model).where(model.is_demo.is_(False))
        )
        assert not_demo == 0, f"a seeded {model.__tablename__} row was not marked is_demo"


async def test_api_created_rows_are_not_demo(client, admin_auth, db_session):
    """The flag has to mean something: an API-created row is never demo."""
    await _login(client, admin_auth)
    site = await _site(client, name="Real Site, Not Demo")
    is_demo = await db_session.scalar(select(Site.is_demo).where(Site.id == site["id"]))
    assert is_demo is False


async def test_seeder_is_idempotent_per_site(client, admin_auth, db_session, seeding_enabled):
    """MIG-2: the old guard was "any site exists", so a database holding one
    real site could never be seeded and a half-seeded database could never be
    repaired. Idempotency is now per site."""
    from app.seed import SEED_SITES, seed

    # A real site exists, and it is NOT one of the demo ones — the old guard
    # would have refused to seed at all.
    await _login(client, admin_auth)
    await _site(client, name="A Real Site Blocking The Old Guard")

    first = await seed(db_session)
    assert first.sites == len(SEED_SITES)

    # A second run creates nothing and raises nothing — including no 409 from
    # the normalised unique index.
    second = await seed(db_session)
    assert second.sites == 0
    assert second.sites_skipped == len(SEED_SITES)

    total_sites = await db_session.scalar(select(func.count()).select_from(Site))
    assert total_sites == len(SEED_SITES) + 1


async def test_seeder_skips_a_case_variant_name(client, admin_auth, db_session, seeding_enabled):
    """MIG-2 + INT-2 together: the skip check matches the NORMALISED name, the
    same key the unique index uses, so a case variant is recognised as already
    present instead of causing a 409 halfway through the seed."""
    from app.seed import SEED_SITES, seed

    await _login(client, admin_auth)
    await _site(client, name="tower bridge")  # lowercase variant of a demo site

    counts = await seed(db_session)
    assert counts.sites_skipped == 1
    assert counts.sites == len(SEED_SITES) - 1


# ── Q-D9: the dead url column is gone ─────────────────────────────────────


async def test_attachments_url_column_is_gone(db_connection):
    """Q-D9: declared for "externally-hosted links registered without an
    upload", never written by any code path (`create()` hard-coded
    `url=None`), so every value was NULL and the distinction was dead."""
    found = await db_connection.scalar(
        text(
            "SELECT count(*) FROM information_schema.columns "
            "WHERE table_name = 'attachments' AND column_name = 'url'"
        )
    )
    assert found == 0


async def test_attachment_read_schema_has_no_url():
    from app.schemas.comment import AttachmentRead

    assert "url" not in AttachmentRead.model_fields


# ── GOV-4: one place for the database password ─────────────────────────────


def test_database_url_is_composed_from_the_parts():
    """GOV-4: the password was written twice in `.env` — as
    `POSTGRES_PASSWORD` and again inline inside `DATABASE_URL` — so rotating
    one and not the other broke the backend silently."""
    from app.core.config import Settings

    settings = Settings(
        admin_email="a@example.com",
        admin_password="A-fine-test-password-1",
        jwt_secret="k" * 48,
        database_url="",
        postgres_user="app",
        postgres_password="p@ss:w/ord",
        postgres_db="survey",
        postgres_host="db",
        postgres_port=5432,
    )
    # The password is percent-encoded: an unescaped '@', ':' or '/' would
    # corrupt the URL it is embedded in.
    assert settings.database_url == ("postgresql+asyncpg://app:p%40ss%3Aw%2Ford@db:5432/survey")


def test_explicit_database_url_still_wins():
    """A managed database with a single connection string is a normal
    deployment shape; composing must not take it away."""
    from app.core.config import Settings

    settings = Settings(
        admin_email="a@example.com",
        admin_password="A-fine-test-password-1",
        jwt_secret="k" * 48,
        database_url="postgresql+asyncpg://u:p@managed.example:5432/prod",
    )
    assert settings.database_url == "postgresql+asyncpg://u:p@managed.example:5432/prod"


def test_missing_database_config_fails_fast():
    """Neither a URL nor the parts is a configuration error, not a default."""
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(
            admin_email="a@example.com",
            admin_password="A-fine-test-password-1",
            jwt_secret="k" * 48,
            database_url="",
            postgres_user="",
            postgres_password="",
            postgres_db="",
        )


# ── MIG-1: migration hygiene ──────────────────────────────────────────────


async def test_no_duplicate_indexes_on_the_generic_tables(db_connection):
    """MIG-1(c): `0010` created three indexes that duplicated `0005`/`0007`'s
    byte for byte — confirmed live as 6 indexes where 3 are needed."""
    rows = (
        await db_connection.execute(
            text(
                "SELECT tablename, indexdef FROM pg_indexes "
                "WHERE schemaname = 'public' AND tablename IN "
                "('comments', 'attachments', 'changelog')"
            )
        )
    ).all()
    # Compare the index DEFINITIONS with their names removed: two indexes over
    # the same table and columns are duplicates whatever they are called.
    definitions = [(table, definition[definition.index(" ON ") :]) for table, definition in rows]
    assert len(definitions) == len(set(definitions)), f"duplicate index definitions: {definitions}"


async def test_status_columns_have_server_defaults(db_connection):
    """Status columns carry a `server_default`, so a raw SQL insert need not
    supply every categorical value."""
    expected = {
        ("sites", "site_type"): "other",
        ("sites", "status"): "active",
        ("surveys", "status"): "draft",
    }
    for (table, column), value in expected.items():
        default = await db_connection.scalar(
            text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        )
        assert default is not None, f"{table}.{column} has no server_default"
        assert value in default
