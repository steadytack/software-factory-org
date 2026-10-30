"""Data safety: the changelog records before/after values and account
events, a delete says what it took with it, and stored files are removed
from disk (only) once the delete has committed."""

import io
from pathlib import Path

import pytest
from sqlalchemy import select

from app.models.comment import Attachment

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {"name": "Safety Site", "site_type": "bridge", "latitude": 51.5, "longitude": -0.12}


async def _login(client, admin_auth) -> None:
    assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200


async def _changelog(client, **params) -> list[dict]:
    return (await client.get("/api/changelog", params=params)).json()["items"]


async def test_updates_record_old_and_new_values(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    await client.patch(
        f"/api/sites/{site['id']}", json={"status": "archived", "name": SITE["name"]}
    )
    entry = (await _changelog(client, entity="site", entity_id=site["id"]))[0]
    # Only the field that actually changed; re-sending the same name isn't one.
    assert entry["changes"] == {"status": ["active", "archived"]}

    survey = (
        await client.post(
            "/api/surveys",
            json={"site_id": site["id"], "surveyor": "A", "survey_date": "2026-09-01"},
        )
    ).json()
    await client.patch(f"/api/surveys/{survey['id']}", json={"survey_date": "2026-09-02"})
    entry = (await _changelog(client, entity="survey", entity_id=survey["id"]))[0]
    assert entry["changes"] == {"survey_date": ["2026-09-01", "2026-09-02"]}


async def test_site_delete_lists_what_it_took_and_removes_files(client, admin_auth, db_session):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    survey = (
        await client.post(
            "/api/surveys",
            json={"site_id": site["id"], "surveyor": "A", "survey_date": "2026-09-01"},
        )
    ).json()
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "survey", "entity_id": survey["id"]},
        files={"file": ("photo.txt", io.BytesIO(b"pretend photo"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    stored = await db_session.scalar(
        select(Attachment.stored_path).where(Attachment.id == uploaded.json()["id"])
    )
    assert stored and Path(stored).exists()

    assert (await client.delete(f"/api/sites/{site['id']}")).status_code == 204
    # The row went with the cascade, and now the file on disk has too.
    assert not Path(stored).exists()
    entry = (await _changelog(client, entity="site", entity_id=site["id"]))[0]
    assert entry["action"] == "deleted"
    assert "1 surveys, 1 files" in entry["summary"]


async def test_survey_delete_removes_its_files(client, admin_auth, db_session):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    survey = (
        await client.post(
            "/api/surveys",
            json={"site_id": site["id"], "surveyor": "A", "survey_date": "2026-09-01"},
        )
    ).json()
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "survey", "entity_id": survey["id"]},
        files={"file": ("note.txt", io.BytesIO(b"bytes"), "text/plain")},
    )
    stored = await db_session.scalar(
        select(Attachment.stored_path).where(Attachment.id == uploaded.json()["id"])
    )
    assert (await client.delete(f"/api/surveys/{survey['id']}")).status_code == 204
    # In the recycle bin the file is kept (it can be restored)...
    assert Path(stored).exists()
    # ...and removed once the survey is purged.
    purge_url = f"/api/admin/recycle-bin/survey/{survey['id']}"
    assert (await client.delete(purge_url)).status_code == 204
    assert not Path(stored).exists()


async def test_account_events_are_audited(client, admin_auth):
    await _login(client, admin_auth)
    created = (
        await client.post(
            "/api/users",
            json={"email": "audit@example.com", "password": "Audit#Pass#123", "role": "viewer"},
        )
    ).json()
    await client.patch(f"/api/users/{created['id']}", json={"role": "editor"})
    await client.post(f"/api/users/{created['id']}/password", json={"password": "Other#Pass#123"})

    entries = [e for e in await _changelog(client) if e["entity_id"] == created["id"]]
    summaries = [e["summary"] for e in entries]
    assert "Created user audit@example.com as viewer" in summaries
    assert "Reset the password for audit@example.com" in summaries
    role_change = next(e for e in entries if e["changes"])
    assert role_change["changes"] == {"role": ["viewer", "editor"]}
    assert all(e["actor"] == admin_auth["email"].lower() for e in entries)


async def test_health_checks_the_database(client):
    response = await client.get("/api/health")
    assert response.json() == {"status": "ok", "database": "ok"}
