"""Feedback (Help → Feedback): store the report, then email it when its
type is routed to email, with the screenshot attached.

Each type (problem, suggestion, question) has a route: `email:<address>`,
`store` (kept for the admins only) or `off` (not offered, refused). The
defaults are FEEDBACK_PROBLEM / FEEDBACK_SUGGESTION / FEEDBACK_QUESTION in
config; an admin's choice (an AppSetting) wins over them.

A report is always stored first, so it survives a missing email setup or a
failed send; admins see every report, sent or not, under Admin → Feedback.
"""

import base64
import binascii
import html
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.storage import save_upload
from app.models.feedback import AppSetting, FeedbackReport
from app.services.mailer import Attachment, Mail, MailError, send_mail, smtp_configured

logger = get_logger(__name__)

FEEDBACK_EMAIL_KEY = "feedback_email"
KIND_LABELS = {
    "bug": "Bug",
    "confusing": "Something's confusing",
    "idea": "Feature idea",
    "other": "Other",
}
# The stored kind → the route it follows. `confusing` is an older kind, kept
# for reports sent before the three types; it is a problem.
ROUTE_FOR_KIND = {
    "bug": "problem",
    "confusing": "problem",
    "idea": "suggestion",
    "other": "question",
}
# Route → the kind the form sends for it.
KIND_FOR_ROUTE = {"problem": "bug", "suggestion": "idea", "question": "other"}
ROUTES = ("problem", "suggestion", "question")
ROUTE_LABELS = {"problem": "Problem", "suggestion": "Suggestion", "question": "Question"}
# AppSetting key for an admin's choice of route; empty or missing = config default.
ROUTE_KEYS = {name: f"feedback_route_{name}" for name in ROUTES}
MAX_PER_HOUR = 10
MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
MAX_CONTEXT_CHARS = 30_000
EMAIL_RE = re.compile(r"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$")


class FeedbackError(Exception):
    """A report that can't be accepted (bad screenshot, too many)."""


class TooManyReports(FeedbackError):
    pass


class FeedbackOff(FeedbackError):
    """This type of report is turned off."""


@dataclass(frozen=True)
class Route:
    destination: str  # "email" | "store" | "off"
    address: str = ""  # only for email; empty = the default address

    def encode(self) -> str:
        return f"email:{self.address}" if self.destination == "email" else self.destination


def parse_route(value: str | None) -> Route:
    """`email:<address>` | `store` | `off` → Route. Anything else is `store`,
    the safe choice: the report is kept and nobody is emailed by mistake."""
    value = (value or "").strip()
    if value.startswith("email:"):
        return Route("email", value.removeprefix("email:").strip())
    if value == "off":
        return Route("off")
    return Route("store")


def default_route(name: str) -> Route:
    return parse_route(getattr(get_settings(), f"feedback_{name}"))


def valid_email(value: str) -> bool:
    return bool(EMAIL_RE.match(value.strip()))


async def get_setting(session: AsyncSession, key: str) -> str:
    row = await session.get(AppSetting, key)
    return row.value if row else ""


async def set_setting(session: AsyncSession, key: str, value: str, actor: str) -> None:
    row = await session.get(AppSetting, key)
    if row is None:
        session.add(AppSetting(key=key, value=value, updated_by=actor))
    else:
        row.value = value
        row.updated_by = actor
    await session.flush()


async def get_route(session: AsyncSession, name: str) -> Route:
    override = await get_setting(session, ROUTE_KEYS[name])
    return parse_route(override) if override else default_route(name)


async def get_routes(session: AsyncSession) -> dict[str, Route]:
    return {name: await get_route(session, name) for name in ROUTES}


async def route_address(session: AsyncSession, route: Route) -> str:
    """Where an email route sends: its own address, else the default one."""
    return route.address or await get_setting(session, FEEDBACK_EMAIL_KEY)


@dataclass
class Screenshot:
    data: bytes
    ext: str
    subtype: str


def decode_screenshot(data_url: str | None) -> Screenshot | None:
    """A `data:image/png|jpeg;base64,…` URL → bytes, checked to really be
    that image type and within the size cap."""
    if not data_url:
        return None
    match = re.match(r"^data:image/(png|jpeg);base64,(.+)$", data_url, re.S)
    if not match:
        raise FeedbackError("The screenshot must be a PNG or JPEG image.")
    subtype = match.group(1)
    try:
        data = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise FeedbackError("The screenshot couldn't be read.") from exc
    if len(data) > MAX_SCREENSHOT_BYTES:
        raise FeedbackError("The screenshot is too large.")
    magic = b"\x89PNG\r\n\x1a\n" if subtype == "png" else b"\xff\xd8\xff"
    if not data.startswith(magic):
        raise FeedbackError("The screenshot isn't a valid image.")
    return Screenshot(data=data, ext="png" if subtype == "png" else "jpg", subtype=subtype)


