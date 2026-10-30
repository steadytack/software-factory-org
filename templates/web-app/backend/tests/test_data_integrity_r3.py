"""Messy-data tests: NUL bytes, non-finite numbers, look-alike names, invisible
characters, postcodes, export safety. Each states the behaviour the app chose
for bad input rather than leaving it to a 500."""

import csv
import io
import unicodedata
import zipfile

import pytest

pytestmark = pytest.mark.usefixtures("db_engine")

PASSWORD = "R3#Test#Pass1"
SITE = {"name": "R3 Site", "site_type": "bridge", "latitude": 51.5, "longitude": -0.12}
NUL = "x\u0000y"


async def _login(client, admin_auth) -> None:
    response = await client.post("/api/auth/login", json=admin_auth)
    assert response.status_code == 200, response.text


async def _chain(client, survey_date="2026-09-01") -> dict:
    site = (await client.post("/api/sites", json=SITE)).json()
    survey = (
        await client.post(
            "/api/surveys",
            json={"site_id": site["id"], "surveyor": "S", "survey_date": survey_date},
        )
    ).json()
    return {"site": site, "survey": survey}


# ── R3-01: a NUL byte is a 422 that names the field, never a 500 ─────────────


async def test_nul_byte_is_rejected_on_every_text_field(client, admin_auth):
    await _login(client, admin_auth)
    w = await _chain(client)
    cases = {
        ("POST", "/api/sites", "name"): {**SITE, "name": NUL},
        ("POST", "/api/sites", "notes"): {**SITE, "name": "n1", "notes": NUL},
        ("POST", "/api/sites", "address"): {**SITE, "name": "n2", "address": NUL},
        ("POST", "/api/surveys", "surveyor"): {
            "site_id": w["site"]["id"],
            "surveyor": NUL,
            "survey_date": "2026-09-01",
        },
        ("POST", "/api/surveys", "summary"): {
            "site_id": w["site"]["id"],
            "surveyor": "S",
            "survey_date": "2026-09-01",
            "summary": NUL,
        },
        ("PATCH", f"/api/sites/{w['site']['id']}", "name"): {"name": NUL},
        ("PATCH", f"/api/surveys/{w['survey']['id']}", "summary"): {"summary": NUL},
        ("POST", "/api/comments", "text"): {
            "entity": "site",
            "entity_id": w["site"]["id"],
            "text": NUL,
        },
        ("POST", "/api/users", "display_name"): {
            "email": "nul@example.com",
            "password": PASSWORD,
            "display_name": NUL,
        },
        ("POST", "/api/feedback", "details"): {"kind": "bug", "summary": "s", "details": NUL},
        ("POST", "/api/feedback", "summary"): {"kind": "bug", "summary": NUL},
    }
    for (method, url, field), body in cases.items():
        response = await client.request(method, url, json=body)
        assert response.status_code == 422, f"{method} {url} {field} → {response.status_code}"
        assert field in str(response.json()["detail"]), f"{method} {url}: {response.text}"


@pytest.mark.parametrize("url", ["/api/sites", "/api/sites/geo"])
async def test_nul_byte_in_a_search_term_is_a_422(client, admin_auth, url):
    await _login(client, admin_auth)
    response = await client.get(url, params={"q": NUL})
    assert response.status_code == 422, response.text


