"""'Today' is the UK calendar date (APP_TIMEZONE), not the UTC one.

Between midnight and 1 am during BST the two differ; a survey dated today
used to fall outside "this week" for that hour."""

from datetime import UTC, datetime

import pytest

from app.core import time as app_time

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {"name": "Clock Site", "site_type": "bridge", "latitude": 51.5, "longitude": -0.12}


def _freeze(monkeypatch, instant: datetime) -> None:
    class Frozen(datetime):
        @classmethod
        def now(cls, tz=None):
            return instant.astimezone(tz) if tz else instant.replace(tzinfo=None)

    monkeypatch.setattr(app_time, "datetime", Frozen)


def test_local_today_follows_bst(monkeypatch):
    # 23:30 UTC on 1 July is 00:30 BST on 2 July.
    _freeze(monkeypatch, datetime(2026, 7, 1, 23, 30, tzinfo=UTC))
    assert app_time.local_today().isoformat() == "2026-07-02"


def test_local_today_in_winter_is_utc_date(monkeypatch):
    # GMT = UTC in winter.
    _freeze(monkeypatch, datetime(2026, 1, 15, 23, 30, tzinfo=UTC))
    assert app_time.local_today().isoformat() == "2026-01-15"


async def test_dashboard_week_uses_the_uk_date(client, admin_auth, monkeypatch):
    assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200
    site = (await client.post("/api/sites", json=SITE)).json()
    for when in ("2026-07-02", "2026-07-03"):
        created = await client.post(
            "/api/surveys",
            json={"site_id": site["id"], "surveyor": "A", "survey_date": when},
        )
        assert created.status_code == 201

    # 00:30 BST on 2 July (still 1 July in UTC).
    _freeze(monkeypatch, datetime(2026, 7, 1, 23, 30, tzinfo=UTC))

    stats = (await client.get("/api/stats/dashboard")).json()
    # A survey dated today (UK) counts; tomorrow's is scheduled, not yet "this week".
    assert stats["surveys_this_week"] == 1
    assert stats["surveys_per_day"]["2026-07-02"] == 1
    assert "2026-07-03" not in stats["surveys_per_day"]


def test_unknown_timezone_refuses_to_start():
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            admin_email="a@example.com",
            admin_password="A-perfectly-fine-one-42",
            jwt_secret="k" * 48,
            database_url="postgresql+asyncpg://u:p@h/d",
            app_timezone="Mars/Olympus_Mons",
        )
