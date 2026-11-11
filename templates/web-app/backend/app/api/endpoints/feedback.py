"""Help → Report or suggest.

`POST /feedback` takes a report from any signed-in user (viewers included):
kind, summary, details, the browser's diagnostics and an optional
screenshot (a data URL, so an offline report can wait in the outbox as
plain JSON). The reporter is the session's user — never the request body.

`GET /feedback/config` tells the form which types are on and where each
goes (email or kept in the app); only admins see the addresses.

Admin routes set where each type goes, send a test email and list reports
(with their screenshots).
"""

import json
import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import effective_role, get_current_subject, require_admin
from app.core.database import SessionDep
from app.core.storage import is_within_root
from app.models.feedback import FeedbackReport
from app.models.user import User
from app.schemas.validators import optional_text, required_text
from app.services import feedback as svc
from app.services.mailer import MailError, smtp_configured

router = APIRouter(tags=["feedback"])
admin_router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

FeedbackKind = Literal["bug", "confusing", "idea", "other"]
RouteName = Literal["problem", "suggestion", "question"]
Destination = Literal["email", "store", "off"]


class FeedbackCreate(BaseModel):
    kind: FeedbackKind = "bug"
    summary: required_text(150)  # type: ignore[valid-type]
    details: optional_text(5000) = None  # type: ignore[valid-type]
    # Page, browser, device, recent errors — see frontend lib/diagnostics.ts.
    context: dict[str, Any] = Field(default_factory=dict)
    # data:image/png|jpeg;base64,… (≤ 5 MB decoded)
    screenshot: str | None = Field(default=None, max_length=7_500_000)

    @field_validator("context")
    @classmethod
    def _context_size(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, default=str)) > svc.MAX_CONTEXT_CHARS:
            raise ValueError("context is too large")
        return value


class FeedbackResult(BaseModel):
    id: str
    emailed: bool
    message: str


class FeedbackRead(BaseModel):
    id: str
    kind: str
    summary: str
    details: str | None
    reporter_email: str
    reporter_role: str
    context: dict[str, Any]
    has_screenshot: bool
    emailed: bool
    email_error: str | None
    created_at: datetime


class FeedbackList(BaseModel):
    total: int
    items: list[FeedbackRead]


def _checked_email(value: str) -> str:
    value = value.strip()
    if value and not svc.valid_email(value):
        raise ValueError("Enter one email address, e.g. support@example.com")
    return value


class FeedbackRoute(BaseModel):
    """Where one type of report goes. `address` is only used for email;
    empty means the default address (`feedback_email`)."""

    destination: Destination
    address: str = Field(default="", max_length=200)

    @field_validator("address")
    @classmethod
    def _address(cls, value: str) -> str:
        return _checked_email(value)


class FeedbackRoutes(BaseModel):
    problem: FeedbackRoute
    suggestion: FeedbackRoute
    question: FeedbackRoute


class FeedbackSettings(BaseModel):
    feedback_email: str
    smtp_configured: bool
    routes: FeedbackRoutes


class FeedbackSettingsUpdate(BaseModel):
    """Either part can be left out to keep it as it is."""

    feedback_email: str | None = Field(default=None, max_length=200)
    routes: FeedbackRoutes | None = None

    @field_validator("feedback_email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return None if value is None else _checked_email(value)


class FeedbackTypeConfig(BaseModel):
    """One type the form offers. `destination` is where it actually goes:
    `email` only when it will be emailed (an address and SMTP are set),
    otherwise `store`. `address` is filled for admins only."""

    type: RouteName
    kind: FeedbackKind
    destination: Literal["email", "store"]
    address: str | None = None


class FeedbackConfig(BaseModel):
    types: list[FeedbackTypeConfig]


@router.get("/feedback/config", response_model=FeedbackConfig)
async def feedback_config(
    session: AsyncSession = SessionDep,
    subject: str = Depends(get_current_subject),
) -> FeedbackConfig:
    user = (await session.execute(select(User).where(User.email == subject))).scalar_one_or_none()
    is_admin = effective_role(user) == "admin"
    types: list[FeedbackTypeConfig] = []
    for name, route in (await svc.get_routes(session)).items():
        if route.destination == "off":
            continue
        address = await svc.route_address(session, route) if route.destination == "email" else ""
        emailed = bool(address) and smtp_configured()
        types.append(
            FeedbackTypeConfig(
                type=name,  # type: ignore[arg-type]
                kind=svc.KIND_FOR_ROUTE[name],  # type: ignore[arg-type]
                destination="email" if emailed else "store",
                address=address if emailed and is_admin else None,
            )
        )
    return FeedbackConfig(types=types)


@router.post("/feedback", response_model=FeedbackResult, status_code=status.HTTP_201_CREATED)
async def send_feedback(
    data: FeedbackCreate,
    session: AsyncSession = SessionDep,
    subject: str = Depends(get_current_subject),
) -> FeedbackResult:
    user = (await session.execute(select(User).where(User.email == subject))).scalar_one_or_none()
    try:
        report = await svc.submit(
            session,
            kind=data.kind,
            summary=data.summary,
            details=data.details,
            context=data.context,
            screenshot_data_url=data.screenshot,
            reporter_email=subject,
            reporter_role=effective_role(user),
        )
    except svc.TooManyReports as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc)) from exc
    except svc.FeedbackError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return FeedbackResult(
        id=str(report.id),
        emailed=report.emailed,
        message="Sent to the team." if report.emailed else "Saved for the admins.",
    )


