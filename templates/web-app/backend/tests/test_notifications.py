"""Notification plumbing: the bell is per-user, system-generated through
`services.notification.notify()`, deduplicated by link, and object-level
authorised. (What is worth notifying about is project-specific; these tests
pin the generic behaviour a project builds on.)"""

import pytest
from sqlalchemy import func, select

from app.models.notification import Notification
from app.services.notification import TITLE_MAX_LENGTH, fit_title, normalize_recipient, notify
from tests.test_data_integrity import _act_as, _login

pytestmark = pytest.mark.usefixtures("db_engine")


async def _notify(db_session, recipient: str, link: str = "survey:1", **extra) -> bool:
    created = await notify(
        db_session, recipient=recipient, title="Survey due", link=link, url="/surveys", **extra
    )
    await db_session.commit()
    return created


async def _bell(client) -> dict:
    return (await client.get("/api/notifications")).json()


async def test_notify_shows_in_the_recipients_bell(client, admin_auth, db_session):
    await _login(client, admin_auth)
    assert await _notify(db_session, admin_auth["email"], body="Check the railings")
    bell = await _bell(client)
    assert bell["total"] == 1 and bell["unread"] == 1
    item = bell["items"][0]
    assert item["title"] == "Survey due"
    assert item["body"] == "Check the railings"
    assert item["url"] == "/surveys"


async def test_notify_is_deduplicated_per_recipient_and_link(client, admin_auth, db_session):
    await _login(client, admin_auth)
    assert await _notify(db_session, admin_auth["email"])
    assert not await _notify(db_session, admin_auth["email"])  # same link: no second one
    assert await _notify(db_session, admin_auth["email"], link="survey:2")
    assert (await _bell(client))["total"] == 2


async def test_notification_read_and_delete(client, admin_auth, db_session):
    await _login(client, admin_auth)
    await _notify(db_session, admin_auth["email"])
    created = (await _bell(client))["items"][0]
    marked = await client.post(f"/api/notifications/{created['id']}/read")
    assert marked.status_code == 200
    assert marked.json()["read"] is True
    assert (await client.delete(f"/api/notifications/{created['id']}")).status_code == 204

    # Delete is a deliberate re-arm: the same link can be notified again.
    assert await _notify(db_session, admin_auth["email"])


async def test_notification_dismiss_stays_dismissed(client, admin_auth, db_session):
    """Dismiss hides a notification for good: unlike DELETE (which re-arms),
    notify() must not re-create a dismissed one."""
    await _login(client, admin_auth)
    await _notify(db_session, admin_auth["email"])
    first = (await _bell(client))["items"][0]["id"]

    assert (await client.post(f"/api/notifications/{first}/dismiss")).status_code == 204
    assert all(n["id"] != first for n in (await _bell(client))["items"])
    assert not await _notify(db_session, admin_auth["email"])  # still deduped

    await _notify(db_session, admin_auth["email"], link="survey:2")
    assert (await client.post("/api/notifications/dismiss-all")).status_code == 204
    cleared = await _bell(client)
    assert cleared["items"] == []
    assert cleared["unread"] == 0


async def test_notifications_require_auth(client):
    assert (await client.get("/api/notifications")).status_code == 401


async def test_manual_notification_create_removed(client, admin_auth):
    """There is no manual-create endpoint — notifications are system-generated
    only. POST must not create a row (405: the path exists for GET)."""
    await _login(client, admin_auth)
    response = await client.post("/api/notifications", json={"title": "T", "body": None})
    assert response.status_code == 405


async def test_notification_object_level_authz(client, admin_auth, db_session):
    """A second authenticated user must NOT be able to see, mark-read, or
    delete another user's notification — enforced by the service ownership
    check and the user-scoped queries, not merely hidden in the UI."""
    await _login(client, admin_auth)
    await _notify(db_session, admin_auth["email"])
    admin_notif_id = (await _bell(client))["items"][0]["id"]

    created = await client.post(
        "/api/users", json={"email": "other@example.com", "password": "Other#User#12345"}
    )
    assert created.status_code == 201, created.text

    _act_as(client, "other@example.com")
    assert all(n["id"] != admin_notif_id for n in (await _bell(client))["items"])
    assert (await client.post(f"/api/notifications/{admin_notif_id}/read")).status_code == 404
    assert (await client.delete(f"/api/notifications/{admin_notif_id}")).status_code == 404
    client.headers.pop("cookie", None)


async def test_one_users_actions_do_not_touch_anothers_rows(client, admin_auth, db_session):
    """Two users notified for the same link each get their own row; one
    deleting theirs leaves the other's alone."""
    await _login(client, admin_auth)
    created = await client.post(
        "/api/users", json={"email": "second@example.com", "password": "Other#User#12345"}
    )
    assert created.status_code == 201, created.text
    assert await _notify(db_session, admin_auth["email"])
    assert await _notify(db_session, "second@example.com")

    mine = (await _bell(client))["items"][0]["id"]
    assert (await client.delete(f"/api/notifications/{mine}")).status_code == 204

    surviving = await db_session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_email == "second@example.com")
    )
    assert surviving == 1


async def test_recipient_matching_is_case_insensitive(client, admin_auth, db_session):
    """`user_email` is lower-cased on write; a token subject differing only in
    case must still see (and be able to act on) its own notifications."""
    assert normalize_recipient("  Admin@Example.COM ") == "admin@example.com"

    await _login(client, admin_auth)
    await _notify(db_session, admin_auth["email"].upper())
    notif_id = (await _bell(client))["items"][0]["id"]

    _act_as(client, admin_auth["email"].upper())
    assert any(n["id"] == notif_id for n in (await _bell(client))["items"])
    assert (await client.post(f"/api/notifications/{notif_id}/read")).status_code == 200
    client.headers.pop("cookie", None)


def test_title_always_fits_the_column():
    long_title = "Survey due: " + "x" * 500
    fitted = fit_title(long_title)
    assert len(fitted) == TITLE_MAX_LENGTH
    assert fitted.endswith("…")
    assert fit_title("short") == "short"
