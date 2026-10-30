import uuid

from app.core.logging import get_logger
from app.core.storage import delete_after_commit
from app.models.site import Site
from app.repositories.site import SiteRepository
from app.schemas.site import (
    SiteCreate,
    SiteList,
    SiteLocation,
    SiteLocationList,
    SiteRead,
    SiteUpdate,
)
from app.services.changelog import diff, record_change
from app.services.client_ids import existing_for_client_id

logger = get_logger(__name__)


def _to_read(site) -> SiteRead:
    from geoalchemy2.shape import to_shape

    point = to_shape(site.location)
    return SiteRead(
        id=str(site.id),
        name=site.name,
        site_type=site.site_type,
        status=site.status,
        address=site.address,
        postcode=site.postcode,
        notes=site.notes,
        latitude=point.y,
        longitude=point.x,
        created_at=site.created_at,
        updated_at=site.updated_at,
    )


class SiteService:
    """Business logic for Site — no HTTP concerns, no storage access."""

    def __init__(self, repository: SiteRepository, actor: str = "system") -> None:
        self._repo = repository
        self._actor = actor

    async def create(self, data: SiteCreate, *, is_demo: bool = False) -> SiteRead:
        """Create one site. `is_demo` marks seeder-written rows."""
        # A replayed offline create (same client id) returns what was saved.
        existing = await existing_for_client_id(self._repo._session, Site, data.id)
        if existing is not None:
            return _to_read(existing)
        site = await self._repo.create(
            client_id=data.id,
            name=data.name,
            site_type=data.site_type,
            status=data.status,
            address=data.address,
            postcode=data.postcode,
            notes=data.notes,
            latitude=data.latitude,
            longitude=data.longitude,
            is_demo=is_demo,
        )
        await record_change(
            self._repo._session,
            entity="site",
            entity_id=str(site.id),
            action="created",
            actor=self._actor,
            summary=f'Created site "{site.name}" ({site.site_type})',
        )
        logger.info("site_created", site_id=str(site.id))
        return _to_read(site)

    async def get(self, site_id: uuid.UUID) -> SiteRead | None:
        site = await self._repo.get(site_id)
        return _to_read(site) if site else None

    async def list(
        self,
        offset: int = 0,
        limit: int = 50,
        site_type: str | None = None,
        status: str | None = None,
        q: str | None = None,
    ) -> SiteList:
        sites, total = await self._repo.list(
            offset=offset, limit=limit, site_type=site_type, status=status, q=q
        )
        return SiteList(total=total, items=[_to_read(s) for s in sites])

    async def locations(
        self,
        limit: int,
        bbox: tuple[float, float, float, float] | None = None,
        q: str | None = None,
    ) -> SiteLocationList:
        rows, total = await self._repo.locations(limit=limit, bbox=bbox, q=q)
        items = [
            SiteLocation(
                id=str(sid),
                name=name,
                site_type=site_type,
                status=status,
                address=address,
                postcode=postcode,
                latitude=lat,
                longitude=lng,
            )
            for sid, name, site_type, status, address, postcode, lat, lng in rows
        ]
        return SiteLocationList(total=total, complete=len(items) >= total, items=items)

    async def update(self, site_id: uuid.UUID, data: SiteUpdate) -> SiteRead | None:
        site = await self._repo.get(site_id)
        if site is None:
            return None
        # exclude_unset only — explicit nulls clear fields (audit F4).
        changes = data.model_dump(exclude_unset=True)
        current = _to_read(site)
        before = {field: getattr(current, field, None) for field in changes}
        updated = await self._repo.update(site, changes)
        fields = ", ".join(sorted(changes.keys()))
        await record_change(
            self._repo._session,
            entity="site",
            entity_id=str(site_id),
            action="updated",
            actor=self._actor,
            summary=f'Updated {fields} on "{updated.name}"',
            changes=diff(before, changes),
        )
        logger.info("site_updated", site_id=str(site_id))
        return _to_read(updated)

    async def delete(self, site_id: uuid.UUID) -> bool:
        site = await self._repo.get(site_id)
        if site is None:
            return False
        name = site.name
        # Comments and attachments cascade in the DATABASE (real FKs) — for
        # every parent, not just a site. Counted first purely so the delete is
        # logged truthfully.
        # Changelog rows are intentionally kept: the audit trail survives
        # record deletion.
        entity_id = str(site_id)
        dependents = await self._repo.count_dependent_rows(site_id)
        counts = await self._repo.cascade_counts(site_id)
        # The database cascades the attachment ROWS; the files on disk are
        # ours to remove, and only once the delete has actually committed.
        delete_after_commit(self._repo._session, await self._repo.attachment_paths(site_id))
        await self._repo.delete(site)
        removed = ", ".join(f"{n} {label}" for label, n in counts.items() if n)
        await record_change(
            self._repo._session,
            entity="site",
            entity_id=entity_id,
            action="deleted",
            actor=self._actor,
            summary=f'Deleted site "{name}"' + (f" with {removed}" if removed else ""),
        )
        logger.info("site_deleted", site_id=entity_id, dependent_rows_cascaded=dependents)
        return True
