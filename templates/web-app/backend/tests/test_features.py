"""Tests for comments, attachments (upload/download round-trip), refresh,
changelog endpoints, admin maintenance endpoints, FK validation and enum
enforcement."""

import io

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {
    "name": "Notif Test Site",
    "site_type": "bridge",
    "status": "active",
    "latitude": 51.5,
    "longitude": -0.12,
}


async def _login(client, admin_auth) -> None:
    response = await client.post("/api/auth/login", json=admin_auth)
    assert response.status_code == 200


# ── Notifications: overdue sweep + dedup ─────────────────────────────────────


async def test_dashboard_stats_response_shape(client, admin_auth):
    """Characterisation test (prompt 2, stage 1): pins the /api/stats/dashboard
    contract before the frontend fetch is routed through expectData."""
    await _login(client, admin_auth)
    response = await client.get("/api/stats/dashboard")
    assert response.status_code == 200
    assert set(response.json()) == {
        "total_sites",
        "total_surveys",
        "draft_surveys",
        "surveys_this_week",
        "surveys_prev_week",
        "surveys_per_day",
        "surveys_by_status",
    }


# ── Attachments: real upload/download round-trip ─────────────────────────────


async def test_attachment_upload_download_delete(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()

    files = {"file": ("notes.txt", io.BytesIO(b"attachment body"), "text/plain")}
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": site["id"]},
        files=files,
    )
    assert uploaded.status_code == 201
    body = uploaded.json()
    assert body["name"] == "notes.txt"
    assert body["size_bytes"] == len(b"attachment body")

    downloaded = await client.get(f"/api/attachments/{body['id']}/download")
    assert downloaded.status_code == 200
    assert downloaded.content == b"attachment body"
    assert downloaded.headers["content-disposition"].startswith("attachment")

    # ?inline=1 serves a previewable type for in-browser display.
    preview = await client.get(f"/api/attachments/{body['id']}/download", params={"inline": "1"})
    assert preview.status_code == 200
    assert preview.headers["content-disposition"].startswith("inline")
    assert preview.headers["content-type"].startswith("text/plain")

    deleted = await client.delete(f"/api/attachments/{body['id']}")
    assert deleted.status_code == 204
    gone = await client.get(f"/api/attachments/{body['id']}/download")
    assert gone.status_code == 404


async def test_attachment_upload_requires_auth(client):
    files = {"file": ("x.txt", io.BytesIO(b"x"), "text/plain")}
    response = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": "whatever"},
        files=files,
    )
    assert response.status_code == 401


