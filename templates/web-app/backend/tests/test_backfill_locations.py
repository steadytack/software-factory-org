"""Location backfill: fills empty postcodes/addresses from the pin, keeps
existing addresses unless asked, and writes nothing on a dry run."""

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.backfill_locations import ACTOR, apply_changes, plan_changes, short_address

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {
    "name": "Pier",
    "site_type": "bridge",
    "status": "active",
    "latitude": 51.5,
    "longitude": -0.12,
}


async def fake_fetch(method, url, body):
    if method == "POST":  # postcodes.io bulk reverse
        return {"result": [{"result": [{"postcode": "se12up"}]} for _ in body["geolocations"]]}
    return {"address": {"house_number": "4", "road": "Tooley Street", "city": "London"}}


async def _login(client, admin_auth) -> None:
    assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200


def _session(db_connection):
    return async_sessionmaker(
        bind=db_connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )()


def test_short_address_matches_frontend_shape():
    assert short_address(
        {"house_number": "1", "road": "High St", "suburb": "Bow", "city": "London"}
    ) == ("1 High St, Bow, London")
    assert short_address({"road": "Lane", "county": "Kent"}) == "Lane, Kent"
    assert short_address({}) == ""


async def test_fills_empty_fields_and_keeps_existing_address(client, admin_auth, db_connection):
    await _login(client, admin_auth)
    blank = (await client.post("/api/sites", json=SITE)).json()
    kept = (
        await client.post("/api/sites", json={**SITE, "name": "Quay", "address": "My words"})
    ).json()

    async with _session(db_connection) as session:
        changes = await plan_changes(session, fetch=fake_fetch, throttle=0)
        by_name = {c.name: c.fields for c in changes}
        # Normalised like the API does it.
        assert by_name["Pier"] == {"address": "4 Tooley Street, London", "postcode": "SE1 2UP"}
        assert by_name["Quay"] == {"postcode": "SE1 2UP"}

        # Dry run: nothing written yet.
        assert (await client.get(f"/api/sites/{blank['id']}")).json()["postcode"] is None

        assert await apply_changes(session, changes) == 2

    after = (await client.get(f"/api/sites/{blank['id']}")).json()
    assert after["postcode"] == "SE1 2UP"
    assert after["address"] == "4 Tooley Street, London"
    assert (await client.get(f"/api/sites/{kept['id']}")).json()["address"] == "My words"

    log = (
        await client.get("/api/changelog", params={"entity": "site", "entity_id": blank["id"]})
    ).json()
    assert any(e["actor"] == ACTOR for e in log["items"])


async def test_overwrite_addresses_flag(client, admin_auth, db_connection):
    await _login(client, admin_auth)
    await client.post("/api/sites", json={**SITE, "address": "Old", "postcode": "E1 6AN"})
    async with _session(db_connection) as session:
        assert await plan_changes(session, fetch=fake_fetch, throttle=0) == []
        changes = await plan_changes(
            session, fetch=fake_fetch, throttle=0, overwrite_addresses=True
        )
    # Address replaced; an existing postcode is never touched.
    assert [c.fields for c in changes] == [{"address": "4 Tooley Street, London"}]
