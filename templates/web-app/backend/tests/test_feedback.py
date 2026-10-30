"""Help → Report or suggest: stored always, emailed when set up."""

import base64

import pytest

from app.core.config import get_settings
from app.services import mailer

pytestmark = pytest.mark.usefixtures("db_engine")

# A 1×1 PNG.
PNG = base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
    )
).decode()
SHOT = f"data:image/png;base64,{PNG}"


async def _login(client, admin_auth) -> None:
    assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200


@pytest.fixture
def smtp(monkeypatch):
    """SMTP configured, with sent messages captured instead of delivered."""
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "fieldline@example.com")
    sent = []
    monkeypatch.setattr(mailer, "_send_sync", lambda msg: sent.append(msg))
    return sent


async def _set_recipient(client, email="support@example.com"):
    r = await client.put("/api/admin/settings", json={"feedback_email": email})
    assert r.status_code == 200, r.text
    return r.json()


async def test_report_is_emailed_with_screenshot_and_details(client, admin_auth, smtp):
    await _login(client, admin_auth)
    await _set_recipient(client)
    r = await client.post(
        "/api/feedback",
        json={
            "kind": "bug",
            "summary": "Map export is blank",
            "details": "Pressed Export PDF on the map.",
            "context": {"page": {"url": "/map"}, "browser": {"name": "Chrome", "version": "130"}},
            "screenshot": SHOT,
            # Ignored: the reporter comes from the session.
            "reporter_email": "someone@else.com",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["emailed"] is True
    [msg] = smtp
    assert msg["To"] == "support@example.com"
    assert msg["Subject"] == "[Fieldline] Bug: Map export is blank"
    assert msg["Reply-To"] == admin_auth["email"]
    body = msg.get_body(("plain",)).get_content()
    assert "Pressed Export PDF on the map." in body
    assert "browser.name: Chrome" in body
    [attachment] = list(msg.iter_attachments())
    assert attachment.get_filename() == "screenshot.png"

    listed = (await client.get("/api/admin/feedback")).json()
    item = listed["items"][0]
    assert item["reporter_email"] == admin_auth["email"]
    assert item["has_screenshot"] and item["emailed"]
    shot = await client.get(f"/api/admin/feedback/{item['id']}/screenshot")
    assert shot.status_code == 200 and shot.headers["content-type"] == "image/png"


async def test_report_is_kept_when_email_is_not_set_up(client, admin_auth, smtp):
    await _login(client, admin_auth)
    r = await client.post("/api/feedback", json={"kind": "idea", "summary": "Dark map"})
    assert r.status_code == 201
    assert r.json() == {"id": r.json()["id"], "emailed": False, "message": "Saved for the admins."}
    assert smtp == []
    item = (await client.get("/api/admin/feedback")).json()["items"][0]
    assert "No address set" in item["email_error"]


async def test_mail_failure_is_recorded_not_raised(client, admin_auth, monkeypatch):
    await _login(client, admin_auth)
    await _set_recipient(client)
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_host", "smtp.test")
    monkeypatch.setattr(settings, "smtp_from", "fieldline@example.com")

    def boom(_msg):
        raise OSError("connection refused")

    monkeypatch.setattr(mailer, "_send_sync", boom)
    r = await client.post("/api/feedback", json={"summary": "It broke"})
    assert r.status_code == 201 and r.json()["emailed"] is False
    item = (await client.get("/api/admin/feedback")).json()["items"][0]
    assert "connection refused" in item["email_error"]


@pytest.mark.parametrize(
    "shot",
    [
        "data:image/gif;base64,R0lGOD",
        "data:image/png;base64,bm90IGEgcG5n",
        "data:image/png;base64,***",
    ],
)
async def test_bad_screenshots_are_refused(client, admin_auth, shot):
    await _login(client, admin_auth)
    r = await client.post("/api/feedback", json={"summary": "x", "screenshot": shot})
    assert r.status_code == 422


async def test_reports_are_rate_limited(client, admin_auth, monkeypatch):
    await _login(client, admin_auth)
    monkeypatch.setattr("app.services.feedback.MAX_PER_HOUR", 2)
    for _ in range(2):
        assert (await client.post("/api/feedback", json={"summary": "x"})).status_code == 201
    assert (await client.post("/api/feedback", json={"summary": "x"})).status_code == 429


async def test_settings_are_admin_only_and_validated(client, admin_auth):
    assert (await client.get("/api/admin/settings")).status_code == 401
    await _login(client, admin_auth)
    bad = await client.put("/api/admin/settings", json={"feedback_email": "not an email"})
    assert bad.status_code == 422
    ok = await _set_recipient(client, "  team@example.com ")
    assert ok["feedback_email"] == "team@example.com"
    assert (await client.get("/api/admin/settings")).json()["feedback_email"] == "team@example.com"


async def test_test_email(client, admin_auth, smtp):
    await _login(client, admin_auth)
    assert (await client.post("/api/admin/settings/test-email")).status_code == 409
    await _set_recipient(client)
    assert (await client.post("/api/admin/settings/test-email")).status_code == 204
    assert smtp[0]["Subject"] == "[Fieldline] Test email"


async def test_feedback_needs_sign_in(client):
    assert (await client.post("/api/feedback", json={"summary": "x"})).status_code == 401
