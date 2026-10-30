"""Offline creates: the app may choose a new record's id (services/client_ids.py)."""

import uuid

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {"name": "Harbour Wall", "site_type": "bridge", "latitude": 51.5, "longitude": -0.12}


async def _login(client, admin_auth) -> None:
    response = await client.post("/api/auth/login", json=admin_auth)
    assert response.status_code == 200


async def test_offline_chain_uses_client_ids(client, admin_auth):
    """A site, survey and comment made offline, each pointing at the previous
    one's client-chosen id."""
    await _login(client, admin_auth)
    ids = {k: str(uuid.uuid4()) for k in ("site", "survey", "comment")}
    site = await client.post("/api/sites", json={**SITE, "id": ids["site"]})
    assert site.status_code == 201 and site.json()["id"] == ids["site"]
    survey = await client.post(
        "/api/surveys",
        json={
            "id": ids["survey"],
            "site_id": ids["site"],
            "surveyor": "A",
            "survey_date": "2026-09-01",
        },
    )
    assert survey.status_code == 201 and survey.json()["id"] == ids["survey"]
    comment = await client.post(
        "/api/comments",
        json={
            "id": ids["comment"],
            "entity": "survey",
            "entity_id": ids["survey"],
            "text": "Seen",
        },
    )
    assert comment.status_code == 201 and comment.json()["id"] == ids["comment"]


@pytest.mark.parametrize("kind", ["site", "survey", "comment"])
async def test_replayed_create_returns_the_saved_record(client, admin_auth, kind):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    url, body = {
        "site": ("/api/sites", {**SITE, "name": "Pier"}),
        "survey": (
            "/api/surveys",
            {"site_id": site["id"], "surveyor": "A", "survey_date": "2026-09-02"},
        ),
        "comment": ("/api/comments", {"entity": "site", "entity_id": site["id"], "text": "Hi"}),
    }[kind]
    body = {**body, "id": str(uuid.uuid4())}
    first = await client.post(url, json=body)
    again = await client.post(url, json=body)
    assert first.status_code == 201 and again.status_code == 201
    assert again.json()["id"] == first.json()["id"] == body["id"]
    listed = await client.get(
        url, params={"entity": "site", "entity_id": site["id"]} if kind == "comment" else {}
    )
    assert [row["id"] for row in listed.json()["items"]].count(body["id"]) == 1


async def test_id_of_another_record_type_is_a_conflict(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    response = await client.post(
        "/api/surveys",
        json={
            "id": site["id"],
            "site_id": site["id"],
            "surveyor": "A",
            "survey_date": "2026-09-01",
        },
    )
    assert response.status_code == 409


async def test_id_must_be_a_uuid(client, admin_auth):
    await _login(client, admin_auth)
    response = await client.post("/api/sites", json={**SITE, "id": "not-a-uuid"})
    assert response.status_code == 422


def test_every_route_commits_before_responding():
    """The outbox sends a new site and then its survey back to back; the
    survey must see the committed site. A session dependency in FastAPI's
    default "request" scope commits only after the response is sent."""
    from fastapi.routing import APIRoute

    from app.core.database import get_session
    from app.main import app

    def sessions(dependant):
        for dep in dependant.dependencies:
            if dep.call is get_session:
                yield dep
            yield from sessions(dep)

    found = [
        (route.path, dep.scope)
        for route in app.routes
        if isinstance(route, APIRoute)
        for dep in sessions(route.dependant)
    ]
    assert found, "no route takes a database session?"
    assert {scope for _, scope in found} == {"function"}, [f for f in found if f[1] != "function"]


async def test_replay_after_the_record_was_deleted_is_a_conflict(client, admin_auth):
    """A replayed create whose record has since gone to the recycle bin is
    answered 409 (not 201 with a trashed record no list shows), which the
    outbox can show the user."""
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    body = {
        "id": str(uuid.uuid4()),
        "site_id": site["id"],
        "surveyor": "A",
        "survey_date": "2026-09-01",
    }
    assert (await client.post("/api/surveys", json=body)).status_code == 201
    assert (await client.delete(f"/api/surveys/{body['id']}")).status_code == 204

    replay = await client.post("/api/surveys", json=body)
    assert replay.status_code == 409
    assert "deleted" in replay.json()["detail"]
    listed = (await client.get("/api/surveys")).json()["items"]
    assert body["id"] not in [row["id"] for row in listed]