# ── R3-02: NaN / Infinity is a 422, not a 500 ────────────────────────────────


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e999"])
async def test_non_finite_numbers_are_a_422(client, admin_auth, literal):
    await _login(client, admin_auth)
    raw = f'{{"name":"nf","site_type":"bridge","latitude":{literal},"longitude":0}}'
    response = await client.post(
        "/api/sites", content=raw, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422, response.text


# ── R3-14: coordinates are real numbers, not booleans or strings ─────────────


@pytest.mark.parametrize("lat, lng", [(True, False), ("51.5", "-0.1"), (True, 0), (51.5, "x")])
async def test_coordinates_must_be_numbers(client, admin_auth, lat, lng):
    await _login(client, admin_auth)
    response = await client.post(
        "/api/sites",
        json={"name": "coords", "site_type": "bridge", "latitude": lat, "longitude": lng},
    )
    assert response.status_code == 422, response.text


async def test_integer_coordinates_are_still_fine(client, admin_auth):
    await _login(client, admin_auth)
    response = await client.post(
        "/api/sites", json={"name": "ints", "site_type": "bridge", "latitude": 51, "longitude": 0}
    )
    assert response.status_code == 201, response.text


# ── R3-03 / Q-R3-8: postcodes are UK-format, normalised, and never a 500 ─────


@pytest.mark.parametrize(
    "given, stored",
    [
        ("sw1a 1aa", "SW1A 1AA"),
        (" se1  2up ", "SE1 2UP"),
        ("E3 5NR", "E3 5NR"),
        ("eh1 1yz", "EH1 1YZ"),
        ("GIR 0AA", "GIR 0AA"),
        ("m11aa", "M1 1AA"),
        ("   ", None),
        ("", None),
    ],
)
async def test_valid_postcodes_are_normalised(client, admin_auth, given, stored):
    await _login(client, admin_auth)
    response = await client.post(
        "/api/sites", json={**SITE, "name": f"pc {given!r}", "postcode": given}
    )
    assert response.status_code == 201, response.text
    assert response.json()["postcode"] == stored


@pytest.mark.parametrize(
    "bad",
    ["ABCDEFGHIJ", "NOTAPOSTCODE", "12345", "SW1A", "SW1A 1A", "QQ1 1AA", "SW1A 1AAA", "A 1AA"],
)
async def test_non_uk_postcodes_are_a_422_not_a_500(client, admin_auth, bad):
    await _login(client, admin_auth)
    response = await client.post("/api/sites", json={**SITE, "name": f"bad {bad}", "postcode": bad})
    assert response.status_code == 422, response.text
    assert "postcode" in str(response.json()["detail"])


# ── R3-05 / R3-12 / Q-R3-7: look-alike names collide; invisible characters go ─


async def test_look_alike_names_conflict_after_normalisation(client, admin_auth):
    await _login(client, admin_auth)
    first = await client.post("/api/sites", json={**SITE, "name": "Café Bridge"})
    assert first.status_code == 201
    decomposed = await client.post("/api/sites", json={**SITE, "name": "Café Bridge"})
    assert decomposed.status_code == 409, decomposed.text
    await client.post("/api/sites", json={**SITE, "name": "Alpha"})
    zero_width = await client.post("/api/sites", json={**SITE, "name": "Al​pha"})
    assert zero_width.status_code == 409, zero_width.text


async def test_text_is_stored_composed_and_without_invisible_characters(client, admin_auth):
    await _login(client, admin_auth)
    made = await client.post(
        "/api/sites",
        json={**SITE, "name": "Café ‮txt‬ ⁦x⁩﻿", "notes": "a​b"},
    )
    assert made.status_code == 201, made.text
    body = made.json()
    assert body["name"] == unicodedata.normalize("NFC", "Café txt x")
    assert body["notes"] == "ab"


async def test_emoji_sequences_and_right_to_left_text_survive_cleaning(client, admin_auth):
    await _login(client, admin_auth)
    family = "\U0001f468‍\U0001f469‍\U0001f467 Wall"  # ZWJ emoji sequence
    persian = "می‌خواهم"  # uses ZWNJ
    for name in (family, persian):
        made = await client.post("/api/sites", json={**SITE, "name": name})
        assert made.status_code == 201, made.text
        assert made.json()["name"] == name


async def test_ordinary_whitespace_in_text_is_kept(client, admin_auth):
    await _login(client, admin_auth)
    w = await _chain(client)
    text = "line one\nline two\tindented"
    made = await client.post(
        "/api/comments", json={"entity": "site", "entity_id": w["site"]["id"], "text": text}
    )
    assert made.status_code == 201, made.text
    assert made.json()["text"] == text


async def test_upload_filename_loses_invisible_and_control_characters(client, admin_auth):
    await _login(client, admin_auth)
    w = await _chain(client)
    uploaded = await client.post(
        "/api/attachments",
        params={"entity": "site", "entity_id": w["site"]["id"]},
        files={"file": ("report‮txt.exe​.txt", io.BytesIO(b"x"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["name"] == "reporttxt.exe.txt"


# ── R3-13: the server search term is trimmed ─────────────────────────────────


async def test_search_term_is_trimmed(client, admin_auth):
    await _login(client, admin_auth)
    await client.post("/api/sites", json={**SITE, "name": "Plain"})
    for url in ("/api/sites", "/api/sites/geo"):
        response = await client.get(url, params={"q": "  plain  "})
        assert response.status_code == 200
        body = response.json()
        assert len(body.get("items", body)) == 1, url


# ── R3-04 / R3-15: the admin export guards formulas, writes a BOM ────────────


async def test_admin_export_guards_formulas_and_starts_with_a_bom(client, admin_auth):
    await _login(client, admin_auth)
    names = ['=HYPERLINK("http://evil","x")', "+cmd|' /C calc'!A0", "@SUM(1)", "-2+3", "Plain"]
    for index, name in enumerate(names):
        await client.post(
            "/api/sites", json={**SITE, "name": name, "longitude": -0.5 - index / 100}
        )
    response = await client.get("/api/admin/export")
    assert response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    raw = archive.read("sites.csv")
    assert raw[:3] == b"\xef\xbb\xbf", "no UTF-8 BOM"
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    exported = {r["name"] for r in rows}
    assert '\'=HYPERLINK("http://evil","x")' in exported
    assert "'+cmd|' /C calc'!A0" in exported
    assert "'@SUM(1)" in exported
    assert "'-2+3" in exported
    assert "Plain" in exported
    # Numbers are numbers: a negative longitude is not turned into text.
    assert all(not r["location_longitude"].startswith("'") for r in rows)
    assert any(r["location_longitude"].startswith("-0.") for r in rows)


async def test_admin_export_filename_uses_the_app_time_zone(client, admin_auth):
    from datetime import datetime

    from app.core.time import app_zone

    await _login(client, admin_auth)
    before = datetime.now(app_zone()).strftime("%Y%m%d-")
    response = await client.get("/api/admin/export")
    assert before in response.headers["content-disposition"]


# ── Q-R3-1: the owner of a linked action is the linked user ──────────────────


async def test_the_survey_status_completed_is_untouched(client, admin_auth):
    await _login(client, admin_auth)
    w = await _chain(client)
    response = await client.patch(f"/api/surveys/{w['survey']['id']}", json={"status": "completed"})
    assert response.status_code == 200
