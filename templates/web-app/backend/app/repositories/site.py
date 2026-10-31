# Lazy annotations: these classes define a `list` method, which shadows the
# builtin in later annotations on Python 3.12 (`list[str]` would raise).
from __future__ import annotations

import uuid

from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Attachment, Comment
from app.models.site import Site
from app.models.survey import Survey
from app.repositories.base import contains


def _to_geometry(latitude: float | None, longitude: float | None) -> object:
    # Defence in depth for BUG-1: an explicit `null` latitude/longitude used
    # to reach `float(None)` here and raise a TypeError → HTTP 500. The
    # schema layer now rejects it with a 422 (see schemas/validators.py), but
    # this is the last line before the geometry is built, so it states the
    # precondition rather than trusting it.
    if latitude is None or longitude is None:
        raise ValueError("latitude and longitude are required and cannot be null")
    return from_shape(Point(longitude, latitude), srid=4326)


def _search(q: str):
    return or_(contains(Site.name, q), contains(Site.address, q), contains(Site.postcode, q))


class SiteRepository:
    """All storage access for Site lives here — no raw queries in services/endpoints."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        name: str,
        site_type: str,
        status: str,
        address: str | None,
        notes: str | None,
        latitude: float,
        longitude: float,
        *,
        is_demo: bool = False,
        postcode: str | None = None,
        client_id: uuid.UUID | None = None,
    ) -> Site:
        site = Site(
            # An offline create's id, chosen by the app (services/client_ids.py).
            **({"id": client_id} if client_id else {}),
            name=name,
            site_type=site_type,
            status=status,
            address=address,
            postcode=postcode,
            notes=notes,
            location=_to_geometry(latitude, longitude),
            is_demo=is_demo,
        )
        self._session.add(site)
        await self._session.flush()
        await self._session.refresh(site)
        return site

    async def get(self, site_id: uuid.UUID) -> Site | None:
        return await self._session.get(Site, site_id)

    async def list(
        self,
        offset: int = 0,
        limit: int = 50,
        site_type: str | None = None,
        status: str | None = None,
        q: str | None = None,
    ) -> tuple[list[Site], int]:
        # `site_type` and `status` had no server-side filter, so the
        # sites page could only narrow the page it had already fetched.
        conditions = [
            column == value
            for column, value in ((Site.site_type, site_type), (Site.status, status))
            if value is not None
        ]
        if q:
            conditions.append(_search(q))
        count_stmt = select(func.count()).select_from(Site)
        for condition in conditions:
            count_stmt = count_stmt.where(condition)
        total = await self._session.scalar(count_stmt) or 0
        stmt = select(Site)
        for condition in conditions:
            stmt = stmt.where(condition)
        result = await self._session.execute(
            # `id DESC` is a required tiebreaker, not a nicety: 12 of the 13
            # seeded sites share one created_at, so created_at alone makes
            # offset pagination nondeterministic.
            stmt.order_by(Site.created_at.desc(), Site.id.desc()).offset(offset).limit(limit)
        )
        return list(result.scalars().all()), int(total)

    async def update(self, site: Site, changes: dict) -> Site:
        for field, value in changes.items():
            if field in ("latitude", "longitude"):
                lat = value if field == "latitude" else to_shape(site.location).y
                lng = value if field == "longitude" else to_shape(site.location).x
                site.location = _to_geometry(lat, lng)
            else:
                setattr(site, field, value)
        await self._session.flush()
        await self._session.refresh(site)
        return site

    async def delete(self, site: Site) -> None:
        await self._session.delete(site)
        await self._session.flush()

    async def count_dependent_rows(self, site_id: uuid.UUID) -> int:
        """How many comments/attachments will go with this site and its
        surveys. The database removes them (real per-entity foreign keys with
        `ON DELETE CASCADE`); this only *reports* the count for the delete
        path's log. Changelog rows are intentionally kept — the audit trail
        survives record deletion.
        """
        survey_ids = (
            await self._session.scalars(select(Survey.id).where(Survey.site_id == site_id))
        ).all()
        entity_ids = [site_id, *survey_ids]
        total = 0
        for model in (Comment, Attachment):
            total += (
                await self._session.scalar(
                    select(func.count()).select_from(model).where(model.entity_id.in_(entity_ids))
                )
                or 0
            )
        return int(total)

    async def locations(
        self,
        limit: int,
        bbox: tuple[float, float, float, float] | None = None,
        q: str | None = None,
    ) -> tuple[list, int]:
        """Site points (no geometry decoding in Python: ST_X/ST_Y in SQL),
        optionally inside a lng/lat box. Returns (rows, total matching)."""
        conditions = []
        if bbox is not None:
            min_lng, min_lat, max_lng, max_lat = bbox
            conditions.append(
                func.ST_Intersects(
                    Site.location, func.ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
                )
            )
        if q:
            conditions.append(_search(q))
        count_stmt = select(func.count()).select_from(Site)
        stmt = select(
            Site.id,
            Site.name,
            Site.site_type,
            Site.status,
            Site.address,
            Site.postcode,
            func.ST_Y(Site.location),
            func.ST_X(Site.location),
        )
        for condition in conditions:
            stmt = stmt.where(condition)
            count_stmt = count_stmt.where(condition)
        total = await self._session.scalar(count_stmt) or 0
        rows = await self._session.execute(stmt.order_by(Site.name, Site.id).limit(limit))
        return list(rows.all()), int(total)

    async def _survey_ids(self, site_id: uuid.UUID) -> list:
        return list(
            (await self._session.scalars(select(Survey.id).where(Survey.site_id == site_id))).all()
        )

    async def cascade_counts(self, site_id: uuid.UUID) -> dict[str, int]:
        """What a delete of this site takes with it, for the changelog."""
        files = await self.attachment_paths(site_id)
        return {"surveys": len(await self._survey_ids(site_id)), "files": len(files)}

    async def attachment_paths(self, site_id: uuid.UUID) -> list[str]:
        """Stored file paths of every attachment on this site or its surveys."""
        survey_ids = await self._survey_ids(site_id)
        rows = await self._session.scalars(
            select(Attachment.stored_path).where(
                or_(Attachment.site_id == site_id, Attachment.survey_id.in_(survey_ids)),
                Attachment.stored_path.is_not(None),
            )
        )
        return [p for p in rows.all() if p]
