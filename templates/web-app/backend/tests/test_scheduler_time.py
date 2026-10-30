"""The daily jobs run at their local time, also on the days the clocks change."""

from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo

from app.scheduler import seconds_until

LONDON = ZoneInfo("Europe/London")


def test_the_clocks_going_forward_shortens_the_wait():
    # 00:00 GMT on 29 March 2026; at 01:00 UTC the clocks go to 02:00 BST, so
    # 07:00 local is 6 hours away, not 7.
    now = datetime(2026, 3, 29, 0, 0, tzinfo=UTC).astimezone(LONDON)
    assert seconds_until(time(7, 0), now) == 6 * 3600


def test_the_clocks_going_back_lengthens_the_wait():
    # 00:00 BST on 25 October 2026; at 01:00 UTC the clocks go back to 01:00
    # GMT, so 07:00 local is 8 hours away, not 7.
    now = datetime(2026, 10, 24, 23, 0, tzinfo=UTC).astimezone(LONDON)
    assert seconds_until(time(7, 0), now) == 8 * 3600


def test_an_ordinary_day_and_a_time_already_passed():
    now = datetime(2026, 7, 1, 6, 0, tzinfo=UTC).astimezone(LONDON)  # 07:00 BST
    assert seconds_until(time(7, 30), now) == 30 * 60
    assert seconds_until(time(7, 0), now) == 24 * 3600
