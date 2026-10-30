"""The app's daily jobs, run by the `scheduler` compose service.

Once a day at SCHEDULE_AT (default 07:00, in APP_TIMEZONE):

* the recycle-bin purge (app.purge_trash).

Add project jobs (e.g. notification sweeps that call services.notification.notify
for every active user) to `run_jobs`.

`NOTIFY_ONCE=1` runs the jobs once and exits (for a manual run or a test).
A failed run is logged and retried the next day; it never stops the loop.
"""

from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime, time, timedelta

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.core.logging import configure_logging, get_logger
from app.core.time import app_zone
from app.services.recycle_bin import purge_older_than

logger = get_logger(__name__)


def _run_at() -> time:
    hour, _, minute = os.environ.get("SCHEDULE_AT", "07:00").partition(":")
    return time(int(hour), int(minute or 0))


def seconds_until(run_at: time, now: datetime) -> float:
    """Seconds from `now` (aware) to the next `run_at` in the same zone.

    The difference is taken in UTC: subtracting two times that share a zone
    compares wall clocks, which is an hour out on the day the clocks change.
    """
    target = now.replace(hour=run_at.hour, minute=run_at.minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target.astimezone(UTC) - now.astimezone(UTC)).total_seconds()


async def run_jobs() -> dict[str, int]:
    async with SessionFactory() as session:
        purged = await purge_older_than(session, get_settings().trash_retention_days)
        await session.commit()
    result = {"purged": purged}
    logger.info("scheduled_jobs_done", **result)
    return result


async def main() -> int:
    configure_logging()
    if os.environ.get("NOTIFY_ONCE") == "1":
        print(await run_jobs())
        return 0
    while True:
        wait = seconds_until(_run_at(), datetime.now(app_zone()))
        logger.info("scheduler_sleeping", seconds=int(wait))
        await asyncio.sleep(wait)
        try:
            await run_jobs()
        except Exception:  # noqa: BLE001 — log and try again tomorrow
            logger.exception("scheduled_jobs_failed")


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
