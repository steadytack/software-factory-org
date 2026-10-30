"""The app's notion of "today".

Single source of truth for "today" so the overdue filter, the notification
sweep and the dashboard stats all agree on the day boundary (hardening
DUP-1).

Due dates and survey dates are plain calendar dates entered by people in
the UK, so "today" is the date in APP_TIMEZONE (default Europe/London), not
UTC. Anchoring to UTC made an action due today show as overdue between
midnight and 1 am for half the year (BST = UTC+1).
"""

from datetime import date, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import get_settings


@lru_cache
def app_zone() -> ZoneInfo:
    return ZoneInfo(get_settings().app_timezone)


def local_today() -> date:
    """Today's date in the app's timezone (APP_TIMEZONE)."""
    return datetime.now(app_zone()).date()
