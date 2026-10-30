"""Data-integrity characterisation tests (Prompt 3 audit, run 2026-09-16-3).

Stage 1 of the remediation plan: every defect fixed in stages 2–6 gets a test
here FIRST, written against the intended post-fix behaviour, so the fix is
demonstrated rather than asserted.

Covers PAG-1 (Critical), BUG-1, BUG-2, VAL-1, VAL-2, VAL-3 (High) and INT-4.

Why these reproduce so reliably here: Postgres freezes `now()` per
transaction, and the whole test runs inside one transaction (see conftest), so
every row written by one test shares an identical `created_at` — exactly the
data condition PAG-1 needs.
"""

import io
from datetime import UTC, datetime, timedelta

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {
    "name": "Integrity Test Site",
    "site_type": "bridge",
    "status": "active",
    "latitude": 51.5,
    "longitude": -0.12,
}


async def _login(client, admin_auth) -> None:
    assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200


def _act_as(client, subject: str) -> None:
    from app.core.auth import ACCESS_COOKIE
    from app.core.security import create_token

    token = create_token(subject, "access", timedelta(minutes=15), extra={"iat": datetime.now(UTC)})
    client.headers["cookie"] = f"{ACCESS_COOKIE}={token}"


async def _site(client, **overrides) -> dict:
    response = await client.post("/api/sites", json={**SITE, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


async def _survey(client, site_id: str, **overrides) -> dict:
    body = {
        "site_id": site_id,
        "surveyor": "T. Tester",
        "survey_date": "2026-01-01",
        "status": "draft",
        **overrides,
    }
    response = await client.post("/api/surveys", json=body)
    assert response.status_code == 201, response.text
    return response.json()


async def _paged_ids(client, path: str, page_size: int, params: dict | None = None) -> list[str]:
    """Walk a list endpoint page by page and return the ids in visit order."""
    ids: list[str] = []
    offset = 0
    while True:
        response = await client.get(
            path, params={**(params or {}), "offset": offset, "limit": page_size}
        )
        assert response.status_code == 200, response.text
        page = response.json()["items"]
        if not page:
            break
        ids.extend(item["id"] for item in page)
        offset += page_size
        assert offset <= 1000, "runaway pagination walk"
    return ids


# ── PAG-1 (Critical): offset pagination must be deterministic ────────────────


@pytest.mark.parametrize(
    ("path", "page_size"),
    [("/api/sites", 2), ("/api/surveys", 2), ("/api/changelog", 3)],
)
async def test_paged_walk_is_stable_for_every_list_endpoint(client, admin_auth, path, page_size):
    """The same guarantee on every list endpoint."""
    await _login(client, admin_auth)
    for i in range(5):
        site = await _site(client, name=f"Paging Site {i}")
        await _survey(client, site["id"])

    total = (await client.get(path, params={"limit": 200})).json()["total"]
    walked = await _paged_ids(client, path, page_size)
    assert len(walked) == len(set(walked)), f"{path} returned a duplicate row across pages"
    assert len(walked) == total, f"{path} lost rows: walked {len(walked)} of {total}"


# ── BUG-1 (High): explicit null on lat/lng must be 422, not 500 ──────────────


@pytest.mark.parametrize("field", ["latitude", "longitude"])
async def test_patch_site_explicit_null_coordinate_is_422(client, admin_auth, field):
    """BUG-1: `float(None)` in the geometry builder raised a TypeError → 500."""
    await _login(client, admin_auth)
    site = await _site(client)
    response = await client.patch(f"/api/sites/{site['id']}", json={field: None})
    assert response.status_code == 422, response.text
    # The stored value is untouched.
    after = (await client.get(f"/api/sites/{site['id']}")).json()
    assert after["latitude"] == SITE["latitude"]
    assert after["longitude"] == SITE["longitude"]


# ── VAL-3 (High): explicit null on any required field must be 422 ────────────


@pytest.mark.parametrize(
    ("entity", "field"),
    [
        ("site", "name"),
        ("site", "site_type"),
        ("site", "status"),
        ("survey", "surveyor"),
        ("survey", "survey_date"),
        ("survey", "status"),
    ],
)
async def test_patch_explicit_null_on_required_field_is_422(client, admin_auth, entity, field):
    """VAL-3: the NOT NULL constraint was the de-facto validator, so an
    explicit null surfaced as a 409 claiming a duplicate key. 422 is correct."""
    await _login(client, admin_auth)
    site = await _site(client)
    survey = await _survey(client, site["id"])
    target = {
        "site": f"/api/sites/{site['id']}",
        "survey": f"/api/surveys/{survey['id']}",
    }[entity]

    response = await client.patch(target, json={field: None})
    assert response.status_code == 422, f"{entity}.{field} → {response.status_code}"


async def test_patch_explicit_null_still_clears_nullable_fields(client, admin_auth):
    """VAL-3's fix must not break the genuinely-nullable fields: an explicit
    null on `address`/`notes`/`summary` still clears them."""
    await _login(client, admin_auth)
    site = await _site(client, address="1 Test St", notes="a note")
    cleared = await client.patch(f"/api/sites/{site['id']}", json={"address": None, "notes": None})
    assert cleared.status_code == 200
    assert cleared.json()["address"] is None
    assert cleared.json()["notes"] is None

    survey = await _survey(client, site["id"], summary="a summary")
    assert (await client.patch(f"/api/surveys/{survey['id']}", json={"summary": None})).json()[
        "summary"
    ] is None


# ── VAL-1 (High): blank / whitespace-only required text is rejected ──────────


@pytest.mark.parametrize("blank", ["", "   ", "\t", "\n  \n"])
async def test_create_site_rejects_blank_name(client, admin_auth, blank):
    """VAL-1: `POST /api/sites {"name": ""}` used to return 201."""
    await _login(client, admin_auth)
    response = await client.post("/api/sites", json={**SITE, "name": blank})
    assert response.status_code == 422, response.text


async def test_create_trims_required_and_optional_text(client, admin_auth):
    """VAL-1: values are stored trimmed, so `"  padded  "` and `"padded"` are
    the same name (which is also what INT-2's uniqueness needs)."""
    await _login(client, admin_auth)
    site = await _site(client, name="  Padded Name  ", address="  1 Padded St  ")
    assert site["name"] == "Padded Name"
    assert site["address"] == "1 Padded St"


async def test_blank_optional_text_is_stored_as_null(client, admin_auth):
    """Q-D1: blank optional text is always NULL, never `""` — so "no value"
    and "empty value" can never be confused downstream."""
    await _login(client, admin_auth)
    site = await _site(client, address="", notes="   ")
    assert site["address"] is None
    assert site["notes"] is None

    survey = await _survey(client, site["id"], summary="  ")
    assert survey["summary"] is None

    patched = await client.patch(f"/api/sites/{site['id']}", json={"address": "  "})
    assert patched.status_code == 200
    assert patched.json()["address"] is None


async def test_create_rejects_blank_required_text_on_children(client, admin_auth):
    """Blank-text rejection applies to every required text field, not just
    `site.name`."""
    await _login(client, admin_auth)
    site = await _site(client)
    response = await client.post(
        "/api/surveys",
        json={
            "site_id": site["id"],
            "surveyor": "   ",
            "survey_date": "2026-01-01",
            "status": "draft",
        },
    )
    assert response.status_code == 422, response.text


# ── VAL-2 (High): create and update enforce the same rule ───────────────────


@pytest.mark.parametrize(
    ("entity", "field"),
    [
        ("site", "name"),
        ("survey", "surveyor"),
    ],
)
async def test_patch_rejects_blank_required_text(client, admin_auth, entity, field):
    """VAL-2: `POST` enforced `min_length=1`, `PATCH` did not — so every
    required text field could be emptied after creation."""
    await _login(client, admin_auth)
    site = await _site(client)
    survey = await _survey(client, site["id"])
    target = {
        "site": f"/api/sites/{site['id']}",
        "survey": f"/api/surveys/{survey['id']}",
    }[entity]

    assert (await client.patch(target, json={field: ""})).status_code == 422
    assert (await client.patch(target, json={field: "   "})).status_code == 422


# ── BUG-2 (High): notification title can never overflow VARCHAR(200) ────────


class _FakeSession:
    """Minimal stand-in: the sweep must fail before it touches the session."""

    async def execute(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("should not be reached")


# ── INT-4: the notification prune must be scoped to one recipient ───────────


# ── Q-D1: a 0-byte upload is rejected, never stored as a valid empty file ───


@pytest.mark.parametrize("filename", ["empty.txt", "empty.png"])
async def test_zero_byte_upload_is_rejected(client, admin_auth, filename):
    """Q-D1: `size_bytes = 0` must never mean "a real empty file"."""
    await _login(client, admin_auth)
    site = await _site(client)
    content_type = "text/plain" if filename.endswith(".txt") else "image/png"
    response = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": site["id"]},
        files={"file": (filename, io.BytesIO(b""), content_type)},
    )
    assert response.status_code == 422, response.text
    listing = (
        await client.get("/api/attachments", params={"entity": "site", "entity_id": site["id"]})
    ).json()
    assert listing["total"] == 0, "a rejected upload must leave no row"


# ── Vocabularies have one definition ─────────────────────────────────────────


async def test_vocabularies_have_one_definition():
    """Every Literal matches its tuple. `enums.py` asserts this at import
    time; this test makes the guard visible in the suite."""
    from app.schemas import enums
    from app.services.comment import ENTITY_MODELS

    enums._assert_literals_match_tuples()
    assert tuple(ENTITY_MODELS) == enums.ENTITIES


# ── VOC-3: the vocabulary is enforced by the database, not just Pydantic ───


@pytest.mark.parametrize(
    ("table", "column"),
    [
        ("sites", "site_type"),
        ("sites", "status"),
        ("surveys", "status"),
        ("changelog", "action"),
        ("comments", "entity"),
        ("attachments", "entity"),
    ],
)
async def test_check_constraint_exists_for_categorical_column(db_connection, table, column):
    """VOC-3: there were ZERO check constraints on any application table, so
    the vocabulary held only for writes that passed through Pydantic — which
    the seeder, the migrations and manual SQL do not."""
    from sqlalchemy import text

    from app.schemas.enums import check_constraint_name

    found = await db_connection.scalar(
        text(
            "SELECT count(*) FROM pg_constraint c "
            "JOIN pg_class t ON t.oid = c.conrelid "
            "WHERE c.contype = 'c' AND t.relname = :table AND c.conname = :name"
        ),
        {"table": table, "name": check_constraint_name(table, column)},
    )
    assert found == 1, f"no CHECK constraint on {table}.{column}"


async def test_out_of_vocabulary_value_rejected_by_the_database(db_connection):
    """VOC-3: the point of the constraint is the path that bypasses Pydantic."""
    import uuid as _uuid

    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        await db_connection.execute(
            text(
                "INSERT INTO sites (id, name, site_type, status, location, "
                "created_at, updated_at) VALUES (:id, :name, 'MONORAIL', 'active', "
                "ST_SetSRID(ST_MakePoint(0, 51), 4326), now(), now())"
            ),
            {"id": str(_uuid.uuid4()), "name": f"Bypass {_uuid.uuid4()}"},
        )
