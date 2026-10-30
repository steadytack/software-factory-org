"""Conftest: app client + DB fixtures.

Tests run against the real PostGIS database via the compose-exposed port
(localhost:$DB_PORT, default 5434, database `app_test`) so geometry behaviour matches
production exactly. Requires `docker compose up -d db`.

Performance notes:
- The schema is created once per session (not per test); each test runs
  inside a transaction that is rolled back at teardown, so tests stay
  isolated without paying DDL cost per test.
- BCRYPT_ROUNDS=4 is set before app import so password hashing in the auth
  suite costs ~10ms instead of ~250ms.
- With pytest-xdist installed, each worker gets its own database
  (app_test_gw0, app_test_gw1, ...) so `pytest -n 4` works safely.
"""

import os
import re
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncEngine,
    async_sessionmaker,
    create_async_engine,
)

# bcrypt cost override must be set before app.core.security is imported.
os.environ.setdefault("BCRYPT_ROUNDS", "4")

# Import every model module explicitly so Base.metadata is fully populated
# before create_all. Relying on import side effects of app.main is fragile —
# a wiring change silently drops tables from the test schema.
# NOTE: these must come BEFORE `from app.main import app` below — the plain
# `import app.models.*` statements bind the name `app` to the package module,
# and the later `from app.main import app` must win so `app` refers to the
# FastAPI instance (used for dependency_overrides below).
import app.models.changelog  # noqa: E402,F401
import app.models.comment  # noqa: E402,F401
import app.models.feedback  # noqa: E402,F401
import app.models.notification  # noqa: E402,F401
import app.models.rate_limit  # noqa: E402,F401
import app.models.revoked_token  # noqa: E402,F401
import app.models.site  # noqa: E402,F401
import app.models.survey  # noqa: E402,F401
import app.models.user  # noqa: E402,F401
from app.core.config import get_settings  # noqa: E402
from app.core.database import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.models.base import Base  # noqa: E402


def _host_test_url() -> str:
    """DATABASE_URL is written for inside docker (@db:5432); tests run on the
    host, so swap the host/port to the compose-published localhost:DB_PORT
    (default 5434).
    Credentials come from Settings (root .env) so they stay in sync."""
    url = get_settings().database_url
    # Rewrite the host:port segment (between '@' and the final '/dbname').
    return (
        re.sub(
            r"@[^/@]+/",
            f"@localhost:{os.environ.get('DB_PORT', '5434')}/",
            url.rsplit("/", 1)[0] + "/",
        )
        + "app_test"
    )


def _test_db_url() -> str:
    """Per-worker database when running under pytest-xdist, so parallel
    workers never share rows. Without xdist this is plain app_test."""
    base = os.environ.get("TEST_DATABASE_URL") or _host_test_url()
    worker = os.environ.get("PYTEST_XDIST_WORKER")
    if worker:
        return f"{base.rsplit('/', 1)[0]}/app_test_{worker}"
    return base


