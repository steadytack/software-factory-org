"""Outbound heartbeat: tell a dead-man's-switch service the app is up.

The app runs where nothing outside can reach it (ports bound to 127.0.0.1), so
an outside poller can't watch it. Instead the `scheduler` service, every
HEARTBEAT_EVERY_SECONDS, calls the backend's /api/health and, only on a 200,
sends a GET to HEARTBEAT_URL (a healthchecks.io check, an Uptime Kuma push
monitor). When the pings stop, that service alerts.

HEARTBEAT_URL empty means off: nothing is sent. HTTPS only, a 10 s timeout, a
GET with no body and a generic User-Agent. Failures are logged and swallowed;
logs name only the URL's host, never the full URL (it carries the check's key).
"""

from __future__ import annotations

import asyncio
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from app.core.config import Settings
from app.core.logging import get_logger

logger = get_logger(__name__)

TIMEOUT_SECONDS = 10
USER_AGENT = "heartbeat/1.0"


def host_of(url: str) -> str:
    return urlsplit(url).hostname or "?"


def ping(url: str) -> bool:
    """GET `url` once. True when it answered; never raises."""
    if not url:
        return False
    host = host_of(url)
    if urlsplit(url).scheme != "https":
        logger.warning("heartbeat_refused_not_https", host=host)
        return False
    request = Request(url, method="GET", headers={"User-Agent": USER_AGENT})  # noqa: S310 — https checked above
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310
            status = response.status
    except Exception as exc:  # noqa: BLE001 — a failed ping must never stop the app
        logger.warning("heartbeat_failed", host=host, error=type(exc).__name__)
        return False
    logger.info("heartbeat_sent", host=host, status=status)
    return True


def healthy(url: str) -> bool:
    """True only when the app's health check answers 200."""
    try:
        with urlopen(url, timeout=TIMEOUT_SECONDS) as response:  # noqa: S310 — internal health URL from settings
            return response.status == 200
    except Exception as exc:  # noqa: BLE001 — unreachable or 503 both mean "not healthy"
        logger.warning("heartbeat_app_unhealthy", error=type(exc).__name__)
        return False


def beat(settings: Settings) -> bool:
    """One heartbeat: ping only when on and the app is healthy."""
    if not settings.heartbeat_url:
        return False
    if not healthy(settings.heartbeat_health_url):
        return False
    return ping(settings.heartbeat_url)


async def run_forever(settings: Settings) -> None:
    if not settings.heartbeat_url:
        logger.info("heartbeat_off")
        return
    logger.info(
        "heartbeat_on",
        host=host_of(settings.heartbeat_url),
        every_seconds=settings.heartbeat_every_seconds,
    )
    while True:
        await asyncio.to_thread(beat, settings)
        await asyncio.sleep(settings.heartbeat_every_seconds)
