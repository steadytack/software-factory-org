"""A list's sort and filters, sent by a managed table in server mode (`lib/serverTable.ts`).

A sort is `field:asc` or `field:desc`. A filter is `field:operator:value`; several are all required
(AND). Fields and operators come from an allow-list per list (`TableQuery`), so a request can never
name a column the list does not show, and every value is a bound parameter.

Operators by kind of field, matching the frontend's `lib/tableFilters.ts`:

* select: `is` / `is_not` and a comma-separated list ("is none of" keeps rows with no value)
* text: `contains` / `equals` (case-insensitive)
* number: `at_least` / `at_most` and a number
* date: `after` / `before` and a date or date-time (a bare date means that whole day)

Proven in an app built from this template, and made generic.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Date, func, or_, true
from sqlalchemy.sql.elements import ColumnElement


@dataclass(frozen=True)
class TableQuery:
    """What one list lets a table sort and filter by: field name -> column (or expression)."""

    sortable: dict[str, Any] = field(default_factory=dict)
    select: dict[str, Any] = field(default_factory=dict)
    text: dict[str, Any] = field(default_factory=dict)
    number: dict[str, Any] = field(default_factory=dict)
    date: dict[str, Any] = field(default_factory=dict)

    def order(self, sort: str | None, tail: list | tuple) -> list:
        return sorted_by(sort, self.sortable, list(tail))

    def where(self, specs: list[str] | None) -> list[ColumnElement]:
        return [filtered_by(s, self.select, self.text, self.number, self.date) for s in specs or []]


def _bad(message: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, message)


def sorted_by(sort: str | None, sortable: dict[str, Any], tail: list) -> list:
    """The ORDER BY for `field:dir` over an allow-list, with `tail` breaking ties (keep an id in it,
    so offset paging is stable)."""
    clauses: list = []
    if sort:
        name, _, direction = sort.partition(":")
        if name not in sortable or direction not in ("asc", "desc"):
            raise _bad(f"Cannot sort by {sort!r}")
        column = sortable[name]
        clauses.append(
            column.desc().nulls_last() if direction == "desc" else column.asc().nulls_last()
        )
    return clauses + tail


def _like(text: str) -> str:
    return re.sub(r"([\\%_])", r"\\\1", text)


def _when(value: str, *, end_of_day: bool) -> datetime:
    """A date or date-time as an instant; a bare date is its start, or its last moment."""
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        raise _bad(f"{value!r} is not a date") from None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    if end_of_day and len(value) <= 10:
        moment += timedelta(days=1) - timedelta(microseconds=1)
    return moment


def _is_date_column(column: Any) -> bool:
    return isinstance(getattr(column, "type", None), Date)


def _number(name: str, operator: str, value: str, column: Any) -> ColumnElement:
    if operator not in ("at_least", "at_most"):
        raise _bad(f"{name} takes at_least or at_most, not {operator!r}")
    if not value:
        return true()
    try:
        number = float(value)
    except ValueError:
        raise _bad(f"{value!r} is not a number") from None
    return column >= number if operator == "at_least" else column <= number


def _date(name: str, operator: str, value: str, column: Any) -> ColumnElement:
    if operator not in ("after", "before"):
        raise _bad(f"{name} takes after or before, not {operator!r}")
    if not value:
        return true()
    if _is_date_column(column):  # a calendar date: compare dates, both ends inclusive
        try:
            day = date.fromisoformat(value[:10])
        except ValueError:
            raise _bad(f"{value!r} is not a date") from None
        return column >= day if operator == "after" else column <= day
    if operator == "after":
        return column >= _when(value, end_of_day=False)
    return column <= _when(value, end_of_day=True)


def _select(name: str, operator: str, value: str, column: Any) -> ColumnElement:
    if operator not in ("is", "is_not"):
        raise _bad(f"{name} takes is or is_not, not {operator!r}")
    values = [v.strip() for v in value.split(",") if v.strip()]
    if not values:
        return true()
    return column.in_(values) if operator == "is" else or_(column.is_(None), ~column.in_(values))


def _text(name: str, operator: str, value: str, column: Any) -> ColumnElement:
    if operator not in ("contains", "equals"):
        raise _bad(f"{name} takes contains or equals, not {operator!r}")
    if not value:
        return true()
    if operator == "equals":
        return func.lower(column) == value.lower()
    return column.ilike(f"%{_like(value)}%", escape="\\")


def filtered_by(
    spec: str,
    select_fields: dict[str, Any],
    text_fields: dict[str, Any],
    number_fields: dict[str, Any] | None = None,
    date_fields: dict[str, Any] | None = None,
) -> ColumnElement:
    """One `field:operator:value` over allow-listed fields."""
    name, _, rest = spec.partition(":")
    operator, _, value = rest.partition(":")
    value = value.strip()
    for fields, build in (
        (number_fields or {}, _number),
        (date_fields or {}, _date),
        (select_fields, _select),
        (text_fields, _text),
    ):
        if name in fields:
            return build(name, operator, value, fields[name])
    raise _bad(f"Cannot filter by {name!r}")
