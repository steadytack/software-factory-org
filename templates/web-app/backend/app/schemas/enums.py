"""The single source of truth for every controlled vocabulary in the domain.

Before the data-integrity audit the same option list was written out in up to
four places that had never been reconciled (audit **VOC-1**, **VOC-2**):

* `schemas/enums.py` — the API `Literal`s
* `seed.py` — a third hardcoded copy
* `frontend/src/lib/siteForm.ts` + inline page unions — a fourth

Everything now derives from the ordered tuples below:

* the `Literal` types (and therefore the API contract and the generated
  `openapi.d.ts` the frontend reads),
* the DB `CHECK` constraints (`migrations/versions/0016_vocabulary_checks.py`
  imports these tuples, so a constraint can never disagree with the API),
* the seeder,
* the declared **display order** — the tuples are ordered deliberately, which
  is what fixes the dashboard's arbitrary `GROUP BY` chart order (**DSP-2**)
  and gives a UI a stable order to render options in.

The database stores plain strings (no Postgres ENUM, no lookup table), which
keeps migrations simple; the `CHECK` constraints are what make that safe for
the write paths that never pass through Pydantic — the seeder, migrations and
manual SQL (**VOC-3**).
"""

from typing import Literal, get_args

# ── Ordered vocabularies ─────────────────────────────────────────────────────
# Order is the display order. `severity` is ordered low → high deliberately;
# `category` puts the two catch-alls last.

SITE_STATUSES = ("active", "archived")
SITE_TYPES = ("bridge", "building", "playground", "outfall", "other")
SURVEY_STATUSES = ("draft", "completed")
CHANGELOG_ACTIONS = ("created", "updated", "deleted")
# Entity names for the generic entity/entity_id tables (comments, attachments,
# changelog). `services/comment.ENTITY_MODELS` maps these to model classes and
# is checked against this tuple at import time.
ENTITIES = ("site", "survey")
# Ordered least → most privileged: viewers read and comment, editors record
# field work (sites, surveys), admins also delete and manage users.
USER_ROLES = ("viewer", "editor", "admin")


# ── Literal types (derived — never restate a list here) ──────────────────────

SiteStatusValue = Literal["active", "archived"]
SiteTypeValue = Literal["bridge", "building", "playground", "outfall", "other"]
SurveyStatusValue = Literal["draft", "completed"]
ChangelogActionValue = Literal["created", "updated", "deleted"]
EntityValue = Literal["site", "survey"]
UserRoleValue = Literal["viewer", "editor", "admin"]


# ── Derived sets ─────────────────────────────────────────────────────────────

# Categorical columns that carry a DB CHECK constraint, as
# {(table, column): allowed values}. Migration 0016 generates its constraints
# from this mapping, so adding a value to a tuple above and forgetting the
# database is no longer possible — the constraint's definition *is* the tuple.
CHECKED_COLUMNS: dict[tuple[str, str], tuple[str, ...]] = {
    ("sites", "site_type"): SITE_TYPES,
    ("sites", "status"): SITE_STATUSES,
    ("surveys", "status"): SURVEY_STATUSES,
    ("changelog", "action"): CHANGELOG_ACTIONS,
    ("comments", "entity"): ENTITIES,
    ("attachments", "entity"): ENTITIES,
    ("users", "role"): USER_ROLES,
}


def check_constraint_name(table: str, column: str) -> str:
    return f"ck_{table}_{column}"


def _assert_literals_match_tuples() -> None:
    """Fail at import time if a Literal and its tuple ever disagree.

    `Literal[...]` cannot be built from a variable in a way static type
    checkers and FastAPI's OpenAPI generation both understand, so the values
    are written twice — once as the tuple, once in the Literal. This is the
    guard that makes the duplication safe: a mismatch is a hard error on the
    next import, not a silent divergence discovered by an audit.
    """
    pairs = [
        (SiteStatusValue, SITE_STATUSES),
        (SiteTypeValue, SITE_TYPES),
        (SurveyStatusValue, SURVEY_STATUSES),
        (ChangelogActionValue, CHANGELOG_ACTIONS),
        (EntityValue, ENTITIES),
        (UserRoleValue, USER_ROLES),
    ]
    for literal, values in pairs:
        assert get_args(literal) == values, (
            f"vocabulary drift: {literal} != {values} — update both, or the API "
            f"contract and the CHECK constraints will disagree"
        )


_assert_literals_match_tuples()
