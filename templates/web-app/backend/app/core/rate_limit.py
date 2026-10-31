"""DB-backed rate limiting for login attempts.

Failures are persisted in the `login_failures` table so the brute-force
window survives process restarts and is shared across workers. Each failed
attempt writes two rows, one per bucket:

* ``ip:<address>`` — every failure from one client address, whatever email
  it tried. Caps password spraying (one IP, many accounts) and credential
  stuffing. Over the limit, that IP is refused outright (429).
* ``acct:<email>`` — every failure against one account, from anywhere.
  Over the limit the account is "under attack", but it is **not** locked
  for everyone: the old ``ip:email`` key let anyone lock the real user out
  by typing five wrong passwords. Instead a locked account only admits a
  login from a *clean* address — one with no failures against that account
  in the window — so the attacker's own address stays blocked while the
  real user signs in normally.

``client_ip`` is ``request.client.host``. Behind nginx that is only the real
client address when uvicorn runs with ``--proxy-headers`` and nginx
*overwrites* ``X-Forwarded-For`` with ``$remote_addr`` (docker-compose.yml,
docker/nginx.conf); otherwise every client shares nginx's address.

Rows older than WINDOW_SECONDS are pruned lazily (at most once a minute) on
failure records, so the table stays small without a scheduled job.
"""

import time
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.rate_limit import LoginFailure

MAX_ATTEMPTS = 5  # per account, and per (address, account) pair
MAX_IP_ATTEMPTS = 20  # per address, across all accounts
WINDOW_SECONDS = 300  # 5 minutes
LOCKOUT_SECONDS = 300

# Prune passes are throttled: we don't want a DELETE on every failed login.
_PRUNE_EVERY_SECONDS = 60
_last_prune: float = 0.0

TOO_MANY = "Too many login attempts. Try again later."


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _email(email: str | None) -> str:
    return (email or "-").strip().lower()


def _ip_key(request: Request) -> str:
    return f"ip:{client_ip(request)}"


def _account_key(email: str | None) -> str:
    return f"acct:{_email(email)}"


def _pair_key(request: Request, email: str | None) -> str:
    return f"pair:{client_ip(request)}:{_email(email)}"


def _cutoff() -> datetime:
    return datetime.now(UTC) - timedelta(seconds=WINDOW_SECONDS)


async def _count(session: AsyncSession, key: str) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(LoginFailure)
        .where(LoginFailure.client_key == key, LoginFailure.created_at > _cutoff())
    )
    return int(count or 0)


async def check_rate_limit(session: AsyncSession, request: Request, email: str | None) -> None:
    """Before the password is checked: refuse a noisy address outright, and
    refuse an address that has itself been failing against this account.
    Records nothing — recording happens only on failure."""
    if await _count(session, _ip_key(request)) >= MAX_IP_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY)
    if await _count(session, _pair_key(request, email)) >= MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, TOO_MANY)


async def account_locked(session: AsyncSession, email: str | None) -> bool:
    """True when the account has had MAX_ATTEMPTS failures from anywhere in
    the window. Callers still let a *correct* password through from a clean
    address; a wrong one gets 429 rather than 401, so a locked account gives
    a distributed guesser no signal beyond "keep waiting"."""
    return await _count(session, _account_key(email)) >= MAX_ATTEMPTS


async def record_failure(session: AsyncSession, request: Request, email: str | None) -> None:
    global _last_prune  # noqa: PLW0603 -- a per-process prune timer; losing it on restart only prunes early
    # Insert + (throttled) prune run in the request's active transaction; the
    # single commit below persists them. The commit must happen here — the
    # caller raises 401 immediately after, and the request-scoped transaction
    # would roll the row back on unwind.
    # NOTE: this commits the WHOLE request transaction early. Callers must not
    # rely on request-scoped rollback for anything written before a failure —
    # today login writes nothing else, but keep that true if it changes.
    for key in (_ip_key(request), _account_key(email), _pair_key(request, email)):
        session.add(LoginFailure(client_key=key[:300]))
    # Opportunistic prune, at most once a minute: delete everything older
    # than the window regardless of key.
    now = time.monotonic()
    if now - _last_prune >= _PRUNE_EVERY_SECONDS:
        _last_prune = now
        await session.execute(delete(LoginFailure).where(LoginFailure.created_at < _cutoff()))
    await session.commit()


async def record_success(session: AsyncSession, request: Request, email: str | None) -> None:
    """A correct password clears this account's failures and this address's
    record against it. The address bucket is left alone: one good login must
    not reset a sprayer's count across other accounts."""
    await session.execute(
        delete(LoginFailure).where(
            LoginFailure.client_key.in_([_account_key(email), _pair_key(request, email)])
        )
    )
