"""Shared field types for the API schemas — one definition per rule.

The data-integrity audit (run 2026-09-16-3) found the same three rules stated
inconsistently across 8 text fields and 4 entity pairs:

* **VAL-1** — blank and whitespace-only values were accepted for *required*
  text (`POST /api/sites {"name": ""}` → 201), and nothing was trimmed.
  `CommentCreate.text` was the only field in the repo that got this right.
* **VAL-2** — `*Create` carried `min_length=1`, the matching `*Update` did
  not, so every required text field could be emptied by a later `PATCH`.
* **VAL-3** — `*Update` used `X | None = None` to mean "field omitted", so an
  explicitly-sent `null` on a *required* field was indistinguishable from an
  omission and fell through to the database's NOT NULL constraint, surfacing
  as a `409 "Conflict with existing data (duplicate or invalid reference)"` —
  neither a duplicate nor a bad reference — or, for `latitude`/`longitude`, a
  **500**.

The fix is that update schemas derive their constraints from these types
rather than restating them, so create and update cannot drift again.

## How "omitted" and "explicit null" are told apart

A `BeforeValidator` runs only when a value is actually supplied: Pydantic does
not validate field defaults. So an *omitted* field takes its `None` default
untouched (and `exclude_unset=True` then leaves the column alone), while an
*explicitly-sent* `null` reaches the validator and is rejected with a 422.
That is the whole mechanism — no `model_fields_set` inspection needed.

## Q-D1 — the null / "" ruling

Blank optional text is **always stored as `NULL`, never `""`**. The two are
otherwise indistinguishable in the UI, the CSV export and every filter, and
the form already round-trips `null → "" → null`; this closes the API-side hole
that let `""` in. Required text rejects blank outright.
"""

import uuid
from typing import Annotated, Any

from pydantic import BeforeValidator, Field, StrictBool

from app.core.text import clean_text

# Length bounds for the three previously-unbounded free-text fields.
# Generous, and consistent with their bounded VARCHAR siblings (`name` 200,
# `address` 500, `notes` 2000, action `description` 1000). Existing data: 0
# rows over any of these.
DESCRIPTION_MAX_LENGTH = 4000
SUMMARY_MAX_LENGTH = 4000
COMMENT_MAX_LENGTH = 4000


def reject_explicit_null(value: Any) -> Any:
    """Reject an explicitly-supplied `null` on a required field.

    Never fires for an omitted field — Pydantic does not validate defaults.
    """
    if value is None:
        raise ValueError("This field is required and cannot be set to null")
    return value


def trim_required_text(value: Any) -> Any:
    """Strip surrounding whitespace and reject a blank result.

    Generalises the strip-and-reject validator that `CommentCreate.text`
    already carried, which was the only field in the repo enforcing it.
    """
    if isinstance(value, str):
        stripped = clean_text(value).strip()
        if not stripped:
            raise ValueError("This field is required and cannot be blank")
        return stripped
    return value


def trim_optional_text_to_none(value: Any) -> Any:
    """Strip an optional text value; a blank result becomes `None`.

    `""` and `"   "` are never stored: "no value recorded" has exactly one
    representation, `NULL`.
    """
    if isinstance(value, str):
        return clean_text(value).strip() or None
    return value


def required[T](annotation: type[T]) -> Any:
    """A required, non-text field on an *update* schema: `T | None` in the
    signature (so omission is expressible) but an explicit `null` is a 422."""
    return Annotated[annotation | None, BeforeValidator(reject_explicit_null)]


def required_number(ge: float, le: float) -> Any:
    """A required, bounded number on an *update* schema. Strict: a real JSON
    number, not `true` or `"51.5"`. The bounds sit on the
    `float` member of the union for the same reason as `required_text_update`,
    and an explicit `null` is a 422 rather than a 500."""
    return Annotated[
        Annotated[float, Field(ge=ge, le=le, strict=True)] | None,
        BeforeValidator(reject_explicit_null),
    ]


def required_text(max_length: int) -> Any:
    """Required text on a *create* schema: trimmed, never blank, bounded."""
    return Annotated[
        str,
        BeforeValidator(trim_required_text),
        Field(min_length=1, max_length=max_length),
    ]


def required_text_update(max_length: int) -> Any:
    """Required text on an *update* schema: the same rule as `required_text`,
    plus an explicit `null` is a 422 rather than a database error.

    The length bound sits on the `str` member of the union, not on the union
    itself — a constraint applied to `str | None` is evaluated against `None`
    too and raises rather than passing.
    """

    def _check(value: Any) -> Any:
        return trim_required_text(reject_explicit_null(value))

    return Annotated[
        Annotated[str, Field(min_length=1, max_length=max_length)] | None,
        BeforeValidator(_check),
    ]


def optional_text(max_length: int) -> Any:
    """Optional text, on create or update: trimmed, blank stored as `NULL`.
    An explicit `null` is legal and clears the field (`exclude_unset`)."""
    return Annotated[
        Annotated[str, Field(max_length=max_length)] | None,
        BeforeValidator(trim_optional_text_to_none),
    ]


# Offline creates (services/client_ids.py): the app may choose the new
# record's id so offline work can refer to it before it syncs. Optional; the
# server makes one when it's left out.
ClientId = Annotated[
    uuid.UUID | None,
    Field(description="Optional id chosen by the client; repeating it returns the saved record."),
]

# Pydantic's lax mode coerces `"yes"` and `1` to `True`, while numeric
# and date coercion on the same endpoints is strict (`"abc"` → 422). StrictBool
# makes booleans agree with the rest of the contract: only true/false.
StrictBoolField = StrictBool
