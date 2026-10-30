#!/usr/bin/env python3
"""Create an idea's working folder, and later its app from a template.

Usage:
  python factory/scripts/scaffold.py new <slug> --name "Readable name" [--kind app|factory-asset|demo]
  python factory/scripts/scaffold.py definition <slug>     the Application Definition to fill in (Analyse)
  python factory/scripts/scaffold.py spec <slug>           the spec pack stubs (Spec)
  python factory/scripts/scaffold.py app <slug> <template>

`new` makes ideas/<slug>/ with state.json, idea.md, decisions.md, changes.md and empty gates/, source/
and spec/ folders, at the start of Analyse. `app` copies templates/<template> into ideas/<slug>/app
(without build output or the factory's own files), adds NOTES.md and the standards it is built to,
and starts the app's own git repository. Ports, secrets and removing a template's example domain are
done afterwards, during Build.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402

# What an app copy leaves out. A bare name matches any file or folder of that name; "./x" only the top level.
COPY_EXCLUDES = [
    "node_modules", "dist", "test-results", ".venv", ".ruff_cache", "__pycache__", ".pytest_cache", "backups",
    "./audits/runs", "./.claude", "./module.json", ".env", "tsconfig.tsbuildinfo", ".astro", "playwright-report",
]

IDEA_MD = """# {name}

## The idea
<In the owner's words: what it is, who it is for, what problem it solves.>

## Source material
<Links to anything supplied (imported documents live in source/), or "none".>

## Notes
<Anything said while shaping it that does not belong in the Application Definition yet.>
"""

DECISIONS_MD = """# Decisions

Decisions for this project, newest last. Small calls the factory made are logged here too (with "factory" as the decider); anything approved at a gate names the gate.

| ID | Date | Decision | Options considered | Why | Decided by | Gate |
|---|---|---|---|---|---|---|
"""

CHANGES_MD = """# Change requests

Changes to anything already approved at a gate (`factory/stages/changes.md`).

