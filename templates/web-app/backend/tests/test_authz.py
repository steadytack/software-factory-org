"""Negative-authorisation and token-integrity tests (hardening audit stage 1).

Covers the gaps found in the audit:
- A *non-admin authenticated* caller (a JWT signed with the real secret but
  for a different subject) must get 403 on admin-only routes — this is the
  only way to distinguish require_admin from get_current_subject in a
  single-admin model.
- Tampered / wrong-type / wrong-key JWTs must be rejected with 401.
- Comment endpoints (previously untested): create/list/delete + authz.
- Attachment entity validation and content-type allowlist behaviour.
"""

import io

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {
    "name": "Authz Test Site",
    "site_type": "bridge",
    "status": "active",
    "latitude": 51.5,
    "longitude": -0.12,
}


async def _login(client, admin_auth) -> None:
    response = await client.post("/api/auth/login", json=admin_auth)
    assert response.status_code == 200


# ── Non-admin authenticated caller → 403 ─────────────────────────────────────


def _forge_token(
    subject: str,
    token_type: str = "access",  # noqa: S107 — test fixture, not a credential
) -> str:
    """Forge a token signed with the real secret but for a different subject.
    This simulates what an attacker with a *valid* account (in a future
    multi-user world) could do — it must never pass require_admin."""
    from datetime import UTC, datetime, timedelta

    from app.core.security import create_token

    return create_token(
        subject,
        token_type,
        timedelta(minutes=15),
        extra={"iat": datetime.now(UTC)},
    )


async def test_non_admin_subject_gets_403_on_admin_write(client, admin_auth):
    """A validly-signed token for a real, active, non-admin account must be
    rejected with 403 (not 401) on admin-only routes — proves require_admin
    is enforced server-side, independent of the UI.

    NOTE: this must use a real non-admin user row, not a forged subject with
    no account — get_current_subject already 401s unknown subjects before
    require_admin's 403 branch is ever reached (see
    test_non_admin_subject_rejected_on_me below, which covers that case)."""
    from app.core.auth import ACCESS_COOKIE

    await _login(client, admin_auth)
    created = await client.post(
        "/api/users",
        json={"email": "nonadmin@example.com", "password": "Not#An#Admin#1"},
    )
    assert created.status_code == 201, created.text

    forged = _forge_token("nonadmin@example.com")
    client.headers["cookie"] = f"{ACCESS_COOKIE}={forged}"

    for method, path, json in [
        ("post", "/api/sites", SITE),
        ("patch", "/api/sites/00000000-0000-0000-0000-000000000000", {"name": "x"}),
        ("delete", "/api/sites/00000000-0000-0000-0000-000000000000", None),
        ("delete", "/api/comments/00000000-0000-0000-0000-000000000000", None),
        ("delete", "/api/attachments/00000000-0000-0000-0000-000000000000", None),
        ("get", "/api/admin/stats", None),
        ("post", "/api/admin/reseed", None),
        ("delete", "/api/admin/orphans", None),
    ]:
        response = await client.request(method, path, json=json)
        assert response.status_code == 403, f"{method} {path} → {response.status_code}"

    client.headers.pop("cookie", None)


async def test_reads_require_authentication(client):
    """SPEC-19: list/get reads require authentication. Anonymous reads of every
    read surface must be 401, not 200."""
    for path in [
        "/api/sites",
        "/api/surveys",
        "/api/changelog",
        "/api/stats/dashboard",
        "/api/comments?entity=site&entity_id=x",
        "/api/attachments?entity=site&entity_id=x",
    ]:
        response = await client.get(path)
        assert response.status_code == 401, f"GET {path} → {response.status_code}"


async def test_non_admin_subject_rejected_on_me(client, admin_auth):
    """A validly-signed token for a subject with no user row is rejected.
    (Multi-user model: unknown subjects are 401 at token validation; the
    old 403-for-non-admin semantics now apply to real, active, non-admin
    accounts — covered in test_users.py.)"""
    from app.core.auth import ACCESS_COOKIE

    forged = _forge_token("attacker@example.com")
    client.headers["cookie"] = f"{ACCESS_COOKIE}={forged}"
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
    client.headers.pop("cookie", None)


# ── Token integrity ──────────────────────────────────────────────────────────


async def test_tampered_jwt_rejected(client, admin_auth):
    """A token signed with the wrong key must be rejected with 401."""
    import jwt as pyjwt

    from app.core.auth import ACCESS_COOKIE
    from app.core.config import get_settings

    settings = get_settings()
    forged = pyjwt.encode(
        {"sub": settings.admin_email, "type": "access"},
        "wrong-secret-key",
        algorithm=settings.jwt_algorithm,
    )
    client.headers["cookie"] = f"{ACCESS_COOKIE}={forged}"
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
    client.headers.pop("cookie", None)


async def test_refresh_token_cannot_be_used_as_access_token(client, admin_auth):
    from app.core.auth import ACCESS_COOKIE, REFRESH_COOKIE

    await _login(client, admin_auth)
    # conftest exposes Set-Cookie values as x-test-cookie-* headers because
    # client.cookies hides Secure cookies over http://.
    refresh = client.headers.get(f"x-test-cookie-{REFRESH_COOKIE}")
    assert refresh, "login did not set a refresh token"
    client.headers["cookie"] = f"{ACCESS_COOKIE}={refresh}"
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
    client.headers.pop("cookie", None)
    client.headers.pop(f"x-test-cookie-{REFRESH_COOKIE}", None)


