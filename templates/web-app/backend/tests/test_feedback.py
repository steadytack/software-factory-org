"""Help → Feedback: stored always, emailed when its type is routed to email."""

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
    monkeypatch.setattr(settings, "smtp_from", "app@example.com")
    sent = []
    monkeypatch.setattr(mailer, "_send_sync", lambda msg: sent.append(msg))
    return sent


def _route(destination="store", address=""):
    return {"destination": destination, "address": address}


async def _set_recipient(client, email="support@example.com", **routes):
    """Set the default address and route every type (or those given) to it."""
    body = {
        "feedback_email": email,
        "routes": {
            name: routes.get(name, _route("email"))
            for name in ("problem", "suggestion", "question")
        },
    }
    r = await client.put("/api/admin/settings", json=body)
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
    assert msg["Subject"] == f"[{get_settings().app_name}] Bug: Map export is blank"
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


async def test_report_is_kept_when_email_has_no_address(client, admin_auth, smtp):
    await _login(client, admin_auth)
    await _set_recipient(client, "")
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
    monkeypatch.setattr(settings, "smtp_from", "app@example.com")

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
    bad_route = await client.put(
        "/api/admin/settings",
        json={
            "routes": {
                "problem": _route("email", "nope"),
                "suggestion": _route(),
                "question": _route(),
            }
        },
    )
    assert bad_route.status_code == 422
    ok = await _set_recipient(client, "  team@example.com ")
    assert ok["feedback_email"] == "team@example.com"
    assert (await client.get("/api/admin/settings")).json()["feedback_email"] == "team@example.com"


async def test_test_email(client, admin_auth, smtp):
    await _login(client, admin_auth)
    assert (await client.post("/api/admin/settings/test-email")).status_code == 409
    await _set_recipient(client)
    assert (await client.post("/api/admin/settings/test-email")).status_code == 204
    assert smtp[0]["Subject"] == f"[{get_settings().app_name}] Test email"


async def test_feedback_needs_sign_in(client):
    assert (await client.post("/api/feedback", json={"summary": "x"})).status_code == 401


async def test_defaults_store_every_type_without_email(client, admin_auth, smtp):
    """Out of the box (FEEDBACK_* empty) every type is kept, none emailed,
    even with a default address set."""
    await _login(client, admin_auth)
    await client.put("/api/admin/settings", json={"feedback_email": "support@example.com"})
    settings = (await client.get("/api/admin/settings")).json()
    assert settings["routes"]["problem"] == {"destination": "store", "address": ""}
    for kind in ("bug", "idea", "other", "confusing"):
        r = await client.post("/api/feedback", json={"kind": kind, "summary": f"A {kind}"})
        assert r.status_code == 201 and r.json()["emailed"] is False
    assert smtp == []
    items = (await client.get("/api/admin/feedback")).json()["items"]
    assert len(items) == 4
    assert all(i["email_error"] is None for i in items)


async def test_each_type_goes_to_its_own_place(client, admin_auth, smtp):
    await _login(client, admin_auth)
    await _set_recipient(
        client,
        "default@example.com",
        problem=_route("email", "bugs@example.com"),
        suggestion=_route("email"),  # no address: the default one
        question=_route("store"),
    )
    for kind in ("bug", "confusing", "idea", "other"):
        assert (
            await client.post("/api/feedback", json={"kind": kind, "summary": kind})
        ).status_code == 201
    assert [m["To"] for m in smtp] == [
        "bugs@example.com",
        "bugs@example.com",
        "default@example.com",
    ]
    items = {i["kind"]: i for i in (await client.get("/api/admin/feedback")).json()["items"]}
    assert items["other"]["emailed"] is False and items["other"]["email_error"] is None


async def test_a_type_that_is_off_is_refused(client, admin_auth, smtp):
    await _login(client, admin_auth)
    await _set_recipient(client, question=_route("off"))
    r = await client.post("/api/feedback", json={"kind": "other", "summary": "How?"})
    assert r.status_code == 422
    assert "turned off" in r.json()["detail"]
    assert (await client.get("/api/admin/feedback")).json()["total"] == 0


async def test_config_defaults_come_from_settings(client, admin_auth, smtp, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "feedback_problem", "email:ops@example.com")
    monkeypatch.setattr(settings, "feedback_question", "off")
    await _login(client, admin_auth)
    config = (await client.get("/api/feedback/config")).json()
    assert config == {
        "types": [
            # The admin sees the address; a non-admin would not.
            {
                "type": "problem",
                "kind": "bug",
                "destination": "email",
                "address": "ops@example.com",
            },
            {"type": "suggestion", "kind": "idea", "destination": "store", "address": None},
        ]
    }
    routes = (await client.get("/api/admin/settings")).json()["routes"]
    assert routes["question"] == {"destination": "off", "address": ""}
    # An admin's choice wins over the setting.
    await _set_recipient(client, problem=_route("store"), question=_route("store"))
    types = (await client.get("/api/feedback/config")).json()["types"]
    assert [(t["type"], t["destination"]) for t in types] == [
        ("problem", "store"),
        ("suggestion", "email"),
        ("question", "store"),
    ]


async def test_config_hides_addresses_from_non_admins(client, admin_auth, smtp, monkeypatch):
    from app.api.endpoints import feedback as endpoint

    await _login(client, admin_auth)
    await _set_recipient(client)
    monkeypatch.setattr(endpoint, "effective_role", lambda _user: "viewer")
    types = (await client.get("/api/feedback/config")).json()["types"]
    assert {t["destination"] for t in types} == {"email"}
    assert all(t["address"] is None for t in types)


async def test_config_says_store_when_email_cannot_send(client, admin_auth):
    """Routed to email but SMTP isn't set up: the form says it's kept."""
    await _login(client, admin_auth)
    await _set_recipient(client)
    types = (await client.get("/api/feedback/config")).json()["types"]
    assert {t["destination"] for t in types} == {"store"}


async def test_config_needs_sign_in(client):
    assert (await client.get("/api/feedback/config")).status_code == 401


async def test_test_email_per_type(client, admin_auth, smtp):
    await _login(client, admin_auth)
    await _set_recipient(
        client,
        "default@example.com",
        problem=_route("email", "bugs@example.com"),
        question=_route("store"),
    )
    assert (await client.post("/api/admin/settings/test-email?route=problem")).status_code == 204
    assert (await client.post("/api/admin/settings/test-email?route=suggestion")).status_code == 204
    assert [m["To"] for m in smtp] == ["bugs@example.com", "default@example.com"]
    assert "Problem reports" in smtp[0].get_body(("plain",)).get_content()
    assert (await client.post("/api/admin/settings/test-email?route=question")).status_code == 409
    assert (await client.post("/api/admin/settings/test-email?route=nope")).status_code == 422