| CR | Date | What changed | Reason | Affected IDs | Impact | Approved | Outcome |
|---|---|---|---|---|---|---|---|
"""


def excluded(rel: str) -> bool:
    parts = rel.split("/")
    for pattern in COPY_EXCLUDES:
        if pattern.startswith("./"):
            if rel == pattern[2:] or rel.startswith(pattern[2:] + "/"):
                return True
        elif pattern in parts:
            return True
    return False


def copy_template(source: Path, dest: Path) -> int:
    """Copy a template without build output; returns the number of files copied."""
    if dest.exists() and any(dest.iterdir()):
        raise lib.FactoryError(f"{dest} already exists and is not empty")
    count = 0
    for path in sorted(source.rglob("*")):
        rel = path.relative_to(source).as_posix()
        if path.is_dir() or excluded(rel):
            continue
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        count += 1
    dest.mkdir(parents=True, exist_ok=True)
    return count


def new_idea(slug: str, name: str, kind: str = "app", root: Path | None = None) -> Path:
    if not re.match(lib.SLUG_PATTERN, slug):
        raise lib.FactoryError(f"slug '{slug}' must be lower-case letters, digits and hyphens, starting with a letter")
    idea = lib.idea_dir(slug, root)
    if idea.exists():
        raise lib.FactoryError(f"ideas/{slug} already exists")
    for sub in ("gates", "source", "spec"):
        (idea / sub).mkdir(parents=True)
    (idea / "idea.md").write_text(IDEA_MD.format(name=name), encoding="utf-8", newline="\n")
    (idea / "decisions.md").write_text(DECISIONS_MD, encoding="utf-8", newline="\n")
    (idea / "changes.md").write_text(CHANGES_MD, encoding="utf-8", newline="\n")
    state = {
        "schema_version": 1,
        "slug": slug,
        "name": name,
        "kind": kind,
        "stage": "analyse",
        "status": "in-progress",
        "factory_version": lib.factory_version(root),
        "updated": lib.today(),
        "template": None,
        "tier": None,
        "versions": {"application_definition": None, "spec": None, "composition": None},
        "gates": {str(n): {"status": "not-reached"} for n in range(1, 5)},
        "blockers": [],
        "last_verification": None,
        "imports": [],
        "changes": [],
        "next": "Analyse: write application-definition.md (factory/stages/analyse.md)",
    }
    lib.save_state(slug, state, root)
    return idea


def fill(text: str, values: dict[str, str]) -> str:
    """Replace {key} tokens (plain replacement: the templates also contain JSON braces)."""
    for key, value in values.items():
        text = text.replace("{" + key + "}", value)
    return text


def new_definition(slug: str, root: Path | None = None) -> Path:
    base = root or lib.ROOT
    state = lib.load_state(slug, root)
    path = lib.idea_dir(slug, root) / "application-definition.md"
    if path.exists():
        raise lib.FactoryError(f"ideas/{slug}/application-definition.md already exists")
    template = (base / "factory" / "project-files" / "application-definition.md").read_text(encoding="utf-8")
    path.write_text(fill(template, {"slug": slug, "name": state["name"]}), encoding="utf-8", newline="\n")
    state["versions"]["application_definition"] = "0.1"
    lib.save_state(slug, state, root)
    return path


def new_spec(slug: str, root: Path | None = None) -> Path:
    """Write the spec pack stubs, filled from the Application Definition where it exists."""
    import check_spec

    base = root or lib.ROOT
    state = lib.load_state(slug, root)
    idea = lib.idea_dir(slug, root)
    spec = idea / "spec"
    if any(spec.glob("*.md")):
        raise lib.FactoryError(f"ideas/{slug}/spec already has documents")
    definition, _problems = check_spec.read_definition(idea)
    sources = definition["sources"] if definition else [{"kind": "idea", "ref": "idea.md"}]
    values = {
        "name": state["name"],
        "date": lib.today(),
        "definition_version": definition["version"] if definition else "0.1",
        "tier": str(definition["maturity_tier"]["value"]) if definition else "<tier>",
        "deployment": definition["deployment"]["value"] if definition else "<deployment>",
        "sources": "\n".join(f"- {s['kind']}: `{s['ref']}`" + (f" ({s['version']})" if s.get("version") else "") for s in sources),
    }
    spec.mkdir(exist_ok=True)
    for stub in sorted((base / "factory" / "project-files" / "spec").glob("*.md")):
        (spec / stub.name).write_text(fill(stub.read_text(encoding="utf-8"), values), encoding="utf-8", newline="\n")
    state["versions"]["spec"] = "0.1"
    lib.save_state(slug, state, root)
    return spec


def new_app(slug: str, template: str, root: Path | None = None) -> Path:
    base = root or lib.ROOT
    state = lib.load_state(slug, root)
    entry = lib.ready_templates(root).get(template)
    if entry is None:
        raise lib.FactoryError(f"'{template}' is not a ready template in factory/templates.json")
    stack = base / "factory" / "standards" / "stacks" / f"{entry['stack']}.md"
    if not stack.exists():
        raise lib.FactoryError(f"no stack standards for {template} ({stack.relative_to(base).as_posix()})")
    app = lib.idea_dir(slug, root) / "app"
    copy_template(base / "templates" / template, app)
    shutil.copy(base / "factory" / "project-files" / "NOTES.md", app / "NOTES.md")
    (app / "standards").mkdir(exist_ok=True)
    shutil.copy(base / "factory" / "standards" / "PRINCIPLES.md", app / "standards" / "PRINCIPLES.md")
    shutil.copy(stack, app / "STANDARDS.md")
    if shutil.which("git"):
        subprocess.run(["git", "-C", str(app), "init", "-q"], check=True, capture_output=True)
    state["template"] = template
    lib.save_state(slug, state, root)
    return app


def main(argv: list[str]) -> int:
    args = argv[1:]
    try:
        if len(args) >= 2 and args[0] == "new":
            name = args[args.index("--name") + 1] if "--name" in args else args[1]
            kind = args[args.index("--kind") + 1] if "--kind" in args else "app"
            idea = new_idea(args[1], name, kind)
            print(f"Created {idea.relative_to(lib.ROOT).as_posix()}/ (stage analyse)")
            return 0
        if len(args) == 2 and args[0] in ("definition", "spec"):
            made = new_definition(args[1]) if args[0] == "definition" else new_spec(args[1])
            print(f"Wrote {made.relative_to(lib.ROOT).as_posix()}")
            return 0
        if len(args) == 3 and args[0] == "app":
            app = new_app(args[1], args[2])
            print(f"Scaffolded {app.relative_to(lib.ROOT).as_posix()}/ from {args[2]}, with NOTES.md, STANDARDS.md and standards/PRINCIPLES.md")
            return 0
    except lib.FactoryError as exc:
        print(f"scaffold: {exc}", file=sys.stderr)
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
