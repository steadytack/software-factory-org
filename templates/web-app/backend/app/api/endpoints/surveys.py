"""Survey endpoints — built from the generic CRUD factory.

The list route keeps its site_id filter (declared via extra_list_params) so
the OpenAPI schema is unchanged from the pre-factory hand-written version.
"""

from datetime import date

from fastapi import Query

from app.api.endpoints.crud import make_crud_router
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
    },
)
