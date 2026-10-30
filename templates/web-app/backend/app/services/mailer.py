"""Outgoing email over SMTP (stdlib only).

Configured by the SMTP_* settings (core/config.py). Sending runs in a worker
thread with a timeout so a slow mail server never blocks the event loop.
"""

import asyncio
import smtplib
import ssl
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

TIMEOUT_SECONDS = 20


class MailError(Exception):
    """Sending failed; the message says why (shown to admins)."""


@dataclass
class Attachment:
    filename: str
    data: bytes
    maintype: str = "application"
    subtype: str = "octet-stream"


@dataclass
class Mail:
    to: str
    subject: str
    text: str
    html: str | None = None
    reply_to: str | None = None
    attachments: list[Attachment] = field(default_factory=list)


def smtp_configured() -> bool:
    s = get_settings()
    return bool(s.smtp_host.strip() and (s.smtp_from.strip() or s.smtp_user.strip()))


def build_message(mail: Mail) -> EmailMessage:
    s = get_settings()
    msg = EmailMessage()
    msg["From"] = s.smtp_from.strip() or s.smtp_user.strip()
    msg["To"] = mail.to
    msg["Subject"] = mail.subject
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="fieldline")
    if mail.reply_to:
        msg["Reply-To"] = mail.reply_to
    msg.set_content(mail.text)
    if mail.html:
        msg.add_alternative(mail.html, subtype="html")
    for a in mail.attachments:
        msg.add_attachment(a.data, maintype=a.maintype, subtype=a.subtype, filename=a.filename)
    return msg


def _send_sync(msg: EmailMessage) -> None:
    s = get_settings()
    context = ssl.create_default_context()
    if s.smtp_port == 465:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            s.smtp_host, s.smtp_port, timeout=TIMEOUT_SECONDS, context=context
        )
    else:
        server = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=TIMEOUT_SECONDS)
    with server:
        if s.smtp_port != 465 and s.smtp_starttls:
            server.starttls(context=context)
        if s.smtp_user:
            server.login(s.smtp_user, s.smtp_password)
        server.send_message(msg)


async def send_mail(mail: Mail) -> None:
    """Send, or raise MailError with a reason fit to show an admin."""
    if not smtp_configured():
        raise MailError("Email isn't set up on the server (SMTP_HOST / SMTP_FROM).")
    msg = build_message(mail)
    try:
        await asyncio.wait_for(asyncio.to_thread(_send_sync, msg), TIMEOUT_SECONDS + 5)
    except TimeoutError as exc:
        raise MailError("The mail server didn't answer in time.") from exc
    except smtplib.SMTPAuthenticationError as exc:
        raise MailError("The mail server refused the SMTP user name or password.") from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise MailError(f"Could not send: {exc}") from exc
    logger.info("mail_sent", to=mail.to, subject=mail.subject)