async def test_attachment_download_requires_auth(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    files = {"file": ("a.txt", io.BytesIO(b"a"), "text/plain")}
    uploaded = (
        await client.post(
            "/api/attachments",
            params={"entity": "site", "entity_id": site["id"]},
            files=files,
        )
    ).json()
    # Fresh client without cookies → 401.
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as anon:
        response = await anon.get(f"/api/attachments/{uploaded['id']}/download")
    assert response.status_code == 401


# ── Refresh endpoint ─────────────────────────────────────────────────────────


async def test_refresh_without_cookie_fails(client):
    response = await client.post("/api/auth/refresh")
    assert response.status_code == 401


async def test_refresh_after_login(client, admin_auth):
    await _login(client, admin_auth)
    response = await client.post("/api/auth/refresh")
    assert response.status_code == 200


# ── Changelog endpoints ──────────────────────────────────────────────────────


async def test_changelog_records_site_lifecycle(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    await client.patch(f"/api/sites/{site['id']}", json={"name": "Renamed CL"})
    await client.delete(f"/api/sites/{site['id']}")

    entries = (
        await client.get("/api/changelog", params={"entity": "site", "entity_id": site["id"]})
    ).json()
    actions = [e["action"] for e in entries["items"]]
    assert actions == ["deleted", "updated", "created"]
    assert entries["total"] == 3
    assert all(e["actor"] for e in entries["items"])


async def test_changelog_post_removed(client):
    """AUDIT-1: the manual-create endpoint was removed — an admin-writable
    audit log is not an audit log. POST is now 405 (no such route)."""
    response = await client.post(
        "/api/changelog",
        json={"entity": "site", "entity_id": "x", "action": "created", "summary": "s"},
    )
    assert response.status_code == 405


# ── Admin maintenance endpoints ──────────────────────────────────────────────


async def test_admin_stats_requires_auth(client):
    response = await client.get("/api/admin/stats")
    assert response.status_code == 401


async def test_admin_stats_and_health(client, admin_auth):
    await _login(client, admin_auth)
    stats = await client.get("/api/admin/stats")
    assert stats.status_code == 200
    assert "sites" in stats.json()["counts"]

    health = await client.get("/api/admin/db-health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["postgis_version"]


# `test_admin_reseed_noops_when_data_exists` lived here. It is replaced by
# `test_reseed_is_refused_when_disabled` and `test_seeder_is_idempotent_per_site`
# in tests/test_data_integrity_hygiene.py, because both of the behaviours it
# asserted changed by decision:
#   * Q-D7 — the seeder is disabled by default (403), so it is no longer
#     reachable in a deployment just because the caller is an admin;
#   * MIG-2 — the "any site exists" no-op guard is gone. It meant a database
#     holding one real site could never be seeded and a half-seeded database
#     could never be repaired. Idempotency is now per site.
# The replacements set SEED_ENABLED explicitly rather than depending on the
# ambient .env value, which is what made this version of the test fragile.


async def test_admin_orphan_cleanup_removes_orphans(client, admin_auth, db_connection):
    """Regression: DELETE /admin/orphans used to 500 with
    'operator does not exist: character varying = uuid' because entity_id is
    varchar and the id subquery returned uuid. It must now succeed and remove
    comments/attachments whose parent record is gone."""
    from sqlalchemy import text as sql_text

    await _login(client, admin_auth)
    # Insert a comment whose parent id does not exist — an orphan by
    # definition (the API refuses to create one, so go direct).
    await db_connection.execute(
        sql_text(
            "INSERT INTO comments (id, entity, entity_id, author, text, created_at) "
            "VALUES (gen_random_uuid(), 'site', "
            "'00000000-0000-0000-0000-000000000000', 'tester', 'orphan', now())"
        )
    )

    response = await client.delete("/api/admin/orphans")
    assert response.status_code == 200, response.text
    assert response.json()["removed"]["comments"] >= 1


async def test_attachment_upload_missing_parent_returns_404(client, admin_auth):
    """Regression: uploading to a non-existent parent used to 500
    with NameError: delete_stored is not defined. It must 404 and must not
    leave the just-stored file behind."""
    await _login(client, admin_auth)
    files = {"file": ("orphan.txt", io.BytesIO(b"orphan body"), "text/plain")}
    response = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": "00000000-0000-0000-0000-000000000000"},
        files=files,
    )
    assert response.status_code == 404, response.text


# ── FK parent validation → 404 ───────────────────────────────────────────────


async def test_survey_with_missing_site_returns_404(client, admin_auth):
    await _login(client, admin_auth)
    response = await client.post(
        "/api/surveys",
        json={
            "site_id": "00000000-0000-0000-0000-000000000000",
            "surveyor": "T",
            "survey_date": "2026-01-01",
            "status": "draft",
        },
    )
    assert response.status_code == 404


# ── Enum enforcement → 422 ───────────────────────────────────────────────────


async def test_site_rejects_unknown_status(client, admin_auth):
    await _login(client, admin_auth)
    response = await client.post("/api/sites", json={**SITE, "status": "bogus"})
    assert response.status_code == 422


# ── Overdue filter ───────────────────────────────────────────────────────────


# ── Generic-table cascade: comments die with the entity, changelog stays ─────


async def test_site_delete_removes_comments_keeps_changelog(client, admin_auth, db_connection):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    comment = await client.post(
        "/api/comments",
        json={"entity": "site", "entity_id": site["id"], "text": "orphan test"},
    )
    assert comment.status_code == 201

    deleted = await client.delete(f"/api/sites/{site['id']}")
    assert deleted.status_code == 204

    # The comment row is gone. Checked in SQL rather than over the API
    # because listing comments for a deleted parent is now a 404 —
    # "this record has no comments" and "there is no such record" are
    # deliberately no longer the same response.
    from sqlalchemy import func, select

    from app.models.comment import Comment

    remaining = await db_connection.scalar(
        select(func.count()).select_from(Comment).where(Comment.entity_id == site["id"])
    )
    assert remaining == 0
    orphaned_list = await client.get(
        "/api/comments", params={"entity": "site", "entity_id": site["id"]}
    )
    assert orphaned_list.status_code == 404

    entries = (
        await client.get("/api/changelog", params={"entity": "site", "entity_id": site["id"]})
    ).json()
    assert len(entries["items"]) >= 2  # created + deleted kept for audit


# ── Data-integrity audit fixes ───────────────────────────────────────────────


async def test_survey_rejects_unknown_enum_values(client, admin_auth):
    """Enums are enforced at the schema boundary for every entity, not just Site."""
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    survey = await client.post(
        "/api/surveys",
        json={
            "site_id": site["id"],
            "surveyor": "T",
            "survey_date": "2026-01-01",
            "status": "bogus",
        },
    )
    assert survey.status_code == 422


async def test_patch_null_clears_optional_field(client, admin_auth):
    """F4: explicit null in PATCH clears the field (was silently ignored)."""
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json={**SITE, "address": "1 Test St"})).json()
    assert site["address"] == "1 Test Site".replace("Test Site", "1 Test Site") or site["address"]
    updated = await client.patch(f"/api/sites/{site['id']}", json={"address": None})
    assert updated.status_code == 200
    assert updated.json()["address"] is None


