"""Survey endpoints — built from the generic CRUD factory.

The list route keeps its site_id filter (declared via extra_list_params) so
the OpenAPI schema is unchanged from the pre-factory hand-written version.
"""

import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Response

from app.api.endpoints.crud import make_crud_router
from app.api.search import clean_search
from app.core.auth import get_current_subject
from app.core.csvsafe import BOM, safe_csv_text
from app.core.database import SessionDep
from app.repositories.survey import SurveyRepository
from app.schemas.enums import SurveyStatusValue
from app.schemas.survey import SurveyCreate, SurveyList, SurveyRead, SurveyUpdate
from app.services.survey import SurveyService


def _service_factory(session, actor: str) -> SurveyService:
    return SurveyService(SurveyRepository(session), actor=actor)


router = make_crud_router(
    prefix="/surveys",
    tags=["surveys"],
    service_factory=_service_factory,
    read_schema=SurveyRead,
    list_schema=SurveyList,
    create_schema=SurveyCreate,
    update_schema=SurveyUpdate,
    entity_label="Survey",
    # status + survey_date range added to the one parent-id filter.
    extra_list_params={
        "site_id": (Query(default=None), "site_id"),
        "status": (Query(default=None), "status", SurveyStatusValue | None),
        "date_from": (Query(default=None), "date_from", date | None),
        "date_to": (Query(default=None), "date_to", date | None),
        "q": (Query(default=None, max_length=200), "q", str | None),
        # A managed table in server mode (repositories/survey.py, SURVEY_QUERY):
        # sort=field:asc|desc and one where=field:operator:value per filter.
        "sort": (Query(default=None, max_length=100), "sort", str | None),
        "where": (Query(default=[], max_length=20), "where", list[str]),
    },
)


# ── The list as CSV, for a managed table in server mode ──────────────────────
# Every survey matching the table's search, sort and filters, not one page. A
# path of its own (not /surveys/...), so the CRUD router's /surveys/{id} does
# not take it.

CSV_LIMIT = 50_000
CSV_PAGE = 1_000

csv_router = APIRouter(tags=["surveys"], dependencies=[Depends(get_current_subject)])


@csv_router.get("/surveys.csv", response_class=Response)
async def surveys_csv(
    session=SessionDep,
    site_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None, max_length=200),
    sort: str | None = Query(default=None, max_length=100),
    where: list[str] = Query(default=[], max_length=20),
) -> Response:
    repo = SurveyRepository(session)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Date", "Site", "Surveyor", "Status", "Summary", "Added", "Updated"])
    offset = 0
    while offset < CSV_LIMIT:
        page, total = await repo.list(
            offset=offset,
            limit=CSV_PAGE,
            site_id=site_id,
            q=clean_search(q),
            sort=sort,
            where=where,
        )
        names = await repo.site_names(page)
        for s in page:
            writer.writerow(
                [
                    s.survey_date.isoformat(),
                    safe_csv_text(names.get(s.site_id, "")),
                    safe_csv_text(s.surveyor),
                    s.status,
                    safe_csv_text(s.summary or ""),
                    s.created_at.isoformat(),
                    s.updated_at.isoformat(),
                ]
            )
        offset += CSV_PAGE
        if offset >= total:
            break
    return Response(
        BOM + out.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="surveys.csv"'},
    )
