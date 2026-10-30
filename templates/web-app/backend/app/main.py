import math
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints import (
    admin,
    auth,
    changelog,
    comments,
    feedback,
    map_layers,
    notifications,
    sites,
    stats,
    surveys,
    users,
)
from app.core.config import get_settings
from app.core.database import SessionDep
from app.core.logging import configure_logging, get_logger
from app.services.base import RuleViolationError
from app.services.client_ids import ClientIdConflictError

logger = get_logger(__name__)

# Methods that change state — these get an Origin check (F2, defence-in-depth
# alongside SameSite=lax cookies).
MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _normalize_origins(cors_origins: str) -> list[str]:
    """Split the CORS_ORIGINS env value into a clean origin list. Trailing
    slashes are stripped so a sloppy .env value (http://localhost:5173/)
    doesn't silently 403 every mutating request via the origin check."""
    return [o.strip().rstrip("/") for o in cors_origins.split(",") if o.strip()]


def register_origin_check(app: FastAPI, allowed_origins: list[str]) -> None:
    """Reject cross-site mutating requests whose Origin isn't an allowed origin.
    Non-browser clients (curl, tests) send no Origin header and pass through."""

    @app.middleware("http")
    async def origin_check(request: Request, call_next):
        if request.method in MUTATING_METHODS:
            origin = request.headers.get("origin")
            if origin is not None and origin not in allowed_origins:
                return JSONResponse(
                    {"detail": "Cross-origin request rejected"},
                    status_code=status.HTTP_403_FORBIDDEN,
                )
        return await call_next(request)


def register_security_headers(app: FastAPI) -> None:
    """Baseline security headers on every response. HSTS is intentionally
    omitted here — it belongs to the TLS-terminating proxy (nginx) in prod.

    Content-Security-Policy: the API serves no HTML of its own (the SPA is
    served by Vite/nginx), so a restrictive default-src 'none' policy both
    hardens any error/HTML responses and satisfies security scanners. If this
    backend ever serves HTML, revisit before deploying — the policy is
    deliberately fail-closed."""

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        )
        return response


# ── GOV-2: log redaction ─────────────────────────────────────────────────────
#
# The data-integrity audit found **full row content, including PII, written to
# the logs on any DB error**:
#
# * the IntegrityError handler logged `str(exc)`, which embeds Postgres's
#   `DETAIL: Failing row contains (...)` — every column value of the failing
#   row;
# * the 500 handler logged `str(exc)`, which for a SQLAlchemy error embeds the
#   full SQL **with all bound parameters** — in probe B8 that was a user's
#   email, a notification's title and body, and record ids.
#
# What a responder actually needs is *which rule was broken, on which
# column* — not the data. These helpers extract that and drop the rest.

# Postgres puts the row dump on a DETAIL: line and the useful part above it.
_ROW_DETAIL_MARKER = "DETAIL:"
# SQLAlchemy appends the statement and its parameters after the driver message.
_SQL_MARKERS = ("\n[SQL:", "[SQL:", "\n[parameters:", "[parameters:")


def redact_db_error(exc: BaseException) -> str:
    """The first line of a database error, with the failing-row dump, the SQL
    and the bound parameters stripped."""
    message = str(exc)
    for marker in _SQL_MARKERS:
        message = message.split(marker, 1)[0]
    message = message.split(_ROW_DETAIL_MARKER, 1)[0]
    # Keep it to the first line and bound the length: a driver can still put a
    # value inside the primary message (e.g. a duplicate key's value).
    return message.strip().splitlines()[0][:300] if message.strip() else exc.__class__.__name__


def constraint_name(exc: BaseException) -> str | None:
    """The violated constraint's name, when the driver exposes it.

    This is the one identifier that tells a responder exactly which rule was
    broken, and it contains no row data — asyncpg surfaces it on the original
    exception as `constraint_name`.
    """
    original = getattr(exc, "orig", exc)
    for attr in ("constraint_name", "constraint"):
        value = getattr(original, attr, None)
        if value:
            return str(value)
    return None


