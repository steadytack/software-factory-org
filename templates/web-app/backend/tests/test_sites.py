import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {
    "name": "Test Bridge",
    "site_type": "bridge",
    "status": "active",
    "address": "1 Test Rd",
    "notes": "Test notes",
    "latitude": 51.5,
    "longitude": -0.12,
}


async def _login(client, admin_auth) -> None:
    response = await client.post("/api/auth/login", json=admin_auth)
    assert response.status_code == 200


async def test_create_requires_admin(client):
    response = await client.post("/api/sites", json=SITE)
    assert response.status_code == 401


async def test_create_and_get_site(client, admin_auth):
    await _login(client, admin_auth)
    created = await client.post("/api/sites", json=SITE)
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == SITE["name"]
    assert body["latitude"] == SITE["latitude"]

    fetched = await client.get(f"/api/sites/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]


async def test_list_includes_created(client, admin_auth):
    await _login(client, admin_auth)
    await client.post("/api/sites", json=SITE)
    listing = await client.get("/api/sites")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1


async def test_validation_rejects_bad_latitude(client, admin_auth):
    await _login(client, admin_auth)
    bad = {**SITE, "latitude": 999}
    response = await client.post("/api/sites", json=bad)
    assert response.status_code == 422


async def test_update_partial(client, admin_auth):
    await _login(client, admin_auth)
    created = (await client.post("/api/sites", json=SITE)).json()
    updated = await client.patch(f"/api/sites/{created['id']}", json={"name": "Renamed"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"
    assert updated.json()["latitude"] == SITE["latitude"]


async def test_delete_then_404(client, admin_auth):
    await _login(client, admin_auth)
    created = (await client.post("/api/sites", json=SITE)).json()
    deleted = await client.delete(f"/api/sites/{created['id']}")
    assert deleted.status_code == 204
    missing = await client.get(f"/api/sites/{created['id']}")
    assert missing.status_code == 404


async def test_get_unknown_site_404(client, admin_auth):
    """Reads require auth; an authenticated caller gets 404 for an
    unknown id."""
    await _login(client, admin_auth)
    response = await client.get("/api/sites/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


async def test_get_site_requires_auth(client):
    """Anonymous read is 401."""
    response = await client.get("/api/sites/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 401


async def test_survey_chain(client, admin_auth):
    """Hierarchy: site → survey, with cascade delete."""
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    survey = (
        await client.post(
            "/api/surveys",
            json={
                "site_id": site["id"],
                "surveyor": "A. Surveyor",
                "survey_date": "2026-09-09",
                "status": "completed",
            },
        )
    ).json()

    # Filtered listings resolve the chain
    surveys = (await client.get(f"/api/surveys?site_id={site['id']}")).json()
    assert surveys["total"] == 1

    # Cascade: deleting the site removes everything below it
    deleted = await client.delete(f"/api/sites/{site['id']}")
    assert deleted.status_code == 204
    assert (await client.get(f"/api/surveys/{survey['id']}")).status_code == 404


async def test_changelog_records_crud(client, admin_auth):
    """Services write audit-trail entries for create/update/delete."""
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()

    await client.patch(f"/api/sites/{site['id']}", json={"name": "Renamed Site"})
    await client.delete(f"/api/sites/{site['id']}")

    log = (await client.get(f"/api/changelog?entity=site&entity_id={site['id']}")).json()
    actions = [e["action"] for e in log["items"]]
    assert actions == ["deleted", "updated", "created"]  # newest first
    assert log["total"] == 3
    assert all(e["actor"] == admin_auth["email"] for e in log["items"])
    assert "Renamed Site" in log["items"][0]["summary"]  # delete entry names the site


async def test_site_postcode_normalised_and_updatable(client, admin_auth):
    await _login(client, admin_auth)
    created = await client.post(
        "/api/sites", json={**SITE, "name": "Postcode Site", "postcode": " se1  2up "}
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["postcode"] == "SE1 2UP"

    updated = await client.patch(f"/api/sites/{body['id']}", json={"postcode": "ip124ur"})
    assert updated.status_code == 200
    assert updated.json()["postcode"] == "IP12 4UR"

    cleared = await client.patch(f"/api/sites/{body['id']}", json={"postcode": None})
    assert cleared.json()["postcode"] is None


async def test_geo_returns_every_site_and_filters(client, admin_auth):
    """The map, search and pickers read /sites/geo: every site in one
    response (the list endpoint pages at 200), with bbox and q filters."""
    await _login(client, admin_auth)
    for i in range(205):
        body = {**SITE, "name": f"Bulk {i:03}", "longitude": -0.12 + i * 0.001}
        assert (await client.post("/api/sites", json=body)).status_code == 201
    await client.post(
        "/api/sites",
        json={
            **SITE,
            "name": "Far Away",
            "latitude": 55.9,
            "longitude": -3.2,
            "postcode": "EH1 1AA",
        },
    )

    geo = (await client.get("/api/sites/geo")).json()
    assert geo["total"] == 206
    assert geo["complete"] is True
    assert len(geo["items"]) == 206
    first = geo["items"][0]
    assert set(first) >= {"id", "name", "latitude", "longitude", "status", "site_type"}

    london = (await client.get("/api/sites/geo", params={"bbox": "-1,51,1,52"})).json()
    assert london["total"] == 205
    assert (await client.get("/api/sites/geo", params={"q": "eh1"})).json()["total"] == 1
    assert (await client.get("/api/sites", params={"q": "far"})).json()["total"] == 1
    bad = await client.get("/api/sites/geo", params={"bbox": "nonsense"})
    assert bad.status_code == 422