TEST_DB_URL = _test_db_url()


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session")
async def _engine() -> AsyncGenerator[AsyncEngine, None]:
    """Session-scoped engine + schema. DDL runs once per worker, not per test."""
    # Under xdist each worker needs its own database — create it from the
    # base app_test DB (which always exists) before connecting.
    worker = os.environ.get("PYTEST_XDIST_WORKER")
    if worker:
        admin_url = TEST_DB_URL.rsplit("/", 1)[0] + "/app_test"
        admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with admin_engine.begin() as conn:
            await conn.execute(text(f'CREATE DATABASE "app_test_{worker}"'))
        await admin_engine.dispose()

    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
        # Seed the bootstrap admin so admin_auth logins work. Mirrors
        # ensure_bootstrap_admin but inside the transaction that just
        # created the schema.
        #
        # IMPORTANT: this SessionFactory must bind to `conn` (the connection
        # already holding the DDL transaction), not to `engine`. Binding to
        # `engine` pulls a second connection from the pool, which then blocks
        # waiting for this still-open DDL transaction to release its locks —
        # a self-deadlock that hangs forever (and leaves orphaned backends
        # that block subsequent runs' DROP TABLE too).
        from app.core.auth import ensure_bootstrap_admin

        SessionFactory = async_sessionmaker(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        async with SessionFactory() as session:
            await ensure_bootstrap_admin(session)
            await session.commit()
    yield engine
    await engine.dispose()


@pytest.fixture(scope="session")
def db_engine(_engine: AsyncEngine) -> AsyncEngine:
    """Public alias for `_engine`. Several test modules reference a
    `db_engine` fixture (via `pytest.mark.usefixtures("db_engine")` or as a
    direct parameter) — this name never existed, so those tests errored at
    setup with "fixture 'db_engine' not found" (previously masked by the
    session-scoped DB deadlock hanging before any test could run)."""
    return _engine


@pytest.fixture
async def db_connection(_engine: AsyncEngine) -> AsyncGenerator[AsyncConnection, None]:
    """Per-test connection wrapped in an outer transaction.

    The app's sessions bind to this connection (see client fixture), so every
    write a test makes — including through the API — lands inside one
    transaction that is rolled back at teardown. Tests are isolated without
    re-running drop_all/create_all.
    """
    async with _engine.connect() as conn:
        trans = await conn.begin()
        try:
            yield conn
        finally:
            await trans.rollback()


@pytest.fixture
async def client(db_connection: AsyncConnection) -> AsyncGenerator[AsyncClient, None]:
    """Test client with cookie jar replay, bound to the per-test transaction.

    The app sets Secure cookies (correct for production HTTPS). httpx's
    cookie jar will not auto-attach Secure cookies over http://, so we
    replay them manually from the jar on each request — this exercises the
    real cookie flow (login sets cookie → subsequent requests authenticated)
    without weakening the app's Secure flag.
    """
    SessionFactory = async_sessionmaker(
        bind=db_connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    async def override_session():
        # The production `get_session` (app/core/database.py) wraps the
        # session in `session.begin()`, which commits on clean exit. This
        # override must do the same — a bare `async with SessionFactory()`
        # never commits, so every write made through the API (via
        # session.flush() in endpoints) is silently discarded when the
        # session closes, and a following read never sees it (writes
        # "succeed" with 201 but the record 404s on GET).
        async with SessionFactory() as session:
            async with session.begin():
                yield session

    app.dependency_overrides[get_session] = override_session

    jar: dict[str, str] = {}

    async def _replay_cookies(request):
        # Tests may set an explicit cookie header (e.g. to present a forged
        # token) — never clobber it with the jar.
        if "cookie" in request.headers:
            return
        if jar:
            request.headers["cookie"] = "; ".join(f"{k}={v}" for k, v in jar.items())

    async def _capture_response_cookies(response):
        # Parse raw Set-Cookie headers. httpx's response.cookies hides
        # deletions (Max-Age=0 / empty value), but logout relies on them.
        # SimpleParser-level detail we need: value empty or Max-Age=0 → delete.
        for value in response.headers.get_list("set-cookie"):
            first_pair = value.split(";", 1)[0]
            if "=" not in first_pair:
                continue
            name, _, cookie_value = first_pair.partition("=")
            name = name.strip()
            cookie_value = cookie_value.strip().strip('"')
            if not cookie_value or "max-age=0" in value.lower():
                jar.pop(name, None)
            else:
                jar[name] = cookie_value
                # Expose to tests (client.cookies hides Secure cookies over http).
                c.headers["x-test-cookie-" + name] = cookie_value

    transport = ASGITransport(app=app)

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        event_hooks={
            "request": [_replay_cookies],
            "response": [_capture_response_cookies],
        },
    ) as c:
        yield c

    app.dependency_overrides.clear()


@pytest.fixture
def admin_auth() -> dict:
    settings = get_settings()
    return {"email": settings.admin_email, "password": settings.admin_password}


@pytest.fixture
async def db_session(db_connection: AsyncConnection):
    """An AsyncSession bound to the per-test transaction.

    For tests that need to call service/CLI code taking a session directly
    (e.g. `app.reconcile.build_report`) rather than going through the API. A
    plain `SessionFactory()` would connect to the compose-internal hostname
    and fail on the host.
    """
    factory = async_sessionmaker(
        bind=db_connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    async with factory() as session:
        yield session