def _rows(context: dict[str, Any], prefix: str = "") -> list[tuple[str, str]]:
    """Flatten the diagnostics for the email: nested keys dotted, lists one
    item per line."""
    rows: list[tuple[str, str]] = []
    for key, value in context.items():
        name = f"{prefix}{key}"
        if isinstance(value, dict):
            rows.extend(_rows(value, f"{name}."))
        elif isinstance(value, list):
            rows.append((name, "\n".join(str(v) for v in value) or "—"))
        else:
            rows.append((name, "—" if value in (None, "") else str(value)))
    return rows


def build_mail(report: FeedbackReport, to: str, screenshot: Screenshot | None) -> Mail:
    kind = KIND_LABELS.get(report.kind, report.kind)
    rows = [
        ("From", report.reporter_email),
        ("Role", report.reporter_role),
        ("Sent", report.created_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")),
        ("Report id", str(report.id)),
        *_rows(report.context or {}),
    ]
    text = "\n".join(
        [
            f"{kind}: {report.summary}",
            "",
            report.details or "(no details given)",
            "",
            "— Details —",
            *(f"{k}: {v}" for k, v in rows),
            "",
            "Screenshot attached." if screenshot else "No screenshot.",
        ]
    )
    esc = html.escape
    table = "".join(
        f'<tr><th align="left" valign="top" style="padding:3px 12px 3px 0;color:#44546f;'
        f'font-weight:600;white-space:nowrap">{esc(k)}</th>'
        f'<td style="padding:3px 0;white-space:pre-wrap">{esc(v)}</td></tr>'
        for k, v in rows
    )
    body_html = (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#172b4d">'
        f'<p style="margin:0 0 4px;color:#44546f">{esc(kind)}</p>'
        f'<h2 style="margin:0 0 12px;font-size:18px">{esc(report.summary)}</h2>'
        f'<p style="white-space:pre-wrap">{esc(report.details or "(no details given)")}</p>'
        f'<table style="border-collapse:collapse;font-size:13px">{table}</table>'
        f'<p style="color:#44546f">{"Screenshot attached." if screenshot else "No screenshot."}</p>'
        "</div>"
    )
    attachments = (
        [
            Attachment(
                filename=f"screenshot.{screenshot.ext}",
                data=screenshot.data,
                maintype="image",
                subtype=screenshot.subtype,
            )
        ]
        if screenshot
        else []
    )
    return Mail(
        to=to,
        subject=f"[{get_settings().app_name}] {kind}: {report.summary}",
        text=text,
        html=body_html,
        reply_to=report.reporter_email if valid_email(report.reporter_email) else None,
        attachments=attachments,
    )


async def submit(
    session: AsyncSession,
    *,
    kind: str,
    summary: str,
    details: str | None,
    context: dict[str, Any],
    screenshot_data_url: str | None,
    reporter_email: str,
    reporter_role: str,
) -> FeedbackReport:
    """Store the report, then email it if its type is routed to email.
    Never fails because email did. Refuses a type that is turned off."""
    route = await get_route(session, ROUTE_FOR_KIND.get(kind, "problem"))
    if route.destination == "off":
        raise FeedbackOff("This type of feedback is turned off.")
    since = datetime.now(UTC) - timedelta(hours=1)
    recent = await session.scalar(
        select(func.count())
        .select_from(FeedbackReport)
        .where(FeedbackReport.reporter_email == reporter_email, FeedbackReport.created_at > since)
    )
    if (recent or 0) >= MAX_PER_HOUR:
        raise TooManyReports("That's a lot of reports in an hour — please try again later.")
    screenshot = decode_screenshot(screenshot_data_url)
    stored = save_upload(screenshot.data, f"feedback.{screenshot.ext}") if screenshot else None
    report = FeedbackReport(
        kind=kind,
        summary=summary,
        details=details or None,
        reporter_email=reporter_email,
        reporter_role=reporter_role,
        context=context,
        screenshot_path=str(stored) if stored else None,
    )
    session.add(report)
    await session.flush()
    await session.refresh(report)

    if route.destination != "email":
        # Store only: kept for the admins, nothing to send.
        logger.info("feedback_received", report_id=str(report.id), kind=kind, emailed=False)
        return report
    to = await route_address(session, route)
    if not to:
        report.email_error = "No address set under Admin → Feedback."
    elif not smtp_configured():
        report.email_error = "Email isn't set up on the server (SMTP_HOST / SMTP_FROM)."
    else:
        try:
            await send_mail(build_mail(report, to, screenshot))
            report.emailed = True
        except MailError as exc:
            report.email_error = str(exc)
            logger.warning("feedback_email_failed", report_id=str(report.id), error=str(exc))
    await session.flush()
    logger.info("feedback_received", report_id=str(report.id), kind=kind, emailed=report.emailed)
    return report


async def send_test(to: str, actor: str, route: str | None = None) -> None:
    app = get_settings().app_name
    what = f"{ROUTE_LABELS[route]} reports" if route else "Reports"
    await send_mail(
        Mail(
            to=to,
            subject=f"[{app}] Test email",
            text=(
                f"This is a test from {app}, sent by {actor}.\n\n"
                f"{what} from Help → Feedback will arrive at this address."
            ),
        )
    )
