"""Seed the database with demo data for instant demos.

Usage: docker compose exec backend python -m app.seed

Goes through the **same path the API uses** (`*Create` schema → service →
repository), so seeded rows obey every validation rule, get changelog entries
(actor `"seed"`), and can't write values the API refuses.

* Every seeded row is marked `is_demo = true`, so demo data is distinguishable
  from real records.
* The seeder is **disabled by default**: enable it with `SEED_ENABLED=true`
  (it should stay false in production).
* It is idempotent per row: each demo site is skipped only if a site with that
  name already exists, so a partial seed completes.
"""

import asyncio
import random
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.core.logging import get_logger
from app.core.time import local_today
from app.models.site import Site
from app.repositories.site import SiteRepository
from app.repositories.survey import SurveyRepository
from app.schemas import enums
from app.schemas.site import SiteCreate
from app.schemas.survey import SurveyCreate
from app.services.site import SiteService
from app.services.survey import SurveyService

logger = get_logger(__name__)

# The actor recorded in the changelog for seeded rows — distinguishable from a
# real user and from the internal "system" actor.
SEED_ACTOR = "seed"


class SeedDisabledError(RuntimeError):
    """The seeder is not enabled in this deployment."""


SEED_SITES = [
    {
        "name": "Tower Bridge",
        "site_type": "bridge",
        "latitude": 51.5055,
        "longitude": -0.0754,
        "address": "Tower Bridge Rd, London",
    },
    {
        "name": "Westminster Bridge",
        "site_type": "bridge",
        "latitude": 51.5009,
        "longitude": -0.1220,
        "address": "Westminster, London",
    },
    {
        "name": "Tate Modern",
        "site_type": "building",
        "latitude": 51.5076,
        "longitude": -0.0994,
        "address": "Bankside, London",
    },
    {
        "name": "Barbican Centre",
        "site_type": "building",
        "latitude": 51.5209,
        "longitude": -0.0955,
        "address": "Silk St, London",
    },
    {
        "name": "Battersea Park Playground",
        "site_type": "playground",
        "latitude": 51.4785,
        "longitude": -0.1487,
        "address": "Battersea Park, London",
    },
    {
        "name": "Greenwich Outfall",
        "site_type": "outfall",
        "latitude": 51.4934,
        "longitude": 0.0096,
        "address": "Greenwich Peninsula, London",
    },
]

SURVEYORS = ["A. Surveyor", "B. Inspector", "C. Engineer"]
# Weighted towards completed, from the one vocabulary definition.
SURVEY_STATUSES = [*enums.SURVEY_STATUSES, "completed"]


@dataclass
class SeedCounts:
    """What the run created, for the log line and the HTTP response."""

    sites: int = 0
    sites_skipped: int = 0
    surveys: int = 0

    def summary(self) -> str:
        return (
            f"Seeded {self.sites} sites ({self.sites_skipped} already present), "
            f"{self.surveys} surveys."
        )


async def seed(session: AsyncSession | None = None) -> SeedCounts:
    """Seed the demo data and return what was created.

    `session` lets an HTTP caller (`POST /api/admin/reseed`) reuse the
    request's session and transaction, so seeding is one unit of work with the
    rest of the request; the CLI passes nothing and opens its own.
    """
    if not get_settings().seed_enabled:
        raise SeedDisabledError(
            "Demo seeding is disabled. Set SEED_ENABLED=true to enable it "
            "(it should stay false in production)."
        )

    if session is not None:
        counts = await _seed_into(session)
    else:
        async with SessionFactory() as own_session, own_session.begin():
            counts = await _seed_into(own_session)

    logger.info(
        "seed_completed",
        sites=counts.sites,
        sites_skipped=counts.sites_skipped,
        surveys=counts.surveys,
    )
    return counts


async def _seed_into(session: AsyncSession) -> SeedCounts:
    """The seeding itself, through the same schema → service → repository path
    the API uses."""
    counts = SeedCounts()
    rng = random.Random(42)
    # local_today(), not date.today(): every date calculation in the app is
    # anchored to APP_TIMEZONE, so a host-local seed date could land on the
    # wrong side of the day boundary.
    today = local_today()

    site_service = SiteService(SiteRepository(session), actor=SEED_ACTOR)
    survey_service = SurveyService(SurveyRepository(session), actor=SEED_ACTOR)

    for spec in SEED_SITES:
        # Matched on the NORMALISED name — the same key the unique index uses —
        # so a case or whitespace variant is recognised as already present
        # rather than causing a 409 halfway through.
        existing = await session.scalar(
            select(Site.id).where(func.lower(func.btrim(Site.name)) == spec["name"].strip().lower())
        )
        if existing is not None:
            counts.sites_skipped += 1
            continue

        site = await site_service.create(
            SiteCreate(
                name=spec["name"],
                site_type=spec["site_type"],
                status="active",
                address=spec["address"],
                notes=None,
                latitude=spec["latitude"],
                longitude=spec["longitude"],
            ),
            is_demo=True,
        )
        counts.sites += 1

        # 1–3 surveys per site over the last 3 weeks.
        for _ in range(rng.randint(1, 3)):
            await survey_service.create(
                SurveyCreate(
                    site_id=site.id,
                    surveyor=rng.choice(SURVEYORS),
                    survey_date=today - timedelta(days=rng.randint(0, 21)),
                    status=rng.choice(SURVEY_STATUSES),
                    summary=None,
                ),
                is_demo=True,
            )
            counts.surveys += 1

    return counts


async def _main() -> None:
    try:
        counts = await seed()
    except SeedDisabledError as exc:
        print(f"Seed skipped: {exc}")
        return
    print(counts.summary())


if __name__ == "__main__":
    asyncio.run(_main())
