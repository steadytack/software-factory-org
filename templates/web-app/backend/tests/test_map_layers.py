"""Map layers: surveys (each site's latest survey, placed at the site)."""

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")


async def _site(client, admin_auth, name: str) -> dict:
    assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200
    site = await client.post(
        "/api/sites",
        json={"name": name, "site_type": "bridge", "latitude": 51.5, "longitude": -0.12},
    )
    assert site.status_code == 201, site.text
    return site.json()


async def _survey(client, site_id: str, when: str, status: str = "draft") -> dict:
    created = await client.post(
        "/api/surveys",
        json={"site_id": site_id, "surveyor": "A", "survey_date": when, "status": status},
    )
    assert created.status_code == 201, created.text
    return created.json()


async def test_surveys_show_each_sites_latest(client, admin_auth):
    site = await _site(client, admin_auth, "Map Surveys Site")
    await _survey(client, site["id"], "2026-08-01", "completed")
    latest = await _survey(client, site["id"], "2026-09-10", "draft")

    points = [
        p for p in (await client.get("/api/map/surveys")).json() if p["site_id"] == site["id"]
    ]
    assert len(points) == 1
    point = points[0]
    assert point["survey_id"] == latest["id"]
    assert point["status"] == "draft"
    assert point["survey_count"] == 2
    assert (point["latitude"], point["longitude"]) == (51.5, -0.12)

    # Deleting the latest falls back to the one before.
    assert (await client.delete(f"/api/surveys/{latest['id']}")).status_code == 204
    point = next(
        p for p in (await client.get("/api/map/surveys")).json() if p["site_id"] == site["id"]
    )
    assert point["status"] == "completed"
    assert point["survey_count"] == 1


async def test_map_layers_need_a_sign_in(client):
    assert (await client.get("/api/map/surveys")).status_code == 401
