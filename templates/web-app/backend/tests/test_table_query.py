"""A managed table in server mode: the survey list's sort, filters and CSV (core/table_query.py).

Proven in an app built from this template, and made generic."""

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {
    "name": "Harbour Wall",
    "site_type": "bridge",
    "status": "active",
    "latitude": 51.5,
    "longitude": -0.12,
}
OTHER = {**SITE, "name": "Old Mill"}


async def _login(client, admin_auth) -> None:
    assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200


async def _seed(client) -> None:
    harbour = (await client.post("/api/sites", json=SITE)).json()["id"]
    mill = (await client.post("/api/sites", json=OTHER)).json()["id"]
    for site_id, surveyor, day, status in (
        (harbour, "Ann", "2026-09-01", "draft"),
        (harbour, "Bob", "2026-09-10", "completed"),
        (mill, "Cat", "2026-09-20", "completed"),
    ):
        body = {"site_id": site_id, "surveyor": surveyor, "survey_date": day, "status": status}
        assert (await client.post("/api/surveys", json=body)).status_code == 201


async def _list(client, **params) -> list[str]:
    response = await client.get("/api/surveys", params=params)
    assert response.status_code == 200, response.text
    return [s["surveyor"] for s in response.json()["items"]]


async def test_sorts_by_an_allowed_field_either_way(client, admin_auth):
    await _login(client, admin_auth)
    await _seed(client)
    assert await _list(client, sort="surveyor:asc") == ["Ann", "Bob", "Cat"]
    assert await _list(client, sort="surveyor:desc") == ["Cat", "Bob", "Ann"]
    # by the site's name, which is not a column of the survey
    assert (await _list(client, sort="site_name:desc"))[0] == "Cat"


async def test_filters_by_value_text_and_date_together(client, admin_auth):
    await _login(client, admin_auth)
    await _seed(client)
    assert sorted(await _list(client, where="status:is:completed")) == ["Bob", "Cat"]
    assert await _list(client, where="status:is_not:completed") == ["Ann"]
    assert sorted(await _list(client, where="site_name:contains:harb")) == ["Ann", "Bob"]
    # a bare date is the whole day, both ends inclusive
    assert sorted(await _list(client, where=["survey_date:after:2026-09-10"])) == ["Bob", "Cat"]
    assert await _list(client, where=["survey_date:before:2026-09-01"]) == ["Ann"]
    # several filters are all required
    both = await _list(client, where=["status:is:completed", "site_name:equals:harbour wall"])
    assert both == ["Bob"]
    # the total counts every match, not the page
    response = await client.get("/api/surveys", params={"where": "status:is:completed", "limit": 1})
    assert response.json()["total"] == 2


async def test_refuses_what_the_list_does_not_allow(client, admin_auth):
    await _login(client, admin_auth)
    for params in (
        {"sort": "password:asc"},
        {"sort": "surveyor:sideways"},
        {"where": "password:contains:x"},
        {"where": "status:contains:draft"},
        {"where": "survey_date:after:not-a-date"},
    ):
        response = await client.get("/api/surveys", params=params)
        assert response.status_code == 422, params


async def test_a_text_filter_is_text_not_a_pattern(client, admin_auth):
    await _login(client, admin_auth)
    await _seed(client)
    assert await _list(client, where="surveyor:contains:%") == []
    assert await _list(client, where="surveyor:contains:_") == []


async def test_csv_is_every_match_in_the_tables_order(client, admin_auth):
    await _login(client, admin_auth)
    await _seed(client)
    response = await client.get(
        "/api/surveys.csv", params={"sort": "surveyor:desc", "where": "status:is:completed"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    lines = response.text.lstrip("﻿").splitlines()
    assert lines[0].startswith("Date,Site,Surveyor")
    assert [line.split(",")[2] for line in lines[1:]] == ["Cat", "Bob"]


async def test_csv_needs_a_signed_in_person(client):
    assert (await client.get("/api/surveys.csv")).status_code == 401
