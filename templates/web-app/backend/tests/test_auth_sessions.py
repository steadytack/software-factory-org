"""Session hardening: per-IP / per-account rate limits that can't be used to
lock the real user out, revocable sessions (logout, rotation, password
change), and startup refusal of weak secrets."""

from datetime import timedelta

import pytest
from pydantic import ValidationError

from app.api.endpoints import auth as auth_endpoints
from app.core import rate_limit
from app.core.config import Settings

pytestmark = pytest.mark.usefixtures("db_engine")

USER = {"email": "field@example.com", "password": "Field#Worker#1"}


def _cookie(response, name: str) -> str | None:
    for value in response.headers.get_list("set-cookie"):
        pair = value.split(";", 1)[0]
        key, _, cookie = pair.partition("=")
        if key.strip() == name and cookie:
            return cookie.strip().strip('"')
    return None


async def _fail(client, email: str, times: int) -> None:
    for _ in range(times):
        r = await client.post("/api/auth/login", json={"email": email, "password": "wrong"})
        assert r.status_code in (401, 429)


async def _make_user(client, admin_auth) -> None:
    await client.post("/api/auth/login", json=admin_auth)
    created = await client.post("/api/users", json=USER)
    assert created.status_code == 201, created.text
    await client.post("/api/auth/logout")


async def test_lockout_does_not_block_real_user_from_clean_address(client, admin_auth, monkeypatch):
    await _make_user(client, admin_auth)
    # Attacker at 203.0.113.9 burns the account's attempts…
    monkeypatch.setattr(rate_limit, "client_ip", lambda request: "203.0.113.9")
    await _fail(client, USER["email"], rate_limit.MAX_ATTEMPTS)
    blocked = await client.post("/api/auth/login", json=USER)
    assert blocked.status_code == 429  # …and stays blocked, even with the password.

    # The real user, elsewhere, still signs in.
    monkeypatch.setattr(rate_limit, "client_ip", lambda request: "198.51.100.7")
    wrong = await client.post("/api/auth/login", json={"email": USER["email"], "password": "nope"})
    assert wrong.status_code == 429  # locked account: wrong guesses learn nothing
    ok = await client.post("/api/auth/login", json=USER)
    assert ok.status_code == 200


async def test_forwarded_for_header_is_not_trusted_by_the_app(client, admin_auth):
    """Only the ASGI server (behind nginx) may turn X-Forwarded-For into the
    client address; a client-sent header must not buy fresh attempts."""
    email = admin_auth["email"]
    for i in range(rate_limit.MAX_ATTEMPTS):
        await client.post(
            "/api/auth/login",
            json={"email": email, "password": "wrong"},
            headers={"x-forwarded-for": f"192.0.2.{i}"},
        )
    spoofed = await client.post(
        "/api/auth/login", json=admin_auth, headers={"x-forwarded-for": "192.0.2.200"}
    )
    assert spoofed.status_code == 429


async def test_address_bucket_caps_password_spraying(client, monkeypatch):
    monkeypatch.setattr(rate_limit, "client_ip", lambda request: "203.0.113.50")
    for i in range(rate_limit.MAX_IP_ATTEMPTS):
        await client.post(
            "/api/auth/login", json={"email": f"user{i}@example.com", "password": "Summer2026!"}
        )
    fresh = await client.post(
        "/api/auth/login", json={"email": "another@example.com", "password": "Summer2026!"}
    )
    assert fresh.status_code == 429


async def test_logout_kills_the_refresh_token(client, admin_auth):
    login = await client.post("/api/auth/login", json=admin_auth)
    refresh_token = _cookie(login, "refresh_token")
    assert refresh_token
    await client.post("/api/auth/logout")
    replay = await client.post(
        "/api/auth/refresh", headers={"cookie": f"refresh_token={refresh_token}"}
    )
    assert replay.status_code == 401


async def test_refresh_rotates_and_detects_reuse(client, admin_auth, monkeypatch):
    login = await client.post("/api/auth/login", json=admin_auth)
    first = _cookie(login, "refresh_token")
    rotated = await client.post("/api/auth/refresh")
    assert rotated.status_code == 200
    assert _cookie(rotated, "refresh_token") not in (None, first)

    # Another tab racing with the same cookie: tolerated, but no new tokens.
    race = await client.post("/api/auth/refresh", headers={"cookie": f"refresh_token={first}"})
    assert race.status_code == 200
    assert _cookie(race, "refresh_token") is None

    # The same token much later is a stolen copy: every session ends.
    monkeypatch.setattr(auth_endpoints, "REUSE_GRACE", timedelta(0))
    replay = await client.post("/api/auth/refresh", headers={"cookie": f"refresh_token={first}"})
    assert replay.status_code == 401
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_change_own_password_ends_other_sessions(client, admin_auth):
    await _make_user(client, admin_auth)
    login = await client.post("/api/auth/login", json=USER)
    old_access = _cookie(login, "access_token")

    wrong = await client.post(
        "/api/auth/password",
        json={"current_password": "not-it-at-all", "new_password": "Brand#New#Pass1"},
    )
    assert wrong.status_code == 400

    changed = await client.post(
        "/api/auth/password",
        json={"current_password": USER["password"], "new_password": "Brand#New#Pass1"},
    )
    assert changed.status_code == 200
    # This session carries on with the re-issued cookies…
    assert (await client.get("/api/auth/me")).status_code == 200
    # …but a token minted before the change is dead.
    stale = await client.get("/api/auth/me", headers={"cookie": f"access_token={old_access}"})
    assert stale.status_code == 401

    await client.post("/api/auth/logout")
    old = await client.post("/api/auth/login", json=USER)
    assert old.status_code == 401
    new = await client.post(
        "/api/auth/login", json={"email": USER["email"], "password": "Brand#New#Pass1"}
    )
    assert new.status_code == 200


async def test_admin_password_reset_ends_user_sessions(client, admin_auth):
    await _make_user(client, admin_auth)
    login = await client.post("/api/auth/login", json=USER)
    user_access = _cookie(login, "access_token")
    await client.post("/api/auth/logout")

    await client.post("/api/auth/login", json=admin_auth)
    users = (await client.get("/api/users")).json()
    user_id = next(u["id"] for u in users if u["email"] == USER["email"])
    reset = await client.post(f"/api/users/{user_id}/password", json={"password": "Reset#Pass#123"})
    assert reset.status_code == 200

    stale = await client.get("/api/auth/me", headers={"cookie": f"access_token={user_access}"})
    assert stale.status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"jwt_secret": "short"},
        {"jwt_secret": "generate-a-long-random-string-change-me-please"},
        {"admin_password": "change-me-too"},
        {"admin_password": "short"},
    ],
)
def test_weak_secrets_refuse_to_start(overrides):
    base = {
        "admin_email": "a@example.com",
        "admin_password": "A-perfectly-fine-one-42",
        "jwt_secret": "x" * 16 + "Y" * 16 + "z9" * 4,
        "database_url": "postgresql+asyncpg://u:p@h/d",
    }
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{**base, **overrides})


def test_production_forces_safe_settings():
    settings = Settings(
        _env_file=None,
        admin_email="a@example.com",
        admin_password="A-perfectly-fine-one-42",
        jwt_secret="k" * 48,
        database_url="postgresql+asyncpg://u:p@h/d",
        environment="production",
        cookie_secure=False,
        docs_enabled=True,
        seed_enabled=True,
    )
    assert settings.cookie_secure and not settings.docs_enabled and not settings.seed_enabled
