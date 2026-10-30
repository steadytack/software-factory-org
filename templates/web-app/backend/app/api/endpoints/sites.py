import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.search import clean_search
from app.core.auth import (
    get_current_subject,
    require_admin,
    require_admin_optional,
    require_editor,
)
from app.core.database import SessionDep
from app.repositories.site import SiteRepository
from app.schemas.enums import SiteStatusValue, SiteTypeValue
from app.schemas.site import (
    SiteCreate,
    SiteList,
    SiteLocationList,
    SiteRead,
    SiteUpdate,
)
from app.services.site import SiteService

# Reads require authentication; create/update need an editor,
# delete needs an admin (per-route below).
router = APIRouter(
    prefix="/sites",
    tags=["sites"],
    dependencies=[Depends(get_current_subject)],
)


def get_service(
    session=SessionDep,
    actor: str = Depends(require_admin_optional),
) -> SiteService:
    return SiteService(SiteRepository(session), actor=actor)


@router.post("", response_model=SiteRead, status_code=status.HTTP_201_CREATED)
async def create_site(
    data: SiteCreate,
    service: SiteService = Depends(get_service),
    _writer: str = Depends(require_editor),
) -> SiteRead:
    return await service.create(data)


@router.get("", response_model=SiteList)
async def list_sites(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    # server-side filters, so narrowing is not limited to the rows the
    # browser has already fetched.
    site_type: SiteTypeValue | None = Query(default=None),
    status: SiteStatusValue | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200, description="Name, address or postcode"),
    service: SiteService = Depends(get_service),
) -> SiteList:
    # Reads require authentication (router-level dependency above); writes
    # require a role (per-route). No special handling needed here.
    return await service.list(
        offset=offset, limit=limit, site_type=site_type, status=status, q=clean_search(q)
    )


# Enough for any realistic portfolio in one response; `complete` says when
# it isn't, so a caller never silently shows a subset.
GEO_LIMIT = 10_000


def _parse_bbox(bbox: str | None) -> tuple[float, float, float, float] | None:
    if not bbox:
        return None
    try:
        min_lng, min_lat, max_lng, max_lat = (float(v) for v in bbox.split(","))
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "bbox must be minLng,minLat,maxLng,maxLat"
        ) from exc
    if not (-180 <= min_lng <= max_lng <= 180 and -90 <= min_lat <= max_lat <= 90):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "bbox is out of range")
    return min_lng, min_lat, max_lng, max_lat


# Declared before /{site_id} so "geo" isn't parsed as a site id.
@router.get("/geo", response_model=SiteLocationList)
async def site_locations(
    bbox: str | None = Query(default=None, description="minLng,minLat,maxLng,maxLat"),
    q: str | None = Query(default=None, max_length=200),
    service: SiteService = Depends(get_service),
) -> SiteLocationList:
    """Every site as a point (up to GEO_LIMIT): the map, search and site
    pickers need all of them, not the first page of 200."""
    return await service.locations(limit=GEO_LIMIT, bbox=_parse_bbox(bbox), q=clean_search(q))


@router.get("/{site_id}", response_model=SiteRead)
async def get_site(
    site_id: uuid.UUID,
    service: SiteService = Depends(get_service),
) -> SiteRead:
    site = await service.get(site_id)
    if site is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return site


@router.patch("/{site_id}", response_model=SiteRead)
async def update_site(
    site_id: uuid.UUID,
    data: SiteUpdate,
    service: SiteService = Depends(get_service),
    _writer: str = Depends(require_editor),
) -> SiteRead:
    site = await service.update(site_id, data)
    if site is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
    return site


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_site(
    site_id: uuid.UUID,
    service: SiteService = Depends(get_service),
    _admin: str = Depends(require_admin),
) -> None:
    if not await service.delete(site_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Site not found")