def _json_safe(value):
    """A copy of `value` whose non-finite floats are text, so it can be sent as JSON."""
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {k: _json_safe(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [_json_safe(v) for v in value]
    return value


def register_error_handler(app: FastAPI) -> None:
    """F3: uniform JSON error shape for unhandled exceptions; internals go to
    logs, never to the response body."""

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(request: Request, exc: RequestValidationError):
        # the default 422 body echoes the rejected value back. A JSON
        # `NaN`, `Infinity` or `1e999` cannot be written as JSON, so sending
        # that answer itself failed and the client got a 500 instead of a 422.
        safe = RequestValidationError(_json_safe(list(exc.errors())), body=None)
        return await request_validation_exception_handler(request, safe)

    @app.exception_handler(RuleViolationError)
    async def rule_violation_handler(request: Request, exc: RuleViolationError):
        return JSONResponse({"detail": str(exc)}, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)

    @app.exception_handler(ClientIdConflictError)
    async def client_id_conflict_handler(request: Request, exc: ClientIdConflictError):
        return JSONResponse({"detail": str(exc)}, status_code=status.HTTP_409_CONFLICT)

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(request: Request, exc: IntegrityError):
        # Unique-constraint violations (e.g. duplicate site name, audit F12)
        # become a clean 409 instead of an unhandled 500. Other integrity
        # errors (FK etc.) are already prevented by service-level checks.
        #
        # log the constraint name and the redacted driver message, not
        # the failing row's values.
        logger.warning(
            "integrity_error",
            path=request.url.path,
            constraint=constraint_name(exc),
            error=redact_db_error(exc),
        )
        return JSONResponse(
            {"detail": "Conflict with existing data (duplicate or invalid reference)"},
            status_code=status.HTTP_409_CONFLICT,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        # `exc_info` is kept — a traceback is how a 500 gets diagnosed,
        # and it carries code locations rather than row values. What is
        # dropped is the SQL-with-bound-parameters that `str(exc)` embeds for
        # any SQLAlchemy error.
        logger.error(
            "unhandled_exception",
            path=request.url.path,
            method=request.method,
            error_type=exc.__class__.__name__,
            error=redact_db_error(exc),
            exc_info=exc,
        )
        return JSONResponse(
            {"detail": "Internal server error"},
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup/shutdown. The bootstrap admin is seeded here — inside the
    server's own event loop — rather than via asyncio.run() at import time.

    asyncio.run() creates a *second* event loop and binds the asyncpg
    connection pool to it; when that loop closes, every later DB request on
    uvicorn's loop fails with "got Future attached to a different loop". Doing
    the work in the lifespan keeps one loop for the process."""
    from app.core.auth import ensure_bootstrap_admin
    from app.core.database import SessionFactory

    try:
        async with SessionFactory() as session:
            await ensure_bootstrap_admin(session)
    except Exception:
        # Loud but non-fatal: the app still starts so /api/health can report.
        logger.error("bootstrap_admin_failed", exc_info=True)
    yield


def create_app() -> FastAPI:
    configure_logging()  # validates config via get_settings() — fails fast here
    settings = get_settings()
    if not settings.cookie_secure:
        # Dev-friendly default, but easy to forget in a deployment — shout.
        logger.warning(
            "cookie_secure_disabled",
            hint="Set COOKIE_SECURE=true in any HTTPS deployment; "
            "Secure cookies are required for production auth.",
        )

    app = FastAPI(
        title="Web App Template",
        version="0.1.0",
        # Hide the schema UI in production (DOCS_ENABLED=false in .env).
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    origins = _normalize_origins(settings.cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth.router, prefix="/api")
    app.include_router(sites.router, prefix="/api")
    app.include_router(surveys.router, prefix="/api")
    app.include_router(changelog.router, prefix="/api")
    app.include_router(notifications.router, prefix="/api")
    app.include_router(comments.router, prefix="/api")
    app.include_router(stats.router, prefix="/api")
    app.include_router(admin.router, prefix="/api")
    app.include_router(users.router, prefix="/api")
    app.include_router(map_layers.router, prefix="/api")
    app.include_router(feedback.router, prefix="/api")
    app.include_router(feedback.admin_router, prefix="/api")
    register_origin_check(app, origins)
    register_security_headers(app)
    register_error_handler(app)

    @app.get("/api/health")
    async def health(session: AsyncSession = SessionDep) -> dict:
        """Liveness AND readiness: 503 when the database is unreachable, so
        a container healthcheck or load balancer stops sending traffic to an
        instance that can only return errors."""
        try:
            await session.execute(text("SELECT 1"))
        except Exception as exc:  # noqa: BLE001 — any failure means "not ready"
            logger.warning("health_db_unreachable", error=type(exc).__name__)
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "Database unreachable"
            ) from exc
        return {"status": "ok", "database": "ok"}

    logger.info("app_started", origins=settings.cors_origins)

    return app


app = create_app()
