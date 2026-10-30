#!/usr/bin/env python3
"""Scopes: the group, its businesses and their brands (factory/context/scopes.json).

Usage:
  python factory/scripts/scopes.py context <slug>          the context files an idea reads, in precedence order
  python factory/scripts/scopes.py context --scope SCOPE   the same for a scope: group, business:<b> or brand:<x>

Without scopes.json the factory has one scope, the group, and behaves as a single-owner factory.
An idea's scope is `scope: {business, brands}` in its state.json; a catalogue entry's is `scope`
(group, business:<b> or brand:<x>; absent = group). An idea reads the group layer, its business and its
own brands, never another business's. It may use catalogue entries from the group, its business and that
business's brands (and group brands); anything else needs a recorded decision.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402

GROUP = "group"
PUBLISH_DEFAULTS = {"owner": None, "visibility": "private", "licence": "MIT", "copyright": None}
# Flat files in factory/context/ belong to the group layer (the single-owner factory has only these).
GROUP_FILES = ["about-me.md", "business-context.md", "environment.md", "system-landscape.md", "defaults.md"]


def registry(root: Path | None = None) -> dict:
    path = (root or lib.ROOT) / "factory" / "context" / "scopes.json"
    if path.exists():
        return lib.read_json(path)
    return {"schema_version": 1, "group": {"name": "the owner"}}


def problems(reg: dict, root: Path | None = None) -> list[str]:
    found = lib.validate("scopes", reg, root)
    if found:
        return found
    businesses = reg.get("businesses", {})
    return [f"brands/{b}: business {v['business']!r} is not in businesses" for b, v in reg.get("brands", {}).items()
            if v["business"] is not None and v["business"] not in businesses]


def idea_scope(state: dict) -> dict:
    scope = state.get("scope") or {}
    return {"business": scope.get("business"), "brands": list(scope.get("brands", []))}


def parse(text: str, reg: dict) -> dict:
    """A scope string (group, business:<b>, brand:<x>) as an idea scope."""
    if text == GROUP:
        return {"business": None, "brands": []}
    level, _, name = text.partition(":")
    if level == "business" and name in reg.get("businesses", {}):
        return {"business": name, "brands": []}
    if level == "brand" and name in reg.get("brands", {}):
        return {"business": reg["brands"][name]["business"], "brands": [name]}
    raise lib.FactoryError(f"unknown scope {text!r} (see factory/context/scopes.json)")


def unknown(scope: dict, reg: dict) -> list[str]:
    """Names in an idea scope that the registry does not know."""
    out = []
    if scope["business"] is not None and scope["business"] not in reg.get("businesses", {}):
        out.append(f"business {scope['business']!r}")
    out += [f"brand {b!r}" for b in scope["brands"] if b not in reg.get("brands", {})]
    return out


def visible(scope: dict, reg: dict) -> set[str]:
    """Catalogue scopes an idea may use without a recorded decision."""
    brands = reg.get("brands", {})
    seen = {GROUP} | {f"brand:{b}" for b in scope["brands"]}
    seen |= {f"brand:{b}" for b, v in brands.items() if v["business"] is None}
    if scope["business"] is not None:
        seen.add(f"business:{scope['business']}")
        seen |= {f"brand:{b}" for b, v in brands.items() if v["business"] == scope["business"]}
    return seen


def entry_scope(entry: dict) -> str:
    return entry.get("scope", GROUP)


def context_files(scope: dict, root: Path | None = None, slug: str | None = None) -> list[Path]:
    """Policies first (every layer; a lower layer may only tighten), then the idea's decisions, then the
    most specific layer's context down to the group's, then learned.md."""
    context = (root or lib.ROOT) / "factory" / "context"
    layers = [context / "brands" / b for b in scope["brands"]]
    layers += [context / "businesses" / scope["business"]] if scope["business"] else []
    group_layer = [context / "group"]

    def md(folder: Path) -> list[Path]:
        return sorted(p for p in folder.glob("*.md") if p.name not in ("policies.md", "learned.md", "README.md")) if folder.is_dir() else []

    files = [p / "policies.md" for p in [context, *group_layer, *reversed(layers)] if (p / "policies.md").exists()]
    if slug and (lib.idea_dir(slug, root) / "decisions.md").exists():
        files.append(lib.idea_dir(slug, root) / "decisions.md")
    for folder in layers + group_layer:
        files += md(folder)
    files += [context / name for name in GROUP_FILES if (context / name).exists()]
    files += [context / "learned.md"] if (context / "learned.md").exists() else []
    return files


def publish_settings(scope: dict, reg: dict) -> dict:
    settings = dict(PUBLISH_DEFAULTS)
    settings.update(reg["group"].get("publish", {}))
    if scope["business"] is not None:
        settings.update(reg.get("businesses", {}).get(scope["business"], {}).get("publish", {}))
    return settings


def who(root: Path | None = None) -> str:
    """The person running the factory: git user.name, else 'owner'."""
    try:
        done = subprocess.run(["git", "config", "user.name"], cwd=root or lib.ROOT, capture_output=True, text=True)
    except OSError:
        return "owner"
    return done.stdout.strip() or "owner"


def main(argv: list[str]) -> int:
    args = argv[1:]
    try:
        if len(args) == 2 and args[0] == "context":
            slug = args[1]
            scope = idea_scope(lib.load_state(slug))
            missing = unknown(scope, registry())
            if missing:
                raise lib.FactoryError(f"ideas/{slug} names {', '.join(missing)}, not in factory/context/scopes.json")
            files = context_files(scope, slug=slug)
        elif len(args) == 3 and args[:2] == ["context", "--scope"]:
            files = context_files(parse(args[2], registry()))
        else:
            print(__doc__)
            return 2
    except lib.FactoryError as exc:
        print(f"scopes: {exc}", file=sys.stderr)
        return 1
    for path in files:
        print(path.relative_to(lib.ROOT).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
