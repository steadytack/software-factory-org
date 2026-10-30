"""Data-integrity tests for filters, sorts, counts and display (stage 5).

Split from `test_data_integrity.py` to keep each file readable: that one holds
the Critical/High defects (pagination, validation, the 500s), this one holds
the query-surface behaviour: dashboard windows, changelog and list filters, and
declared display order.
"""

from datetime import UTC, datetime, timedelta

import pytest

from tests.test_data_integrity import _login, _site, _survey

pytestmark = pytest.mark.usefixtures("db_engine")


# ── FLT-1: the dashboard KPI is bounded, the data is not ─────────────


async def test_future_dated_survey_does_not_inflate_the_weekly_kpi(client, admin_auth):
    """FLT-1: `surveys_this_week` had a lower bound only, so a future-dated
    survey inflated the KPI and the week-over-week delta while the (bounded)
    `surveys_per_day` chart silently disagreed.

    the *data* stays unbounded — a future `survey_date` is still
    accepted, it just does not count as "this week" until that week arrives.
    """
    await _login(client, admin_auth)
    site = await _site(client)
    today = datetime.now(UTC).date()

    before = (await client.get("/api/stats/dashboard")).json()
    future = await _survey(client, site["id"], survey_date=str(today + timedelta(days=400)))
    assert future["survey_date"] == str(today + timedelta(days=400))

    after = (await client.get("/api/stats/dashboard")).json()
    assert after["surveys_this_week"] == before["surveys_this_week"]
    assert sum(after["surveys_per_day"].values()) == after["surveys_this_week"], (
        "the KPI and the chart must agree — they are now the same window"
    )

    await _survey(client, site["id"], survey_date=str(today))
    counted = (await client.get("/api/stats/dashboard")).json()
    assert counted["surveys_this_week"] == before["surveys_this_week"] + 1


# ── DSP-2: categorical output has a declared order ─────────────────────────


async def test_surveys_by_status_uses_the_declared_vocabulary_order(client, admin_auth):
    """The chart used to render in Postgres `GROUP BY` order, so bars could
    reorder between two refreshes of the same data."""
    from app.schemas.enums import SURVEY_STATUSES

    await _login(client, admin_auth)
    site = await _site(client)
    await _survey(client, site["id"], status="completed")
    await _survey(client, site["id"], status="completed")

    stats = (await client.get("/api/stats/dashboard")).json()
    assert list(stats["surveys_by_status"]) == list(SURVEY_STATUSES)
    # Every vocabulary value is present with an explicit zero, so the chart
    # has a stable axis rather than a gap.
    assert stats["surveys_by_status"]["completed"] == 2
    assert stats["surveys_by_status"]["draft"] == stats["draft_surveys"] == 0


# ── FLT-2: accepted-and-ignored changelog filters ──────────────────────────


async def test_changelog_empty_filter_does_not_widen_the_query(client, admin_auth):
    """FLT-2: `?entity=` used a falsy test, so an empty-string filter returned
    the *unfiltered* set rather than an empty one or a 422."""
    await _login(client, admin_auth)
    await _site(client)

    assert (await client.get("/api/changelog")).json()["total"] >= 1
    assert (await client.get("/api/changelog", params={"entity": ""})).status_code == 422
    assert (await client.get("/api/changelog", params={"entity": "bogus"})).status_code == 422
    assert (
        await client.get("/api/changelog", params={"entity_id": "not-a-uuid"})
    ).status_code == 422
    assert (await client.get("/api/changelog", params={"entity": "site"})).status_code == 200


async def test_changelog_entity_filter_still_works(client, admin_auth):
    """FLT-2 regression guard: the filter that *did* work keeps working,
    including for a deleted subject (the changelog is deliberately FK-free, so
    it must still answer for records that no longer exist)."""
    await _login(client, admin_auth)
    site = await _site(client)
    assert (await client.delete(f"/api/sites/{site['id']}")).status_code == 204

    entries = (
        await client.get("/api/changelog", params={"entity": "site", "entity_id": site["id"]})
    ).json()
    assert {"created", "deleted"} <= {e["action"] for e in entries["items"]}


# ── FLT-7: the filters that did not exist ──────────────────────────────────


async def test_surveys_status_and_date_range_filters(client, admin_auth):
    """FLT-7: `status` and a `survey_date` range had no server-side filter."""
    await _login(client, admin_auth)
    site = await _site(client)
    await _survey(client, site["id"], survey_date="2026-01-01", status="draft")
    await _survey(client, site["id"], survey_date="2026-05-01", status="completed")

    async def total(**params) -> int:
        response = await client.get("/api/surveys", params=params)
        assert response.status_code == 200, response.text
        return response.json()["total"]

    assert await total(status="draft") == 1
    assert await total(date_from="2026-03-01") == 1
    assert await total(date_to="2026-03-01") == 1
    assert await total(date_from="2026-01-01", date_to="2026-12-31") == 2


async def test_sites_type_and_status_filters(client, admin_auth):
    """FLT-7: the sites list had no server-side filter beyond pagination."""
    await _login(client, admin_auth)
    await _site(client, name="Filter Bridge", site_type="bridge", status="active")
    await _site(client, name="Filter Outfall", site_type="outfall", status="archived")

    async def total(**params) -> int:
        response = await client.get("/api/sites", params=params)
        assert response.status_code == 200, response.text
        return response.json()["total"]

    assert await total(site_type="bridge") == 1
    assert await total(status="archived") == 1
    assert await total(site_type="bridge", status="archived") == 0
    assert (await client.get("/api/sites", params={"site_type": "monorail"})).status_code == 422
