"""Notification producer helper.

The bell plumbing (model, endpoints, per-user scoping, dismiss/read) is
generic; what is *worth notifying* is project-specific. A project calls
`notify()` from its own services or from a scheduled job, and the bell shows
the result.

Deduplication is by `link`: a recipient gets at most one live notification per
link. A dismissed notification stays dismissed (it is hidden, not deleted, so
dedup still sees it); deleting one re-arms it, so the next `notify()` for the
same link creates it again.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification

# notifications.title is VARCHAR(200); body and url have their own limits.
TITLE_MAX_LENGTH = 200
BODY_MAX_LENGTH = 500
_ELLIPSIS = "…"


def normalize_recipient(email: str) -> str:
    """Canonical form of a notification recipient's email.

    Applied at every comparison point (write, read, mark-read, delete) so a
    token subject that differs only in case still sees its own notifications.
    """
    return email.strip().lower()


def fit_title(title: str) -> str:
    """Truncate a title to the column length, eliding the end, never overflowing."""
    if len(title) <= TITLE_MAX_LENGTH:
        return title
    return title[: TITLE_MAX_LENGTH - len(_ELLIPSIS)] + _ELLIPSIS


async def notify(
    session: AsyncSession,
    *,
    recipient: str,
    title: str,
    link: str,
    body: str | None = None,
    url: str | None = None,
) -> bool:
    """Create a notification unless this recipient already has one for `link`.

    `link` is the dedup key (e.g. ``"survey:<uuid>"``), not a route; `url` is
    the in-app path opened when the notification is clicked. Returns True if a
    notification was created.
    """
    to_user = normalize_recipient(recipient)
    existing = await session.scalar(
        select(Notification.id).where(Notification.user_email == to_user, Notification.link == link)
    )
    if existing is not None:
        return False
    session.add(
        Notification(
            user_email=to_user,
            title=fit_title(title),
            body=body[:BODY_MAX_LENGTH] if body else None,
            link=link,
            url=url,
        )
    )
    await session.flush()
    return True
