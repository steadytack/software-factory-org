"""Permanently delete recycle-bin items older than TRASH_RETENTION_DAYS.

Run daily by the scheduler service (docker-compose.yml), or by hand:

    docker compose exec -T backend python -m app.purge_trash [--days N]
"""

from __future__ import annotations

import argparse
import asyncio

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.services.recycle_bin import purge_older_than


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__ and __doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=get_settings().trash_retention_days)
    args = parser.parse_args(argv)
    async with SessionFactory() as session:
        purged = await purge_older_than(session, max(args.days, 0))
        await session.commit()
    print(f"Purged {purged} recycle-bin item(s) older than {args.days} day(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
