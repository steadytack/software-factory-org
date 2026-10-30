"""Role model: viewer < editor < admin.

Viewers read and comment; editors also create and edit sites and surveys;
only admins delete, manage users and use /admin."""

import io

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

PASSWORD = "Role#Test#Pass1"
SITE = {"name": "Role Site", "site_type": "bridge", "latitude": 51.5, "longitude": -0.12}


async def _login(client, email: str, password: str = PASSWORD) -> None:
    await client.post("/api/auth/logout")
    response = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text


async def _setup(client, admin_auth) -> dict:
    """Users of each role plus one record of each kind, made by the admin."""
    await _login(client, admin_auth["email"], admin_auth["password"])
    for role in ("viewer", "editor"):
        r = await client.post(
            "/api/users", json={"email": f"{role}@example.com", "password": PASSWORD, "role": role}
        )
        assert r.status_code == 201, r.text
        assert r.json()["role"] == role
    site = (await client.post("/api/sites", json=SITE)).json()
    survey = (
        await client.post(
            "/api/surveys",
            json={"site_id": site["id"], "surveyor": "A", "survey_date": "2026-09-01"},
        )
    ).json()
    return {"site": site, "survey": survey}


async def test_me_reports_role(client, admin_auth):
    await _setup(client, admin_auth)
    for role in ("viewer", "editor"):
        await _login(client, f"{role}@example.com")
        me = (await client.get("/api/auth/me")).json()
        assert me["role"] == role
        assert me["is_admin"] is False
    await _login(client, admin_auth["email"], admin_auth["password"])
    assert (await client.get("/api/auth/me")).json()["role"] == "admin"


async def test_viewer_reads_and_comments_only(client, admin_auth):
    rec = await _setup(client, admin_auth)
    await _login(client, "viewer@example.com")
    assert (await client.get("/api/sites")).status_code == 200
    comment = await client.post(
        "/api/comments", json={"entity": "site", "entity_id": rec["site"]["id"], "text": "hi"}
    )
    assert comment.status_code == 201
    for method, path, body in [
        ("post", "/api/sites", SITE),
        ("patch", f"/api/sites/{rec['site']['id']}", {"name": "x"}),
        (
            "post",
            "/api/surveys",
            {"site_id": rec["site"]["id"], "surveyor": "V", "survey_date": "2026-09-02"},
        ),
        ("patch", f"/api/surveys/{rec['survey']['id']}", {"summary": "y"}),
        ("delete", f"/api/surveys/{rec['survey']['id']}", None),
        ("get", "/api/users", None),
        ("get", "/api/admin/stats", None),
    ]:
        response = await client.request(method, path, json=body)
        assert response.status_code == 403, f"viewer {method} {path} → {response.status_code}"


async def test_editor_records_field_work_but_cannot_delete(client, admin_auth):
    rec = await _setup(client, admin_auth)
    await _login(client, "editor@example.com")

    site = await client.post("/api/sites", json={**SITE, "name": "Editor Site"})
    assert site.status_code == 201
    assert (
        await client.patch(f"/api/sites/{site.json()['id']}", json={"name": "Renamed"})
    ).status_code == 200
    survey = await client.post(
        "/api/surveys",
        json={"site_id": rec["site"]["id"], "surveyor": "S", "survey_date": "2026-09-03"},
    )
    assert survey.status_code == 201
    assert (
        await client.patch(f"/api/surveys/{rec['survey']['id']}", json={"summary": "Re-checked"})
    ).status_code == 200

    for method, path in [
        ("delete", f"/api/surveys/{survey.json()['id']}"),
        ("delete", f"/api/surveys/{rec['survey']['id']}"),
        ("delete", f"/api/sites/{rec['site']['id']}"),
        ("get", "/api/users"),
        ("get", "/api/admin/stats"),
    ]:
        response = await client.request(method, path)
        assert response.status_code == 403, f"editor {method} {path} → {response.status_code}"


async def test_admin_deletes_and_changes_roles(client, admin_auth):
    rec = await _setup(client, admin_auth)
    users = (await client.get("/api/users")).json()
    viewer = next(u for u in users if u["email"] == "viewer@example.com")
    promoted = await client.patch(f"/api/users/{viewer['id']}", json={"role": "editor"})
    assert promoted.json()["role"] == "editor"

    bootstrap = next(u for u in users if u["is_bootstrap"])
    demote = await client.patch(f"/api/users/{bootstrap['id']}", json={"role": "viewer"})
    assert demote.status_code == 400

    assert (await client.delete(f"/api/surveys/{rec['survey']['id']}")).status_code == 204
    assert (await client.delete(f"/api/sites/{rec['site']['id']}")).status_code == 204


async def test_viewer_can_attach_files_but_not_remove_them(client, admin_auth):
    """Viewers may add files (owner decision, audit 2026-09-29 Q-AUTH-1) — like
    comments — but only admins delete. Pins the rule so it is intentional, not
    an accident of the endpoint only requiring a sign-in."""
    rec = await _setup(client, admin_auth)
    await _login(client, "viewer@example.com")
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "survey", "entity_id": rec["survey"]["id"]},
        files={"file": ("note.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    removed = await client.delete(f"/api/attachments/{uploaded.json()['id']}")
    assert removed.status_code == 403
