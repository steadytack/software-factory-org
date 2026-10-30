from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.enums import SurveyStatusValue
from app.schemas.validators import (
    SUMMARY_MAX_LENGTH,
    ClientId,
    optional_text,
    required,
    required_text,
    required_text_update,
)


class SurveyCreate(BaseModel):
    id: ClientId = None
    site_id: str
    surveyor: required_text(200)  # type: ignore[valid-type]
    # Deliberately unbounded: a survey may be backdated, and forward-dating is
    # a scheduling case. The dashboard KPIs bound their *queries* instead (see
    # api/endpoints/stats.py), not the data.
    survey_date: date
    status: SurveyStatusValue = Field(default="draft")
    summary: optional_text(SUMMARY_MAX_LENGTH) = None  # type: ignore[valid-type]


class SurveyUpdate(BaseModel):
    surveyor: required_text_update(200) = None  # type: ignore[valid-type]
    survey_date: required(date) = None  # type: ignore[valid-type]
    status: required(SurveyStatusValue) = None  # type: ignore[valid-type]
    summary: optional_text(SUMMARY_MAX_LENGTH) = None  # type: ignore[valid-type]


class SurveyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    site_id: str
    surveyor: str
    survey_date: date
    status: str
    summary: str | None
    created_at: datetime
    updated_at: datetime
    # Context for cross-site views (the Surveys table): which site.
    site_name: str | None = None


class SurveyList(BaseModel):
    total: int
    items: list[SurveyRead]
