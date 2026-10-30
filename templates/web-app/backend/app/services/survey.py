import uuid

from app.models.site import Site
from app.repositories.survey import SurveyRepository
from app.schemas.survey import SurveyCreate, SurveyList, SurveyRead
from app.services.base import CrudService, ParentNotFoundError


def _to_read(survey) -> SurveyRead:
    return SurveyRead(
        id=str(survey.id),
        site_id=str(survey.site_id),
        surveyor=survey.surveyor,
        survey_date=survey.survey_date,
        status=survey.status,
        summary=survey.summary,
        created_at=survey.created_at,
        updated_at=survey.updated_at,
    )


class SurveyService(CrudService[SurveyRead, SurveyList]):
    """Business logic for Survey — no HTTP concerns, no storage access."""

    entity = "survey"
    list_schema = SurveyList

    def __init__(self, repository: SurveyRepository, actor: str = "system") -> None:
        super().__init__(repository, actor=actor)

    def _to_read(self, survey) -> SurveyRead:
        return _to_read(survey)

    async def _read_many(self, surveys: list) -> list[SurveyRead]:
        names = await self._repo.site_names(surveys)
        return [
            _to_read(survey).model_copy(update={"site_name": names.get(survey.site_id)})
            for survey in surveys
        ]

    def _create_fields(self, data: SurveyCreate) -> dict:
        return {
            "site_id": uuid.UUID(data.site_id),
            "surveyor": data.surveyor,
            "survey_date": data.survey_date,
            "status": data.status,
            "summary": data.summary,
        }

    def _create_summary(self, survey) -> str:
        return f"Recorded {survey.status} survey by {survey.surveyor} on {survey.survey_date}"

    def _update_summary(self, survey, fields: str) -> str:
        return f"Updated {fields} on survey of {survey.survey_date}"

    def _delete_summary(self, survey) -> str:
        return f"Deleted survey of {survey.survey_date}"

    async def _attachment_paths(self, obj) -> list[str]:
        from app.repositories.attachment_paths import paths_under

        return await paths_under(self._repo._session, "survey", obj.id)

    async def create(self, data: SurveyCreate, *, is_demo: bool = False) -> SurveyRead:
        # Parent validation (FK check) before the generic create.
        site_id = uuid.UUID(data.site_id)
        if await self._repo._session.get(Site, site_id) is None:
            raise ParentNotFoundError(f"Site {data.site_id} not found")
        return await super().create(data, is_demo=is_demo)