async def test_expired_access_token_rejected(client, admin_auth):
    from datetime import UTC, datetime, timedelta

    from app.core.auth import ACCESS_COOKIE
    from app.core.config import get_settings
    from app.core.security import create_token

    settings = get_settings()
    expired = create_token(
        settings.admin_email,
        "access",
        timedelta(minutes=-5),
        extra={"iat": datetime.now(UTC) - timedelta(minutes=10)},
    )
    client.headers["cookie"] = f"{ACCESS_COOKIE}={expired}"
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
    client.headers.pop("cookie", None)


# ── Comments endpoints (previously untested) ─────────────────────────────────


async def test_comment_create_list_delete_roundtrip(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()

    created = await client.post(
        "/api/comments",
        json={"entity": "site", "entity_id": site["id"], "text": "first comment"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["author"] == admin_auth["email"]
    assert body["text"] == "first comment"

    listed = (
        await client.get("/api/comments", params={"entity": "site", "entity_id": site["id"]})
    ).json()
    assert [c["id"] for c in listed["items"]] == [body["id"]]
    assert listed["total"] == 1

    deleted = await client.delete(f"/api/comments/{body['id']}")
    assert deleted.status_code == 204
    listed_after = (
        await client.get("/api/comments", params={"entity": "site", "entity_id": site["id"]})
    ).json()
    assert listed_after["items"] == []


async def test_comment_create_requires_auth(client):
    response = await client.post(
        "/api/comments",
        json={"entity": "site", "entity_id": "x", "text": "anon"},
    )
    assert response.status_code == 401


async def test_comment_delete_requires_admin(client, admin_auth):
    """Any authenticated subject can create; only admin deletes. In the
    single-admin model both are the same user, so this asserts the delete
    route carries the admin dependency (401 when anonymous)."""
    response = await client.delete("/api/comments/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 401


async def test_comment_list_requires_auth(client, admin_auth):
    """Reads require authentication — anonymous list is 401."""
    response = await client.get("/api/comments", params={"entity": "site", "entity_id": "whatever"})
    assert response.status_code == 401


async def test_comment_list_authed_read(client, admin_auth):
    """An authenticated caller can list comments for a real record (empty when
    it has none).

    Updated for FLT-3: an unknown parent (or a malformed entity_id) used to
    return an empty 200, indistinguishable from "this record has no
    comments". It is now a 404 — see test_comment_list_unknown_parent_404
    below and 03_report.md §3 item 8."""
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    response = await client.get("/api/comments", params={"entity": "site", "entity_id": site["id"]})
    assert response.status_code == 200
    assert response.json()["items"] == []


async def test_comment_list_unknown_parent_404(client, admin_auth):
    """FLT-3: a malformed or unknown entity_id is a 404, and a wrong-case
    entity is a 422 — not an empty 200 that looks like "no comments"."""
    await _login(client, admin_auth)
    malformed = await client.get(
        "/api/comments", params={"entity": "site", "entity_id": "whatever"}
    )
    assert malformed.status_code == 404
    missing = await client.get(
        "/api/comments",
        params={"entity": "site", "entity_id": "00000000-0000-0000-0000-000000000000"},
    )
    assert missing.status_code == 404
    wrong_case = await client.get(
        "/api/comments", params={"entity": "SITE", "entity_id": "whatever"}
    )
    assert wrong_case.status_code == 422


async def test_comment_rejects_blank_text(client, admin_auth):
    await _login(client, admin_auth)
    response = await client.post(
        "/api/comments",
        json={"entity": "site", "entity_id": "x", "text": ""},
    )
    assert response.status_code == 422


async def test_comment_rejects_whitespace_only_text(client, admin_auth):
    """min_length=1 alone accepts "   " — a blank comment. Must be 422."""
    await _login(client, admin_auth)
    response = await client.post(
        "/api/comments",
        json={"entity": "site", "entity_id": "x", "text": "   "},
    )
    assert response.status_code == 422


# ── Attachment validation ────────────────────────────────────────────────────


async def test_attachment_upload_rejects_oversized_file(client, admin_auth):
    """A file above MAX_UPLOAD_BYTES must be rejected with 413 — and must be
    rejected *before* the bytes are fully buffered (size guard)."""
    from app.core.storage import MAX_UPLOAD_BYTES

    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    big = b"x" * (MAX_UPLOAD_BYTES + 1)
    files = {"file": ("big.bin", io.BytesIO(big), "text/plain")}
    response = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": site["id"]},
        files=files,
    )
    assert response.status_code == 413


async def test_attachment_upload_rejects_empty_file(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    files = {"file": ("empty.txt", io.BytesIO(b""), "text/plain")}
    response = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": site["id"]},
        files=files,
    )
    # 422, not 413: a 0-byte upload is unprocessable, not too large. The
    # rejection itself is unchanged — only the status code, which used to
    # claim the wrong reason (Q-D1 of the data-integrity audit).
    assert response.status_code == 422


async def test_attachment_delete_requires_admin(client):
    response = await client.delete("/api/attachments/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 401
