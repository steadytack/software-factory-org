"""Recycle bin: delete moves a record (and any live children) out of sight;
admins restore it, or purge it for good."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import update

from app.models.survey import Survey
from app.services.recycle_bin import purge_older_than

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {"name": "Bin Site", "site_type": "bridge", "latitude": 51.5, "longitude": -0.12}


async def _login(client, email, password) -> None:
    await client.post("/api/auth/logout")
    response = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200


async def _tree(client, name: str = "Bin Site") -> dict:
    site = (await client.post("/api/sites", json={**SITE, "name": name})).json()
    survey = (
        await client.post(
            "/api/surveys",
            json={"site_id": site["id"], "surveyor": "A", "survey_date": "2026-09-01"},
        )
    ).json()
    return {"site": site, "survey": survey}


async def test_delete_hides_the_record_and_restore_brings_it_back(client, admin_auth):
    await _login(client, admin_auth["email"], admin_auth["password"])
    t = await _tree(client)
    site_id = t["site"]["id"]
    before = (await client.get("/api/stats/dashboard")).json()

    assert (await client.delete(f"/api/surveys/{t['survey']['id']}")).status_code == 204

    # Gone from gets, lists and counts.
    assert (await client.get(f"/api/surveys/{t['survey']['id']}")).status_code == 404
    assert (await client.get("/api/surveys", params={"site_id": site_id})).json()["total"] == 0
    after = (await client.get("/api/stats/dashboard")).json()
    assert after["total_surveys"] == before["total_surveys"] - 1

    bin_items = (await client.get("/api/admin/recycle-bin")).json()["items"]
    entry = next(i for i in bin_items if i["id"] == t["survey"]["id"])
    assert entry["entity"] == "survey"
    assert entry["with_count"] == 0
    assert entry["site_name"] == "Bin Site"

    restore = await client.post(f"/api/admin/recycle-bin/survey/{t['survey']['id']}/restore")
    assert restore.status_code == 204
    assert (await client.get(f"/api/surveys/{t['survey']['id']}")).status_code == 200


async def test_restoring_a_live_record_is_404(client, admin_auth):
    await _login(client, admin_auth["email"], admin_auth["password"])
    t = await _tree(client)
    restore = await client.post(f"/api/admin/recycle-bin/survey/{t['survey']['id']}/restore")
    assert restore.status_code == 404


async def test_purge_is_permanent(client, admin_auth):
    await _login(client, admin_auth["email"], admin_auth["password"])
    t = await _tree(client)
    await client.delete(f"/api/surveys/{t['survey']['id']}")
    purge_url = f"/api/admin/recycle-bin/survey/{t['survey']['id']}"
    assert (await client.delete(purge_url)).status_code == 204
    restore = await client.post(f"{purge_url}/restore")
    assert restore.status_code == 404


async def test_scheduled_purge_only_takes_old_items(client, admin_auth, db_session):
    await _login(client, admin_auth["email"], admin_auth["password"])
    old = await _tree(client, "Old Bin Site")
    fresh = await _tree(client, "Fresh Bin Site")
    await client.delete(f"/api/surveys/{old['survey']['id']}")
    await client.delete(f"/api/surveys/{fresh['survey']['id']}")
    await db_session.execute(
        update(Survey)
        .where(Survey.id == old["survey"]["id"])
        .values(deleted_at=datetime.now(UTC) - timedelta(days=45))
    )
    assert await purge_older_than(db_session, 30) == 1
    await db_session.commit()
    ids = {i["id"] for i in (await client.get("/api/admin/recycle-bin")).json()["items"]}
    assert fresh["survey"]["id"] in ids
    assert old["survey"]["id"] not in ids


async def test_recycle_bin_is_admin_only(client, admin_auth):
    await _login(client, admin_auth["email"], admin_auth["password"])
    await client.post(
        "/api/users",
        json={"email": "bineditor@example.com", "password": "Bin#Editor#1", "role": "editor"},
    )
    await _login(client, "bineditor@example.com", "Bin#Editor#1")
    assert (await client.get("/api/admin/recycle-bin")).status_code == 403


async def test_export_everything(client, admin_auth):
    import csv
    import io
    import zipfile

    await _login(client, admin_auth["email"], admin_auth["password"])
    t = await _tree(client, "Export Site")
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "survey", "entity_id": t["survey"]["id"]},
        files={"file": ("notes.txt", io.BytesIO(b"field notes"), "text/plain")},
    )
    assert uploaded.status_code == 201

    response = await client.get("/api/admin/export", params={"files": "true"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    assert {"sites.csv", "surveys.csv", "users.csv", "README.txt"} <= names
    assert f"files/{uploaded.json()['id']}/notes.txt" in names

    # The export starts with a UTF-8 BOM so Excel reads accents correctly.
    sites = list(csv.DictReader(io.StringIO(archive.read("sites.csv").decode("utf-8-sig"))))
    row = next(r for r in sites if r["name"] == "Export Site")
    assert float(row["location_latitude"]) == 51.5
    users_csv = archive.read("users.csv").decode()
    assert "password_hash" not in users_csv
