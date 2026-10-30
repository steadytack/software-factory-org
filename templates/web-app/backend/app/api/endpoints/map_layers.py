"""Map layers beyond sites: each site's latest survey, placed at its site.
Surveys have no position of their own. Add a layer per positioned entity."""

from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_subject
from app.core.database import SessionDep
from app.models.site import Site
from app.models.survey import Survey

router = APIRouter(prefix="/map", tags=["map"], dependencies=[Depends(get_current_subject)])

LIMIT = 10_000


class SurveyPoint(BaseModel):
    """A site's surveys, summarised by the latest one."""

    site_id: str
    site_name: str
    survey_id: str
    survey_date: date
    status: str
    survey_count: int
    latitude: float
    longitude: float


@router.get("/surveys", response_model=list[SurveyPoint])
async def survey_points(session: AsyncSession = SessionDep) -> list[SurveyPoint]:
    """One point per surveyed site with a position: its latest live survey
    (by date, then creation) and how many it has."""
    ranked = (
        select(
            Survey.id.label("survey_id"),
            Survey.site_id.label("site_id"),
            Survey.survey_date.label("survey_date"),
            Survey.status.label("status"),
            func.row_number()
            .over(
                partition_by=Survey.site_id,
                order_by=(Survey.survey_date.desc(), Survey.created_at.desc()),
            )
            .label("rank"),
            func.count().over(partition_by=Survey.site_id).label("survey_count"),
        )
        .where(Survey.live())
        .subquery()
    )
    rows = await session.execute(
        select(
            ranked.c.site_id,
            Site.name,
            ranked.c.survey_id,
            ranked.c.survey_date,
            ranked.c.status,
            ranked.c.survey_count,
            func.ST_Y(Site.location),
            func.ST_X(Site.location),
        )
        .join(Site, Site.id == ranked.c.site_id)
        .where(ranked.c.rank == 1, Site.location.is_not(None))
        .limit(LIMIT)
    )
    return [
        SurveyPoint(
            site_id=str(site_id),
            site_name=name,
            survey_id=str(survey_id),
            survey_date=when,
            status=st,
            survey_count=count,
            latitude=lat,
            longitude=lng,
        )
        for site_id, name, survey_id, when, st, count, lat, lng in rows.all()
    ]
