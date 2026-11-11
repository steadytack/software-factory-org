"""Backfill site postcodes and addresses from each site's pin.

Sites created before the postcode field existed (and every seeded demo site)
have a pin but no postcode, and often only a rough address. The site form now
derives the address from the pin by default; this brings existing rows in
line with that.

For each site:

* **postcode** — postcodes.io bulk reverse lookup (nearest postcode centroid
  within ``--radius`` metres, 100 pins per request). Only an *empty*
  postcode is ever filled.
* **address** — Nominatim reverse lookup, in the same "number road, locality,
  town" shape the browser uses (``shortAddress`` in
  ``frontend/src/components/map/utils/geocode.ts``). Nominatim's usage policy
  allows one request per second with an identifying User-Agent, so this part
  is throttled. An existing address is kept unless ``--overwrite-addresses``.

Writes go through ``SiteService`` as actor ``location-backfill``, so every
changed site gets a changelog entry saying what was filled.

## Usage

Dry run (the default — prints a before/after table and changes nothing):

    docker compose exec backend python -m app.backfill_locations

Write the changes:

    docker compose exec backend python -m app.backfill_locations --apply

Options: ``--overwrite-addresses`` (replace existing addresses too),
``--postcodes-only`` (skip Nominatim entirely).

Uses the standard library for HTTP, so it adds no runtime dependency.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
import urllib.parse
import urllib.request
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import SessionFactory
from app.core.logging import get_logger
from app.models.site import Site
from app.repositories.site import SiteRepository
from app.schemas.site import SiteUpdate
from app.services.site import SiteService, _to_read

logger = get_logger(__name__)

POSTCODES_IO = "https://api.postcodes.io/postcodes"
NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"
USER_AGENT = "location backfill (self-hosted site register)"  # after the app name
ACTOR = "location-backfill"
BATCH = 100  # postcodes.io bulk reverse limit

# (method, url, json body or None) -> parsed JSON. Injectable for tests.
Fetch = Callable[[str, str, Any], Awaitable[Any]]


async def http_json(method: str, url: str, body: Any = None) -> Any:
    def call() -> Any:
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(  # noqa: S310 — fixed https URLs above
            url,
            data=data,
            method=method,
            headers={
                "User-Agent": f"{get_settings().app_name} {USER_AGENT}",
                "Accept": "application/json",
                "Accept-Language": "en",
                **({"Content-Type": "application/json"} if data else {}),
            },
        )
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310
            return json.load(response)

    return await asyncio.to_thread(call)


def short_address(parts: dict[str, str], fallback: str = "") -> str:
    """Python twin of the frontend's ``shortAddress``: no postcode (it has
    its own field), locality then town, county only if nothing better."""
    out: list[str] = []
    if parts.get("house_number") and parts.get("road"):
        out.append(f"{parts['house_number']} {parts['road']}")
    elif parts.get("road"):
        out.append(parts["road"])
    locality = (
        parts.get("hamlet")
        or parts.get("village")
        or parts.get("suburb")
        or parts.get("neighbourhood")
    )
    if locality:
        out.append(locality)
    settlement = parts.get("town") or parts.get("city")
    if settlement and settlement != locality:
        out.append(settlement)
    if parts.get("county") and len(out) < 2:
        out.append(parts["county"])
    return ", ".join(out) or fallback


@dataclass
class Change:
    site_id: str
    name: str
    old_address: str | None
    new_address: str | None
    old_postcode: str | None
    new_postcode: str | None

    @property
    def fields(self) -> dict[str, str]:
        out = {}
        if self.new_address and self.new_address != self.old_address:
            out["address"] = self.new_address
        if self.new_postcode and self.new_postcode != self.old_postcode:
            out["postcode"] = self.new_postcode
        return out


async def lookup_postcodes(
    points: list[tuple[float, float]], radius: int, fetch: Fetch
) -> list[str | None]:
    """Nearest postcode for each (lat, lng), in order; None where postcodes.io
    has nothing within `radius` (offshore, outside GB)."""
    found: list[str | None] = []
    for start in range(0, len(points), BATCH):
        chunk = points[start : start + BATCH]
        body = {
            "geolocations": [
                {"latitude": lat, "longitude": lng, "radius": radius, "limit": 1}
                for lat, lng in chunk
            ]
        }
        try:
            data = await fetch("POST", POSTCODES_IO, body)
            results = data.get("result") or []
        except Exception as exc:  # noqa: BLE001 — report and carry on
            logger.warning("backfill_postcodes_failed", error=str(exc))
            results = []
        for i in range(len(chunk)):
            hits = (results[i].get("result") if i < len(results) else None) or []
            found.append(hits[0]["postcode"] if hits else None)
    return found


async def lookup_address(lat: float, lng: float, fetch: Fetch) -> tuple[str | None, str | None]:
    """(short address, postcode) at a pin from Nominatim, or (None, None)."""
    query = urllib.parse.urlencode(
        {"lat": lat, "lon": lng, "format": "json", "addressdetails": 1, "zoom": 18}
    )
    try:
        data = await fetch("GET", f"{NOMINATIM_REVERSE}?{query}", None)
    except Exception as exc:  # noqa: BLE001
        logger.warning("backfill_address_failed", error=str(exc), lat=lat, lng=lng)
        return None, None
    if not isinstance(data, dict) or "error" in data:
        return None, None
    parts = data.get("address") or {}
    return short_address(parts) or None, parts.get("postcode")


async def plan_changes(
    session: AsyncSession,
    *,
    overwrite_addresses: bool = False,
    postcodes_only: bool = False,
    radius: int = 200,
    fetch: Fetch = http_json,
    throttle: float = 1.0,
) -> list[Change]:
    sites = list((await session.execute(select(Site).order_by(Site.name))).scalars().all())
    reads = [_to_read(s) for s in sites]
    needs_postcode = [r for r in reads if not r.postcode]
    postcodes = await lookup_postcodes(
        [(r.latitude, r.longitude) for r in needs_postcode], radius, fetch
    )
    by_id = {r.id: pc for r, pc in zip(needs_postcode, postcodes, strict=True)}

    changes: list[Change] = []
    last_call = 0.0
    for read in reads:
        new_address: str | None = None
        new_postcode = by_id.get(read.id)
        wants_address = not postcodes_only and (overwrite_addresses or not read.address)
        if wants_address:
            wait = throttle - (time.monotonic() - last_call)
            if wait > 0:
                await asyncio.sleep(wait)
            last_call = time.monotonic()
            new_address, nominatim_postcode = await lookup_address(
                read.latitude, read.longitude, fetch
            )
            if not read.postcode and not new_postcode:
                new_postcode = nominatim_postcode
        if new_postcode:
            # Same tidy-up the API applies ("se12up" → "SE1 2UP").
            new_postcode = SiteUpdate(postcode=new_postcode).postcode
        change = Change(
            site_id=read.id,
            name=read.name,
            old_address=read.address,
            new_address=new_address,
            old_postcode=read.postcode,
            new_postcode=new_postcode,
        )
        if change.fields:
            changes.append(change)
    return changes


async def apply_changes(session: AsyncSession, changes: list[Change]) -> int:
    service = SiteService(SiteRepository(session), actor=ACTOR)
    for change in changes:
        await service.update(uuid.UUID(change.site_id), SiteUpdate(**change.fields))
    await session.commit()
    return len(changes)


def render(changes: list[Change]) -> str:
    if not changes:
        return "Every site already has what the pin would give it — nothing to do."
    lines = [f"{len(changes)} site(s) to update:"]
    for c in changes:
        lines.append(f"  {c.name}")
        if "postcode" in c.fields:
            lines.append(f"    postcode: {c.old_postcode or '—'}  →  {c.new_postcode}")
        if "address" in c.fields:
            lines.append(f"    address:  {c.old_address or '—'}  →  {c.new_address}")
    return "\n".join(lines)


async def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__ and __doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    parser.add_argument(
        "--overwrite-addresses",
        action="store_true",
        help="replace existing addresses with the pin-derived one (default: fill empty only)",
    )
    parser.add_argument(
        "--postcodes-only", action="store_true", help="only fill postcodes; skip Nominatim"
    )
    parser.add_argument(
        "--radius", type=int, default=200, help="postcode search radius in metres (max 2000)"
    )
    args = parser.parse_args(argv)

    async with SessionFactory() as session:
        changes = await plan_changes(
            session,
            overwrite_addresses=args.overwrite_addresses,
            postcodes_only=args.postcodes_only,
            radius=min(max(args.radius, 1), 2000),
        )
        print(render(changes))
        if not changes:
            return 0
        if not args.apply:
            print("\nDry run — nothing written. Re-run with --apply to save these.")
            return 0
        count = await apply_changes(session, changes)
        print(f"\nUpdated {count} site(s); each change is in the changelog as '{ACTOR}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
