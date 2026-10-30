"""Surveys: cross-site context on reads, free-text search, and missing-parent
handling for the Surveys page."""

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {
    "name": "Harbour Wall",
    "site_type": "bridge",
    "status": "active",
    "latitude": 51.5,
    "longitude": -0.12,
}


async def _login(client, admin_auth) -> None:
    response = await client.post("/api/auth/login", json=admin_auth)
    assert response.status_code == 200


async def _survey(client, site_id: str, **extra) -> dict:
    body = {"site_id": site_id, "surveyor": "A. Surveyor", "survey_date": "2026-09-01", **extra}
    response = await client.post("/api/surveys", json=body)
    assert response.status_code == 201
    return response.json()


async def test_reads_carry_site_context(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    survey = await _survey(client, site["id"])
    assert survey["site_name"] == "Harbour Wall"

    listed = (await client.get("/api/surveys", params={"site_id": site["id"]})).json()["items"][0]
    assert listed["site_name"] == "Harbour Wall"
    assert listed["survey_date"] == "2026-09-01"

    patched = await client.patch(f"/api/surveys/{survey['id']}", json={"summary": "Re-checked"})
    assert patched.status_code == 200
    # Context survives an update response too.
    assert patched.json()["site_name"] == "Harbour Wall"


async def test_survey_for_missing_site_is_404(client, admin_auth):
    await _login(client, admin_auth)
    response = await client.post(
        "/api/surveys",
        json={
            "site_id": "00000000-0000-0000-0000-000000000000",
            "surveyor": "A. Surveyor",
            "survey_date": "2026-09-01",
        },
    )
    assert response.status_code == 404


async def test_q_searches_text_and_site_name(client, admin_auth):
    await _login(client, admin_auth)
    site = (await client.post("/api/sites", json=SITE)).json()
    other = (await client.post("/api/sites", json={**SITE, "name": "Mill Lane"})).json()
    s1 = await _survey(client, site["id"], surveyor="Jo Bloggs", summary="Annual check")
    s2 = await _survey(client, other["id"], surveyor="Sam Smith", summary="Drain at 50% capacity")

    async def surveys(q: str) -> set[str]:
        items = (await client.get("/api/surveys", params={"q": q})).json()["items"]
        return {i["id"] for i in items}

    assert await surveys("bloggs") == {s1["id"]}
    assert await surveys("ANNUAL") == {s1["id"]}
    assert await surveys("mill") == {s2["id"]}
    # LIKE wildcards are literal: "%" matches only the text containing it.
    assert await surveys("50%") == {s2["id"]}
    assert await surveys("_") == set()