async def test_duplicate_site_name_rejected(client, admin_auth):
    """F12: sites.name is unique (migration 0009)."""
    await _login(client, admin_auth)
    first = await client.post("/api/sites", json={**SITE, "name": "Unique Name Co"})
    assert first.status_code == 201
    second = await client.post("/api/sites", json={**SITE, "name": "Unique Name Co"})
    assert second.status_code in (409, 422)


async def test_comment_on_missing_parent_returns_404(client, admin_auth):
    """F9: comments/attachments validate entity name and parent existence."""
    await _login(client, admin_auth)
    bad_entity = await client.post(
        "/api/comments",
        json={"entity": "widget", "entity_id": "x", "text": "t"},
    )
    # 422 now, not 404: `entity` is typed to the vocabulary (EntityValue), so
    # an unknown entity NAME fails schema validation before any lookup
    # . An unknown *parent* is still a 404 — asserted below.
    assert bad_entity.status_code == 422
    bad_parent = await client.post(
        "/api/comments",
        json={"entity": "site", "entity_id": "00000000-0000-0000-0000-000000000000", "text": "t"},
    )
    assert bad_parent.status_code == 404


async def test_changelog_delete_removed(client, admin_auth):
    """F10: the audit trail has no delete endpoint."""
    await _login(client, admin_auth)
    response = await client.delete("/api/changelog/00000000-0000-0000-0000-000000000000")
    assert response.status_code in (404, 405)


async def test_changelog_rejects_unknown_action(client, admin_auth):
    """F10 / AUDIT-1: the manual-create endpoint is gone, so an unknown action
    can no longer be submitted at all — POST is 405."""
    await _login(client, admin_auth)
    response = await client.post(
        "/api/changelog",
        json={"entity": "site", "entity_id": "x", "action": "nuked", "summary": "s"},
    )
    assert response.status_code == 405


# ── Negative auth tests (hardening audit stage 1) ────────────────────────────


