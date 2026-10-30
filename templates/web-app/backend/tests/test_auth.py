import pytest
import sqlalchemy

from app.core.config import get_settings

pytestmark = pytest.mark.usefixtures("db_engine")


async def test_login_success_sets_cookies(client, admin_auth):
    response = await client.post("/api/auth/login", json=admin_auth)
    assert response.status_code == 200
    set_cookie = response.headers["set-cookie"]
    assert "access_token=" in set_cookie
    assert "refresh_token=" in set_cookie


async def test_login_wrong_password(client, admin_auth):
    response = await client.post(
        "/api/auth/login", json={"email": admin_auth["email"], "password": "wrong"}
    )
    assert response.status_code == 401
    assert "access_token" not in response.cookies


async def test_login_unknown_email(client):
    response = await client.post(
        "/api/auth/login", json={"email": "nope@example.com", "password": "x"}
    )
    assert response.status_code == 401


async def test_me_requires_auth(client):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


async def test_refresh_rejected_for_deactivated_user(client, admin_auth, db_connection):
    """A deactivated user must not be able to mint fresh access tokens from a
    still-valid refresh token — refresh re-validates the account, same as
    get_current_subject does for access tokens."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.models.user import User

    await client.post("/api/auth/login", json=admin_auth)
    # Refresh works while the account is active.
    ok = await client.post("/api/auth/refresh")
    assert ok.status_code == 200

    # Must use the test database (bound to db_connection, the per-test
    # transaction) — app.core.database.SessionFactory targets the
    # production DATABASE_URL (the docker-internal 'db' host), which is
    # unreachable from the host running pytest and a different database
    # from the one the test client is using anyway.
    settings = get_settings()
    TestSessionFactory = async_sessionmaker(
        bind=db_connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    async with TestSessionFactory() as session:
        user = (
            await session.execute(select(User).where(User.email == settings.admin_email))
        ).scalar_one()
        user.is_active = False
        await session.commit()

    blocked = await client.post("/api/auth/refresh")
    assert blocked.status_code == 401
    # And the stale access cookie no longer passes either.
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_login_logout_flow(client, admin_auth):
    await client.post("/api/auth/login", json=admin_auth)
    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == admin_auth["email"]

    logout = await client.post("/api/auth/logout")
    assert logout.status_code == 200
    me_after = await client.get("/api/auth/me")
    assert me_after.status_code == 401


async def test_login_rate_limit(client, admin_auth, db_connection):
    """F1: after MAX_ATTEMPTS failures, login returns 429 even with the
    correct password — brute force is throttled."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    from app.core import rate_limit

    for _ in range(rate_limit.MAX_ATTEMPTS):
        response = await client.post(
            "/api/auth/login",
            json={"email": admin_auth["email"], "password": "wrong"},
        )
        assert response.status_code == 401

    blocked = await client.post("/api/auth/login", json=admin_auth)
    assert blocked.status_code == 429

    # Different email from the same IP is a different bucket.
    other = await client.post(
        "/api/auth/login", json={"email": "other@example.com", "password": "x"}
    )
    assert other.status_code == 401

    # DB-backed limiter: clear the rows rather than an in-memory dict, and
    # reset the module-level prune throttle so later tests sweep normally.
    # Must use the test database (bound to db_connection) — the production
    # SessionFactory targets DATABASE_URL's docker-internal 'db' host, which
    # doesn't resolve from the host running pytest.
    TestSessionFactory = async_sessionmaker(
        bind=db_connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    async with TestSessionFactory() as session:
        await session.execute(sqlalchemy.delete(rate_limit.LoginFailure))
        await session.commit()
    rate_limit._last_prune = 0.0


async def test_single_user_mode_toggle(client, admin_auth):
    """MULTI_USER_ENABLED=false: user management 404s, /me reports
    is_admin=true and multi_user=false, and only the bootstrap admin can
    sign in — an account left over from multi-user use can neither sign in
    nor keep an existing session (it would otherwise be treated as admin)."""
    from contextlib import ExitStack
    from unittest.mock import patch

    # Create a non-admin user first (multi-user mode is on by default).
    await client.post("/api/auth/login", json=admin_auth)
    created = await client.post(
        "/api/users",
        json={"email": "plain@example.com", "password": "Plain#User#1"},
    )
    assert created.status_code == 201, created.text
    # The plain user signs in while multi-user mode is on…
    assert (
        await client.post(
            "/api/auth/login", json={"email": "plain@example.com", "password": "Plain#User#1"}
        )
    ).status_code == 200
    plain_cookies = dict(client.cookies)
    await client.post("/api/auth/login", json=admin_auth)

    # Every consumer does `from app.core.config import get_settings`, which
    # binds its own module-level name to the same function object at import
    # time. Patching only `app.core.config.get_settings` therefore has no
    # effect on those already-bound references — each call site that reads
    # settings during this flow must be patched individually.
    settings = get_settings().model_copy(update={"multi_user_enabled": False})
    with ExitStack() as stack:
        for target in (
            "app.core.config.get_settings",
            "app.api.endpoints.auth.get_settings",
            "app.api.endpoints.users.get_settings",
            "app.core.auth.get_settings",
        ):
            stack.enter_context(patch(target, return_value=settings))

        # /me reflects the mode.
        me = await client.get("/api/auth/me")
        assert me.status_code == 200
        body = me.json()
        assert body["multi_user"] is False
        assert body["is_admin"] is True

        # User management disappears entirely.
        assert (await client.get("/api/users")).status_code == 404
        assert (
            await client.post(
                "/api/users", json={"email": "x@example.com", "password": "Long#Enough#1"}
            )
        ).status_code == 404

        # …and that session ends once single-user mode is on.
        admin_cookies = dict(client.cookies)
        client.cookies.clear()
        client.cookies.update(plain_cookies)
        me = await client.get("/api/auth/me")
        assert me.status_code == 401
        assert (await client.post("/api/auth/refresh")).status_code == 401

        # Signing in again is refused, with a reason (the password was right).
        login = await client.post(
            "/api/auth/login",
            json={"email": "plain@example.com", "password": "Plain#User#1"},
        )
        assert login.status_code == 403
        assert "single-user" in login.json()["detail"]
        assert "access_token" not in login.cookies

        # A wrong password still gets the generic 401.
        wrong = await client.post(
            "/api/auth/login",
            json={"email": "plain@example.com", "password": "Wrong#Password#1"},
        )
        assert wrong.status_code == 401

        # The bootstrap admin still signs in and can write.
        client.cookies.clear()
        client.cookies.update(admin_cookies)
        assert (await client.post("/api/auth/login", json=admin_auth)).status_code == 200
        site = await client.post(
            "/api/sites",
            json={
                "name": "Toggle Site",
                "site_type": "bridge",
                "status": "active",
                "latitude": 51.5,
                "longitude": -0.12,
            },
        )
        assert site.status_code == 201, site.text
