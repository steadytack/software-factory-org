"""Photo uploads lose their EXIF (GPS, device) but offer the position back;
thumbnails are served; quotas stop one account filling the disk; account
history in the changelog is admin-only."""

import io
from pathlib import Path

import pytest
from PIL import Image
from PIL.TiffImagePlugin import IFDRational
from sqlalchemy import select

from app.core.config import get_settings
from app.models.comment import Attachment

pytestmark = pytest.mark.usefixtures("db_engine")

SITE = {"name": "Photo Site", "site_type": "bridge", "latitude": 51.5, "longitude": -0.12}


def phone_photo() -> bytes:
    """A JPEG like a phone's: rotated via EXIF, with GPS and device tags."""
    img = Image.new("RGB", (400, 300), (30, 120, 200))
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90° clockwise
    exif[0x010F] = "PhoneMaker"
    exif[0x0110] = "Model X"
    exif[0x8825] = {
        1: "N",
        2: (IFDRational(51), IFDRational(30), IFDRational(0)),
        3: "W",
        4: (IFDRational(0), IFDRational(7), IFDRational(30)),
    }
    out = io.BytesIO()
    img.save(out, format="JPEG", exif=exif.tobytes())
    return out.getvalue()


async def _login(client, admin_auth) -> None:
    assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200


async def _survey(client) -> dict:
    site = (await client.post("/api/sites", json=SITE)).json()
    return (
        await client.post(
            "/api/surveys",
            json={"site_id": site["id"], "surveyor": "A", "survey_date": "2026-09-01"},
        )
    ).json()


async def _upload(client, survey_id: str, data: bytes, name="IMG_0001.jpg", ctype="image/jpeg"):
    return await client.post(
        "/api/attachments",
        params={"entity": "survey", "entity_id": survey_id},
        files={"file": (name, io.BytesIO(data), ctype)},
    )


async def test_photo_is_stripped_rotated_and_thumbnailed(client, admin_auth, db_session):
    await _login(client, admin_auth)
    survey = await _survey(client)
    response = await _upload(client, survey["id"], phone_photo())
    assert response.status_code == 201, response.text
    body = response.json()
    # Position offered back to the UI...
    assert body["photo_location"] == {"latitude": 51.5, "longitude": -0.125}
    assert body["has_thumbnail"] is True

    stored = await db_session.scalar(
        select(Attachment.stored_path).where(Attachment.id == body["id"])
    )
    # ...but gone from the stored file, along with the device tags.
    with Image.open(stored) as saved:
        assert dict(saved.getexif()) == {}
        assert "exif" not in saved.info
        assert saved.size == (300, 400)  # rotation applied to the pixels
    assert body["size_bytes"] == Path(stored).stat().st_size

    thumb = await client.get(f"/api/attachments/{body['id']}/thumbnail")
    assert thumb.status_code == 200
    assert thumb.headers["content-type"] == "image/jpeg"

    listed = (
        await client.get("/api/attachments", params={"entity": "survey", "entity_id": survey["id"]})
    ).json()
    assert listed["items"][0]["has_thumbnail"] is True
    assert listed["items"][0]["photo_location"] is None  # only on the upload response

    # Deleting the attachment removes the thumbnail too.
    assert (await client.delete(f"/api/attachments/{body['id']}")).status_code == 204
    assert not Path(f"{stored}.thumb.jpg").exists()


async def test_undecodable_image_is_refused(client, admin_auth):
    await _login(client, admin_auth)
    survey = await _survey(client)
    fake = b"\xff\xd8\xff" + b"not really a jpeg" * 10
    response = await _upload(client, survey["id"], fake)
    assert response.status_code == 415


async def test_quota_refuses_upload_past_the_limit(client, admin_auth, monkeypatch):
    await _login(client, admin_auth)
    survey = await _survey(client)
    monkeypatch.setattr(get_settings(), "upload_quota_mb_per_user", 0)
    response = await _upload(client, survey["id"], b"hello", "note.txt", "text/plain")
    assert response.status_code == 413
    assert "upload limit" in response.json()["detail"]

    monkeypatch.setattr(get_settings(), "upload_quota_mb_per_user", 500)
    monkeypatch.setattr(get_settings(), "upload_quota_mb_total", 0)
    response = await _upload(client, survey["id"], b"hello", "note.txt", "text/plain")
    assert response.status_code == 413
    assert "Storage is full" in response.json()["detail"]


async def test_account_history_is_admin_only(client, admin_auth):
    await _login(client, admin_auth)
    created = await client.post(
        "/api/users",
        json={"email": "peek@example.com", "password": "Peek#Pass#1234", "role": "viewer"},
    )
    assert created.status_code == 201
    admin_view = (await client.get("/api/changelog", params={"entity": "user"})).json()
    assert admin_view["total"] >= 1

    await client.post("/api/auth/logout")
    await client.post(
        "/api/auth/login", json={"email": "peek@example.com", "password": "Peek#Pass#1234"}
    )
    everything = (await client.get("/api/changelog")).json()["items"]
    assert all(e["entity"] != "user" for e in everything)
    forbidden = await client.get("/api/changelog", params={"entity": "user"})
    assert forbidden.status_code == 403
