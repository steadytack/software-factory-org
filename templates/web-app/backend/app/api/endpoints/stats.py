"""Dashboard aggregate endpoint.

Computes the KPI numbers the dashboard needs in a handful of SQL aggregates
instead of the frontend fetching up to 200 rows of each entity and counting
client-side (which silently showed wrong numbers past the page cap).
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_subject
from app.core.database import SessionDep
from app.core.time import local_today
from app.models.site import Site
from app.models.survey import Survey
from app.schemas.enums import SURVEY_STATUSES

# Reads require authentication.
router = APIRouter(
    prefix="/stats",
    tags=["stats"],
    dependencies=[Depends(get_current_subject)],
)


class DashboardStats(BaseModel):
    total_sites: int
    total_surveys: int
    draft_surveys: int
    surveys_this_week: int
    surveys_prev_week: int
    surveys_per_day: dict[str, int]
    surveys_by_status: dict[str, int]


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard_stats(
    days: int = Query(default=7, ge=1, le=31),
    session: AsyncSession = SessionDep,
) -> DashboardStats:
    """Aggregate KPIs for the dashboard. All counts are computed in SQL so
    they are correct regardless of how many rows exist (no page-cap bias)."""
    # "Today" is the app-timezone date everywhere (core/time.py), so the
    # week window matches the dates people entered, not the container's TZ.
    today = local_today()
    week_start = today - timedelta(days=days - 1)
    prev_week_start = week_start - timedelta(days=days)

    total_sites = await session.scalar(select(func.count()).select_from(Site)) or 0

    # Both week windows are bounded at BOTH ends. Future-dated surveys stay
    # legal (a scheduled visit is a real thing); they simply do not count
    # towards "this week" until that week arrives, so the KPI, the week-over-
    # week delta and the per-day chart can never disagree.
    surveys_this_week = await _count_surveys(
        session, Survey.survey_date >= week_start, Survey.survey_date <= today
    )
    surveys_prev_week = await _count_surveys(
        session, Survey.survey_date >= prev_week_start, Survey.survey_date < week_start
    )

    # Surveys per day for the trend chart (last `days` days, zero-filled).
    if session.bind.dialect.name == "sqlite":
        # Tests may run on sqlite via aiosqlite; strftime fallback.
        day_expr = func.strftime("%Y-%m-%d", Survey.survey_date)
    else:
        day_expr = func.to_char(Survey.survey_date, "YYYY-MM-DD")
    rows = await session.execute(
        select(day_expr, func.count())
        .where(Survey.survey_date >= week_start, Survey.survey_date <= today, Survey.live())
        .group_by(day_expr)
    )
    counts_by_day = {str(d): int(c) for d, c in rows.all()}
    per_day = {
        (today - timedelta(days=days - 1 - i)).isoformat(): counts_by_day.get(
            (today - timedelta(days=days - 1 - i)).isoformat(), 0
        )
        for i in range(days)
    }

    # By status, in the vocabulary's DECLARED order with explicit zeros, so the
    # chart has a stable axis rather than whatever order GROUP BY returns.
    status_rows = await session.execute(
        select(Survey.status, func.count()).where(Survey.live()).group_by(Survey.status)
    )
    counts_by_status = {str(s): int(n) for s, n in status_rows.all()}
    by_status = {s: counts_by_status.get(s, 0) for s in SURVEY_STATUSES}

    return DashboardStats(
        total_sites=int(total_sites),
        total_surveys=sum(by_status.values()),
        draft_surveys=by_status["draft"],
        surveys_this_week=surveys_this_week,
        surveys_prev_week=surveys_prev_week,
        surveys_per_day=per_day,
        surveys_by_status=by_status,
    )


async def _count_surveys(session: AsyncSession, *conditions) -> int:
    stmt = select(func.count()).select_from(Survey).where(*conditions, Survey.live())
    return int(await session.scalar(stmt) or 0)
