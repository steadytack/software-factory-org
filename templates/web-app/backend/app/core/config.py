from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the project root (next to docker-compose.yml), not the cwd —
# resolve it from this file's location (backend/app/core/config.py → parents[3]
# is the project root) so the app/tests work from any cwd.
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"
# Secrets are Compose secret files (docker-compose.yml, `secrets:`), mounted at /run/secrets:
# one file per secret, named as the setting (admin_password, jwt_secret, app_db_password,
# smtp_password).
# `.env` holds settings, not secrets. Off Compose (tests, a developer's shell) there is no such
# folder and the environment is read as before. Proven in an app built from the template.
_SECRETS_DIR = "/run/secrets" if Path("/run/secrets").is_dir() else None

MIN_JWT_SECRET = 32
MIN_ADMIN_PASSWORD = 12
# Values that mean "someone copied .env.example and never changed it".
PLACEHOLDERS = ("change-me", "changeme", "change_me", "replace-me", "your-secret", "generate-a-")


class Settings(BaseSettings):
    """Application config. Fails fast at startup on anything missing/invalid."""

    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore", secrets_dir=_SECRETS_DIR)

    # ── Database ────────────────────────────────────────────────────────────
    # the password was written TWICE in .env — once as
    # POSTGRES_PASSWORD (which docker-compose gives the db container) and
    # again inline inside DATABASE_URL. Rotating one and not the other broke
    # the backend silently.
    #
    # DATABASE_URL is now COMPOSED from the parts when it is not set
    # explicitly, so there is one place to change the password. Setting
    # DATABASE_URL directly still works and wins — a managed database with a
    # single connection string is a normal deployment shape, and this must not
    # take that away.
    database_url: str = ""
    postgres_user: str = ""
    # The app's own database role's password: the secret file app_db_password under Compose,
    # POSTGRES_PASSWORD in a plain environment (tests, a managed database).
    postgres_password: str = Field(
        default="", validation_alias=AliasChoices("app_db_password", "postgres_password")
    )
    postgres_db: str = ""
    postgres_host: str = "db"
    postgres_port: int = 5432
    cors_origins: str = "http://localhost:5173"

    admin_email: str
    admin_password: str
    # Template toggle: single-user apps (the common case for a personal
    # project) set MULTI_USER_ENABLED=false — user management endpoints are
    # disabled and any authenticated user is treated as an admin (there is
    # only the bootstrap admin account anyway). Multi-user apps set it true:
    # admins manage accounts via /api/users and the Admin page. Defaults to
    # false to match the single-admin common case; opt into multi-user
    # explicitly.
    multi_user_enabled: bool = False
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    # bcrypt cost factor for password hashing. 12 is production-appropriate
    # (~250ms/hash); tests set BCRYPT_ROUNDS=4 to keep the auth suite fast.
    bcrypt_rounds: int = 12

    log_level: str = "INFO"
    # Secure cookies require HTTPS. Local dev runs plain http://localhost, where
    # browsers silently drop Secure cookies — set cookie_secure=false for dev,
    # true in any HTTPS deployment (the default is dev-friendly: false only
    # when explicitly set in .env; production .env must set it true).
    cookie_secure: bool = False
    # Filesystem root for attachment uploads (Docker volume in compose).
    attachments_dir: str = "/data/uploads"
    # Upload quotas (MB): per uploader and for the whole volume. Checked
    # before a file is stored, so one account can't fill the disk.
    upload_quota_mb_per_user: int = 500
    upload_quota_mb_total: int = 10_240
    # Days a deleted survey/finding/action stays in the recycle bin before
    # the scheduled purge removes it for good.
    trash_retention_days: int = 30
    # OpenAPI docs UI (/docs, /openapi.json). Keep true for local dev; set
    # false in production so the API schema isn't publicly exposed.
    docs_enabled: bool = True
    # Demo seeder (`python -m app.seed`, POST /api/admin/reseed). /
    # it shipped ENABLED and reachable in any deployment with admin
    # credentials. Now opt-in, same shape as docs_enabled but defaulting the
    # other way — demo data in a production database is a data-integrity
    # problem, whereas a hidden schema UI is only an inconvenience. Local dev
    # sets SEED_ENABLED=true in .env.
    seed_enabled: bool = False
    # "production" forces the safe settings regardless of what else .env
    # says: Secure cookies, no /docs, no demo seeder. Anything else is dev.
    environment: str = "development"
    # The timezone whose calendar date is "today" for overdue and weekly
    # stats (core/time.py). Due dates are entered as UK dates.
    app_timezone: str = "Europe/London"
    # Outgoing email (Help → Report or suggest). Any SMTP server or relay:
    # Microsoft 365, Gmail, SendGrid, Mailgun… Port 465 uses implicit TLS;
    # otherwise STARTTLS when smtp_starttls. Unset host = email off (reports
    # are still stored and listed under Admin → Feedback). Where each type
    # of report goes is FEEDBACK_* below, which an admin can change in the app.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True
    # The app's name, used in email subjects and exports. Keep in step with
    # frontend/src/lib/brand.ts.
    app_name: str = "Web App Template"
    # Where each type of Help → Feedback report goes: `email:<address>`
    # (stored and emailed; a bare `email:` uses the address an admin set under
    # Admin → Feedback), `store` (kept for the admins only) or `off` (the
    # type isn't offered). An admin can change these in the app; these are
    # the defaults until they do.
    feedback_problem: str = "store"
    feedback_suggestion: str = "store"
    feedback_question: str = "store"
    # feature:heartbeat:start
    # Outbound heartbeat (app/heartbeat.py, run by the scheduler service): a
    # dead-man's-switch URL (healthchecks.io, an Uptime Kuma push monitor),
    # pinged every heartbeat_every_seconds while heartbeat_health_url answers
    # 200. Empty = off. HTTPS only.
    heartbeat_url: str = ""
    heartbeat_every_seconds: int = Field(default=300, ge=30)
    heartbeat_health_url: str = "http://backend:8000/api/health"
    # feature:heartbeat:end

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    @model_validator(mode="after")
    def _check_timezone(self) -> "Settings":
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(self.app_timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(
                f"APP_TIMEZONE {self.app_timezone!r} is not a known IANA timezone "
                "(e.g. Europe/London)"
            ) from exc
        return self

    @model_validator(mode="after")
    def _check_feedback_routes(self) -> "Settings":
        for name in ("feedback_problem", "feedback_suggestion", "feedback_question"):
            value = getattr(self, name).strip()
            if not value:
                value = "store"
            if value not in ("store", "off") and not value.startswith("email:"):
                raise ValueError(
                    f"{name.upper()} must be `email:<address>`, `store` or `off` (got {value!r})."
                )
            object.__setattr__(self, name, value)
        return self

    # feature:heartbeat:start
    @model_validator(mode="after")
    def _check_heartbeat(self) -> "Settings":
        url = self.heartbeat_url.strip()
        if url and not url.startswith("https://"):
            raise ValueError("HEARTBEAT_URL must start with https:// (or be empty for off).")
        object.__setattr__(self, "heartbeat_url", url)
        return self

    # feature:heartbeat:end
    @model_validator(mode="after")
    def _check_secrets(self) -> "Settings":
        """Refuse to start on secrets that would make every session forgeable
        or the admin account guessable. Placeholders from .env.example are
        rejected outright, in every environment."""
        secret = self.jwt_secret.strip()
        lowered = secret.lower()
        if len(secret) < MIN_JWT_SECRET or any(p in lowered for p in PLACEHOLDERS):
            raise ValueError(
                "jwt_secret (the secret file, or JWT_SECRET off Compose) must be a random value"
                f" of at least {MIN_JWT_SECRET} characters "
                '(e.g. `python -c "import secrets; print(secrets.token_urlsafe(48))"`).'
            )
        password = self.admin_password
        if len(password) < MIN_ADMIN_PASSWORD or any(p in password.lower() for p in PLACEHOLDERS):
            raise ValueError(
                "admin_password (the secret file, or ADMIN_PASSWORD off Compose) must be"
                f" at least {MIN_ADMIN_PASSWORD} characters "
                "and not a placeholder."
            )
        if self.is_production:
            object.__setattr__(self, "cookie_secure", True)
            object.__setattr__(self, "docs_enabled", False)
            object.__setattr__(self, "seed_enabled", False)
        return self

    @model_validator(mode="after")
    def _compose_database_url(self) -> "Settings":
        """Build DATABASE_URL from the POSTGRES_* parts when it is not set.

        removes the duplicated password. The URL is still the value the
        rest of the app uses, so nothing downstream changes.
        """
        if self.database_url:
            return self
        if not (self.postgres_user and self.postgres_password and self.postgres_db):
            raise ValueError(
                "Set DATABASE_URL, or POSTGRES_USER + POSTGRES_PASSWORD + POSTGRES_DB "
                "so it can be composed from them."
            )
        # quote() on the credentials: a password containing '@', ':' or '/'
        # would otherwise corrupt the URL it is embedded in.
        user = quote(self.postgres_user, safe="")
        password = quote(self.postgres_password, safe="")
        credentials = f"{user}:{password}"
        host = f"{self.postgres_host}:{self.postgres_port}"
        object.__setattr__(
            self,
            "database_url",
            f"postgresql+asyncpg://{credentials}@{host}/{self.postgres_db}",
        )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # validation errors are the fail-fast we want
