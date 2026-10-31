"""Shared helpers for the factory scripts: paths, schemas, project state."""

from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SLUG_PATTERN = r"^[a-z][a-z0-9-]*$"
SCHEMAS = ("application-definition", "assessment", "state", "composition", "catalogue-entry", "source-record", "scopes", "pipeline", "outcome", "benefits")
# Template text like <Who has the problem> left in a document (a link like <https://...> is not one).
PLACEHOLDER = re.compile(r"<(?!https?:)[A-Za-z][^<>\n]{2,}>")


class FactoryError(Exception):
    pass


def today() -> str:
    return dt.date.today().isoformat()


def factory_version(root: Path | None = None) -> str:
    return ((root or ROOT) / "VERSION").read_text(encoding="utf-8").strip()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def schema(name: str, root: Path | None = None) -> dict:
    return read_json((root or ROOT) / "factory" / "schemas" / f"{name}.schema.json")


def validate(name: str, data: object, root: Path | None = None) -> list[str]:
    """Problems with `data` against a factory schema, as readable lines (empty = valid)."""
    import jsonschema  # a dev dependency of the factory (factory/requirements-dev.txt)

    validator = jsonschema.Draft202012Validator(schema(name, root), format_checker=jsonschema.FormatChecker())
    problems = []
    for error in sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path)):
        where = "/".join(str(p) for p in error.absolute_path) or "(top)"
        problems.append(f"{where}: {error.message}")
    return problems


def registry(root: Path | None = None) -> dict:
    return read_json((root or ROOT) / "factory" / "templates.json")


def ready_templates(root: Path | None = None) -> dict[str, dict]:
    return {t["name"]: t for t in registry(root)["templates"] if t.get("status") == "ready"}


def idea_dir(slug: str, root: Path | None = None) -> Path:
    return (root or ROOT) / "ideas" / slug


def load_state(slug: str, root: Path | None = None) -> dict:
    path = idea_dir(slug, root) / "state.json"
    if not path.exists():
        raise FactoryError(f"ideas/{slug}/state.json does not exist")
    return read_json(path)


def save_state(slug: str, state: dict, root: Path | None = None) -> None:
    state["updated"] = today()
    problems = validate("state", state, root)
    if problems:
        raise FactoryError(f"ideas/{slug}/state.json would be invalid: " + "; ".join(problems))
    write_json(idea_dir(slug, root) / "state.json", state)