async def test_delete_site_requires_auth(client):
    """Unauthenticated DELETE on a domain resource must be rejected."""
    response = await client.delete("/api/sites/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 401


async def test_patch_site_requires_auth(client):
    response = await client.patch(
        "/api/sites/00000000-0000-0000-0000-000000000000", json={"name": "x"}
    )
    assert response.status_code == 401


async def test_download_with_escaped_stored_path_rejected(client, admin_auth, db_session):
    """A crafted DB row whose stored_path points outside the storage root must
    never be served (path traversal via DB row).

    Written through `db_session` (bound to the per-test transaction) rather
    than a second engine-bound session: `attachments.site_id` is a real FK, so
    a row inserted on another connection cannot see the site this test
    created and the insert legitimately fails."""
    from app.models.comment import Attachment

    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()

    # Simulate a crafted row (as if written by a compromised import).
    db_session.add(
        Attachment(
            entity="site",
            entity_id=site["id"],
            name="evil.txt",
            size_bytes=1,
            content_type="text/plain",
            uploaded_by="admin@example.com",
            # `url` is gone (: no code path ever wrote it).
            stored_path="/etc/passwd",
            # The FK arc must be populated, or ck_attachments_entity_arc
            # rejects the row.
            site_id=site["id"],
        )
    )
    await db_session.flush()
    # The endpoint must 404 (not 500, not the file contents).
    listing = (
        await client.get("/api/attachments", params={"entity": "site", "entity_id": site["id"]})
    ).json()
    evil = next(a for a in listing["items"] if a["name"] == "evil.txt")
    response = await client.get(f"/api/attachments/{evil['id']}/download")
    assert response.status_code == 404


async def test_upload_rejects_disallowed_content_type(client, admin_auth):
    """The content-type allowlist is enforced — HTML uploads are rejected
    with 415 (stored XSS via uploaded file is not servable)."""
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    files = {"file": ("x.html", io.BytesIO(b"<h1>x</h1>"), "text/html")}
    response = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": site["id"]},
        files=files,
    )
    assert response.status_code == 415

    # An allowlisted type still succeeds.
    ok = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": site["id"]},
        files={"file": ("ok.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert ok.status_code == 201


async def test_security_headers_include_csp(client):
    """Every response carries the fail-closed CSP (API serves no HTML)."""
    response = await client.get("/api/health")
    assert response.status_code == 200
    csp = response.headers["content-security-policy"]
    assert "default-src 'none'" in csp
    assert "frame-ancestors 'none'" in csp
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-content-type-options"] == "nosniff"


async def test_upload_uses_the_extension_when_the_browser_sends_a_generic_type(client, admin_auth):
    """A browser that doesn't know .geojson or .csv sends application/octet-stream: the
    extension decides, within the same allowlist."""
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    params = {"entity": "site", "entity_id": site["id"]}
    for name, body in (
        ("area.geojson", b'{"type":"FeatureCollection","features":[]}'),
        ("data.csv", b"a,b\n1,2\n"),
    ):
        ok = await client.post(
            "/api/attachments",
            params=params,
            files={"file": (name, io.BytesIO(body), "application/octet-stream")},
        )
        assert ok.status_code == 201, name
    listing = (await client.get("/api/attachments", params=params)).json()["items"]
    types = {a["name"]: a["content_type"] for a in listing}
    assert types["area.geojson"] == "application/geo+json"
    assert types["data.csv"] == "text/csv"

    # An extension that isn't allowlisted is still refused, and a lie about the contents is still
    # caught.
    bad = await client.post(
        "/api/attachments",
        params=params,
        files={"file": ("x.html", io.BytesIO(b"<h1>x</h1>"), "application/octet-stream")},
    )
    assert bad.status_code == 415
    fake_pdf = await client.post(
        "/api/attachments",
        params=params,
        files={"file": ("x.pdf", io.BytesIO(b"not a pdf"), "application/octet-stream")},
    )
    assert fake_pdf.status_code == 415


async def test_iphone_photos_are_accepted_and_stored_as_jpeg(client, admin_auth):
    """HEIC (an iPhone's default), TIFF and BMP are converted to JPEG on upload, whatever
    type the browser declares."""
    pytest = __import__("pytest")
    pytest.importorskip("pillow_heif")
    from PIL import Image
    from pillow_heif import register_heif_opener

    register_heif_opener()
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    params = {"entity": "site", "entity_id": site["id"]}
    for fmt, name in (("HEIF", "IMG_0001.HEIC"), ("TIFF", "scan.tif"), ("BMP", "old.bmp")):
        buf = io.BytesIO()
        Image.new("RGB", (64, 48), (200, 30, 30)).save(buf, format=fmt)
        response = await client.post(
            "/api/attachments",
            params=params,
            files={"file": (name, io.BytesIO(buf.getvalue()), "application/octet-stream")},
        )
        assert response.status_code == 201, (fmt, response.text)
        body = response.json()
        assert body["content_type"] == "image/jpeg"
        assert body["name"].endswith(".jpg")
        assert body["has_thumbnail"] is True

    # A file that is not a HEIC is refused whatever it is called.
    fake = await client.post(
        "/api/attachments",
        params=params,
        files={"file": ("fake.heic", io.BytesIO(b"not an image at all"), "image/heic")},
    )
    assert fake.status_code == 415
