import uuid
from collections.abc import Sequence
from datetime import date

from sqlalchemy import func, or_, select

from app.core.table_query import TableQuery
from app.models.site import Site
from app.models.survey import Survey
from app.repositories.base import Repository, contains
from app.schemas.enums import SurveyStatusValue

# The site's name, for sorting and filtering surveys by their site.
_SITE_NAME = select(Site.name).where(Site.id == Survey.site_id).scalar_subquery()

# What a managed table in server mode may sort and filter the survey list by (core/table_query.py).
SURVEY_QUERY = TableQuery(
    sortable={
        "survey_date": Survey.survey_date,
        "site_name": _SITE_NAME,
        "surveyor": Survey.surveyor,
        "status": Survey.status,
        "summary": Survey.summary,
        "created_at": Survey.created_at,
        "updated_at": Survey.updated_at,
    },
    select={"status": Survey.status},
    text={"site_name": _SITE_NAME, "surveyor": Survey.surveyor, "summary": Survey.summary},
    date={
        "survey_date": Survey.survey_date,
        "created_at": Survey.created_at,
        "updated_at": Survey.updated_at,
    },
)


class SurveyRepository(Repository):
    """All storage access for Survey lives here — no raw queries in services/endpoints."""

    model = Survey
    filter_columns = {"site_id": Survey.site_id}
    order_by = Survey.survey_date.desc()

    async def list(
        self,
        offset: int = 0,
        limit: int = 50,
        site_id: uuid.UUID | None = None,
        status: SurveyStatusValue | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        q: str | None = None,
        sort: str | None = None,
        where: list[str] | None = None,
    ) -> tuple[list[Survey], int]:
        """Server-side filters: parent `site_id`, `status`, a `survey_date`
        range and free text — so narrowing never happens client-side over one
        fetched page."""
        stmt = select(Survey)
        count_stmt = select(func.count()).select_from(Survey)
        conditions = [Survey.live()]
        if site_id is not None:
            conditions.append(Survey.site_id == site_id)
        if status is not None:
            conditions.append(Survey.status == status)
        # Both bounds inclusive. survey_date is unbounded as *data*, so
        # `date_to` is the caller's tool for excluding future-dated rows.
        if date_from is not None:
            conditions.append(Survey.survey_date >= date_from)
        if date_to is not None:
            conditions.append(Survey.survey_date <= date_to)
        if q:
            # Free-text: surveyor, summary, or the parent site's name.
            site_ids = select(Site.id).where(contains(Site.name, q))
            conditions.append(
                or_(
                    contains(Survey.surveyor, q),
                    contains(Survey.summary, q),
                    Survey.site_id.in_(site_ids),
                )
            )
        # A managed table's own sort and filters (server mode), over SURVEY_QUERY's allow-list.
        conditions += SURVEY_QUERY.where(where)
        for condition in conditions:
            stmt = stmt.where(condition)
            count_stmt = count_stmt.where(condition)
        total = await self._session.scalar(count_stmt) or 0
        result = await self._session.execute(
            stmt.order_by(*SURVEY_QUERY.order(sort, self.stable_order(Survey.survey_date.desc())))
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all()), int(total)

    async def site_names(self, surveys: Sequence[Survey]) -> dict[uuid.UUID, str]:
        """Site names for a page of surveys, in one query rather than one per row."""
        if not surveys:
            return {}
        site_ids = {s.site_id for s in surveys}
        rows = await self._session.execute(select(Site.id, Site.name).where(Site.id.in_(site_ids)))
        return dict(rows.all())