def _read(r: FeedbackReport) -> FeedbackRead:
    return FeedbackRead(
        id=str(r.id),
        kind=r.kind,
        summary=r.summary,
        details=r.details,
        reporter_email=r.reporter_email,
        reporter_role=r.reporter_role,
        context=r.context or {},
        has_screenshot=bool(r.screenshot_path),
        emailed=r.emailed,
        email_error=r.email_error,
        created_at=r.created_at,
    )


async def _settings(session: AsyncSession) -> FeedbackSettings:
    routes = await svc.get_routes(session)
    return FeedbackSettings(
        feedback_email=await svc.get_setting(session, svc.FEEDBACK_EMAIL_KEY),
        smtp_configured=smtp_configured(),
        routes=FeedbackRoutes(
            **{
                name: FeedbackRoute(destination=r.destination, address=r.address)  # type: ignore[arg-type]
                for name, r in routes.items()
            }
        ),
    )


@admin_router.get("/settings", response_model=FeedbackSettings)
async def get_feedback_settings(session: AsyncSession = SessionDep) -> FeedbackSettings:
    return await _settings(session)


@admin_router.put("/settings", response_model=FeedbackSettings)
async def update_feedback_settings(
    data: FeedbackSettingsUpdate,
    session: AsyncSession = SessionDep,
    actor: str = Depends(get_current_subject),
) -> FeedbackSettings:
    if data.feedback_email is not None:
        await svc.set_setting(session, svc.FEEDBACK_EMAIL_KEY, data.feedback_email, actor)
    if data.routes is not None:
        for name in svc.ROUTES:
            route: FeedbackRoute = getattr(data.routes, name)
            value = svc.Route(route.destination, route.address).encode()
            await svc.set_setting(session, svc.ROUTE_KEYS[name], value, actor)
    return await _settings(session)


@admin_router.post("/settings/test-email", status_code=status.HTTP_204_NO_CONTENT)
async def send_test_email(
    route: RouteName | None = Query(default=None, description="Test this type's address"),
    session: AsyncSession = SessionDep,
    actor: str = Depends(get_current_subject),
) -> None:
    """Without `route`, tests the default address; with it, the address
    that type of report is emailed to."""
    if route is None:
        to = await svc.get_setting(session, svc.FEEDBACK_EMAIL_KEY)
    else:
        chosen = await svc.get_route(session, route)
        if chosen.destination != "email":
            raise HTTPException(status.HTTP_409_CONFLICT, "This type isn't sent by email.")
        to = await svc.route_address(session, chosen)
    if not to:
        raise HTTPException(status.HTTP_409_CONFLICT, "Set an address to send reports to first.")
    try:
        await svc.send_test(to, actor, route)
    except MailError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc


@admin_router.get("/feedback", response_model=FeedbackList)
async def list_feedback(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    session: AsyncSession = SessionDep,
) -> FeedbackList:
    total = await session.scalar(select(func.count()).select_from(FeedbackReport))
    rows = (
        await session.execute(
            select(FeedbackReport)
            .order_by(FeedbackReport.created_at.desc(), FeedbackReport.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).scalars()
    return FeedbackList(total=int(total or 0), items=[_read(r) for r in rows])


@admin_router.get("/feedback/{report_id}/screenshot")
async def feedback_screenshot(
    report_id: uuid.UUID, session: AsyncSession = SessionDep
) -> FileResponse:
    report = await session.get(FeedbackReport, report_id)
    if report is None or not report.screenshot_path or not is_within_root(report.screenshot_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No screenshot")
    media = "image/png" if report.screenshot_path.endswith(".png") else "image/jpeg"
    return FileResponse(report.screenshot_path, media_type=media)
