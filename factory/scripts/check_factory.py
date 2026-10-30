#!/usr/bin/env python3
"""Check that the factory agrees with itself.

Usage: python factory/scripts/check_factory.py [--fix] [--root PATH]

Checks the template registry (factory/templates.json) against the template folders, stack standards,
workflows and module manifests; the schemas; the context files and scopes; every idea's state.json; and
every catalogue entry and source record. Reference cards past their review date are warnings, not
problems. Read-only unless --fix, which only regenerates the template tables
between <!-- templates:start --> and <!-- templates:end --> markers. Exit 0 = consistent, 1 = problems.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import scopes  # noqa: E402

START, END = "<!-- templates:start -->", "<!-- templates:end -->"
READY_KEYS = [
    "name", "status", "order", "version", "runtime", "readme_status", "readme_for", "fits", "weak_at",
    "stack", "workflow", "verify", "ports", "compose_project", "modules", "deployment", "interfaces",
]
DEPRECATED_KEYS = ["name", "status", "deprecated", "reason"]
VERIFY_PART_KEYS = ["name", "runtime", "image", "cwd", "setup", "steps"]
DEPLOYMENTS = {"simple", "local", "hosted", "automated"}
INTERFACES = {"web", "mobile", "specialist-visual", "conversational", "non-visual"}
ROUTING = "standards/PRINCIPLES.md"
# Each item is a file, or alternatives of which one must exist: an instance keeps its group context in
# group/, has team.md in place of about-me.md, and each person's environment.md is git-ignored.
CONTEXT_FILES = [
    "README.md", ("about-me.md", "group/team.md"), ("business-context.md", "group/business-context.md"),
    ("environment.md", "environment.example.md"), ("system-landscape.md", "group/system-landscape.md"),
    ("defaults.md", "group/defaults.md"), "learned.md", ("policies.md", "group/policies.md"), "lenses/README.md",
]
PLACEHOLDER = re.compile(r"\{\{[^}]*\}\}")
LENSES = [
    "business-value", "users-and-workflows", "data-and-integrations", "architecture", "security",
    "ux-and-accessibility", "operations", "cost-and-maintainability",
]
# Files where a removed template's name must not appear (history and the registry are exempt).
CURRENT_DOCS = [
    "README.md", "CLAUDE.md", "factory/README.md", ".claude/skills/factory/SKILL.md", "factory/stages/*.md",
    "factory/context/*.md", "factory/standards/*.md", "factory/standards/stacks/*.md", "templates/*/README.md", "templates/*/CLAUDE.md",
]
# Generated tables: (file, renderer). A file is only checked once it exists.
TABLES = [("README.md", "readme"), ("factory/stages/analyse.md", "picker")]


def ready(registry: dict) -> list[dict]:
    return sorted((t for t in registry["templates"] if t.get("status") == "ready"), key=lambda t: t.get("order", 99))


def render(kind: str, registry: dict) -> str:
    if kind == "readme":
        rows = ["| Template | Version | Status | For |", "|---|---|---|---|"]
        rows += [f"| `{t['name']}` | {t['version']} | {t['readme_status']} | {t['readme_for']} |" for t in ready(registry)]
        return "\n".join(rows)
    rows = ["| The idea needs... | Template | Deployment | Weak at |", "|---|---|---|---|"]
    rows += [f"| {t['fits']} | `{t['name']}` | {', '.join(t['deployment'])} | {t['weak_at']} |" for t in ready(registry)]
    rows += [f"| {g['needs']} | {g['note']} | | |" for g in registry.get("gaps", [])]
    return "\n".join(rows)


def check_registry(registry: dict, errors: list[str]) -> None:
    seen: set[str] = set()
    for t in registry.get("templates", []):
        name = t.get("name", "?")
        if t.get("status") not in ("ready", "deprecated"):
            errors.append(f"templates.json: {name}: status must be ready or deprecated")
            continue
        for key in READY_KEYS if t["status"] == "ready" else DEPRECATED_KEYS:
            if key not in t:
                errors.append(f"templates.json: {name}: missing field '{key}'")
        if name in seen:
            errors.append(f"templates.json: duplicate template '{name}'")
        seen.add(name)
        if t["status"] == "ready":
            check_verify(name, t.get("verify"), errors)
            for key, allowed in (("deployment", DEPLOYMENTS), ("interfaces", INTERFACES)):
                bad = [v for v in t.get(key, []) if v not in allowed]
                if bad:
                    errors.append(f"templates.json: {name}: {key} {bad} not in {sorted(allowed)}")


def check_verify(name: str, parts: object, errors: list[str]) -> None:
    if not isinstance(parts, list) or not parts:
        errors.append(f"templates.json: {name}: 'verify' must be a non-empty list of parts")
        return
    names: set[str] = set()
    for part in parts:
        if not isinstance(part, dict):
            errors.append(f"templates.json: {name}: a verify part must be an object")
            continue
        label = f"{name}/{part.get('name', '?')}"
        errors += [f"templates.json: {label}: verify part is missing '{k}'" for k in VERIFY_PART_KEYS if k not in part]
        if part.get("runtime") not in ("python", "node"):
            errors.append(f"templates.json: {label}: runtime must be python or node")
        if not part.get("steps"):
            errors.append(f"templates.json: {label}: a verify part needs at least one step")
        if part.get("name") in names:
            errors.append(f"templates.json: {name}: duplicate verify part '{part.get('name')}'")
        names.add(part.get("name"))
        for service in part.get("services", []):
            errors += [f"templates.json: {label}: service is missing '{k}'" for k in ("name", "image", "ready") if k not in service]


def check_files(root: Path, registry: dict, errors: list[str]) -> None:
    stacks = root / "factory" / "standards" / "stacks"
    workflows = root / ".github" / "workflows"
    known_stacks: set[str] = set()
    known_flows: set[str] = {"factory"}
    for t in registry["templates"]:
        name = t.get("name", "?")
        folder = root / "templates" / name
        if t.get("status") == "deprecated":
            for path in (folder, stacks / f"{name}.md", workflows / f"{name}.yml"):
                if path.exists():
                    errors.append(f"{path.relative_to(root).as_posix()}: exists, but template '{name}' is deprecated in templates.json")
            continue
        known_stacks.add(t["stack"])
        known_flows.add(t["workflow"])
        if not folder.is_dir():
            errors.append(f"templates/{name}: folder missing")
            continue
        for rel in ("README.md", "CLAUDE.md"):
            if not (folder / rel).exists():
                errors.append(f"templates/{name}/{rel}: missing")
        claude = folder / "CLAUDE.md"
        if claude.exists() and ROUTING not in claude.read_text(encoding="utf-8"):
            errors.append(f"templates/{name}/CLAUDE.md: does not point at {ROUTING}")
        if not (stacks / f"{t['stack']}.md").exists():
            errors.append(f"factory/standards/stacks/{t['stack']}.md: missing (stack standards for {name})")
        if not (workflows / f"{t['workflow']}.yml").exists():
            errors.append(f".github/workflows/{t['workflow']}.yml: missing (CI for {name})")
    listed = {t["name"] for t in registry["templates"]}
    for folder in sorted(p for p in (root / "templates").iterdir() if p.is_dir()) if (root / "templates").is_dir() else []:
        if folder.name not in listed:
            errors.append(f"templates/{folder.name}: not in templates.json")
    errors += [f"factory/standards/stacks/{s.name}: no template uses this stack file" for s in sorted(stacks.glob("*.md")) if s.stem not in known_stacks]
    errors += [f".github/workflows/{f.name}: no template uses this workflow" for f in sorted(workflows.glob("*.yml")) if f.stem not in known_flows]


def check_modules(root: Path, registry: dict, errors: list[str]) -> None:
    """Each template's module.json agrees with its registry entry and with its files."""
    for t in ready(registry):
        name = t["name"]
        path = root / "templates" / name / "module.json"
        listed = t.get("modules", [])
        if not path.exists():
            if listed:
                errors.append(f"templates/{name}/module.json: missing (templates.json lists modules for {name})")
            continue
        if not listed:
            errors.append(f"templates/{name}/module.json: exists, but templates.json lists no modules for {name}")
            continue
        try:
            man = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"templates/{name}/module.json: not valid JSON ({exc})")
            continue
        modules = man.get("modules", {})
        if sorted(modules) != sorted(listed):
            errors.append(f"templates/{name}/module.json: modules {sorted(modules)} differ from templates.json {sorted(listed)}")
        errors += [f"templates/{name}/module.json: missing '{k}'" for k in ("template", "runtime", "package", "rewrite", "common") if k not in man]
        if man.get("template") != name:
            errors.append(f"templates/{name}/module.json: 'template' says {man.get('template')!r}")
        folder = root / "templates" / name
        entries = list(man.get("common", {}).get("paths", [])) + list(man.get("common", {}).get("tests", []))
        for mod_name, mod in modules.items():
            errors += [f"templates/{name}/module.json: module {mod_name} needs unknown module {n}" for n in mod.get("needs", []) if n not in modules]
            entries += mod.get("paths", []) + mod.get("tests", [])
        errors += [f"templates/{name}/module.json: {e['from']} does not exist" for e in entries if not (folder / e["from"]).exists()]
        for mod_name in modules:
            seen: list[str] = []
            stack = [mod_name]
            while stack:
                current = stack.pop()
                if current in seen:
                    continue
                seen.append(current)
                needs = modules.get(current, {}).get("needs", [])
                stack += [n for n in needs if n in modules]
                if mod_name in needs:
                    errors.append(f"templates/{name}/module.json: module {mod_name} needs itself through {current}")
                    break


def check_schemas(root: Path, errors: list[str]) -> None:
    import jsonschema

    for name in lib.SCHEMAS:
        path = root / "factory" / "schemas" / f"{name}.schema.json"
        if not path.exists():
            errors.append(f"factory/schemas/{name}.schema.json: missing")
            continue
        try:
            jsonschema.Draft202012Validator.check_schema(lib.read_json(path))
        except (ValueError, jsonschema.SchemaError) as exc:
            errors.append(f"factory/schemas/{name}.schema.json: not a valid schema ({str(exc).splitlines()[0]})")


def check_context(root: Path, errors: list[str]) -> None:
    context = root / "factory" / "context"
    for item in CONTEXT_FILES:
        options = (item,) if isinstance(item, str) else item
        if not any((context / rel).exists() for rel in options):
            errors.append(f"factory/context/{' or '.join(options)}: missing")
    errors += [f"factory/context/lenses/{lens}.md: missing" for lens in LENSES if not (context / "lenses" / f"{lens}.md").exists()]
    for path in sorted([*context.glob("policies.md"), *context.glob("*/policies.md"), *context.glob("*/*/policies.md")]):
        rel = path.relative_to(root).as_posix()
        policies = path.read_text(encoding="utf-8")
        ids = re.findall(r"(?m)^\| (POL-\d+) \|", policies)
        if len(ids) != len(set(ids)):
            errors.append(f"{rel}: a policy ID is used twice")
        errors += [f"{rel}:{n}: fill in {m} (the data classes and other policies)" for n, line in enumerate(policies.splitlines(), 1)
                   for m in PLACEHOLDER.findall(line)]
    for name in ("scopes.json", "scopes.example.json"):
        if (context / name).exists():
            try:
                reg = lib.read_json(context / name)
            except ValueError as exc:
                errors.append(f"factory/context/{name}: not valid JSON ({exc})")
                continue
            errors += [f"factory/context/{name}: {p}" for p in scopes.problems(reg, root)]
            if name == "scopes.json":
                errors += [f"factory/context/scopes.json: {where}: fill in {m}" for where, m in placeholders(reg)]


def placeholders(data: object, where: str = "") -> list[tuple[str, str]]:
    """Unfilled {{...}} placeholders in a JSON value, with where they are."""
    if isinstance(data, dict):
        return [found for k, v in data.items() for found in placeholders(v, f"{where}/{k}" if where else k)]
    if isinstance(data, list):
        return [found for i, v in enumerate(data) for found in placeholders(v, f"{where}/{i}")]
    return [(where, m) for m in PLACEHOLDER.findall(data)] if isinstance(data, str) else []


def check_ideas(root: Path, errors: list[str]) -> None:
    ideas = root / "ideas"
    reg = scopes.registry(root)
    for folder in sorted(p for p in ideas.iterdir() if p.is_dir()) if ideas.is_dir() else []:
        path = folder / "state.json"
        rel = f"ideas/{folder.name}/state.json"
        if not path.exists():
            errors.append(f"{rel}: missing")
            continue
        try:
            state = lib.read_json(path)
        except ValueError as exc:
            errors.append(f"{rel}: not valid JSON ({exc})")
            continue
        errors += [f"{rel}: {p}" for p in lib.validate("state", state, root)]
        if state.get("slug") != folder.name:
            errors.append(f"{rel}: slug {state.get('slug')!r} does not match the folder")
        errors += [f"{rel}: scope names {u}, not in factory/context/scopes.json" for u in scopes.unknown(scopes.idea_scope(state), reg)]


def check_catalogue(root: Path, errors: list[str], warnings: list[str]) -> None:
    assets = root / "catalogue" / "assets"
    reg = scopes.registry(root)
    ids: set[str] = set()
    entries = []
    for path in sorted(assets.glob("*.json")) if assets.is_dir() else []:
        rel = path.relative_to(root).as_posix()
        try:
            entry = lib.read_json(path)
        except ValueError as exc:
            errors.append(f"{rel}: not valid JSON ({exc})")
            continue
        problems = lib.validate("catalogue-entry", entry, root)
        errors += [f"{rel}: {p}" for p in problems]
        if problems:
            continue
        if path.stem != entry["id"]:
            errors.append(f"{rel}: id {entry['id']} does not match the file name")
        ids.add(entry["id"])
        entries.append((rel, entry))
        if entry["history"][-1]["status"] != entry["status"]:
            errors.append(f"{rel}: status {entry['status']} differs from the last history entry")
        scope = scopes.entry_scope(entry)
        if scope != scopes.GROUP:
            try:
                scopes.parse(scope, reg)
            except lib.FactoryError:
                errors.append(f"{rel}: scope {scope} is not in factory/context/scopes.json")
        if entry["type"] in ("system", "process", "policy"):  # a reference card points at its source of truth
            if entry["status"] == "confirmed" and entry["review_by"] < lib.today():
                warnings.append(f"{rel}: card is stale (review_by {entry['review_by']}); ask {entry['maintainer']} to confirm it")
            continue
        ref = entry["source"]["ref"]
        if not ref.startswith("SRC-") and not (root / ref).exists():
            errors.append(f"{rel}: source {ref} does not exist")
        if ref.startswith("SRC-") and not (root / "catalogue" / "sources" / ref / "source.json").exists():
            errors.append(f"{rel}: source record {ref} does not exist")
        if entry["status"] == "approved" and not any(e["result"] == "passed" for e in entry["evidence"]):
            errors.append(f"{rel}: approved without any passed evidence")
    for rel, entry in entries:
        for other in [entry.get("parent"), entry.get("replaced_by"), *entry.get("related", [])]:
            if other and other not in ids:
                errors.append(f"{rel}: refers to {other}, which is not in the catalogue")
    by_ref = {e["source"]["ref"]: (rel, e) for rel, e in entries if e["type"] == "template"}
    for t in ready(lib.registry(root)):
        found = by_ref.get(f"templates/{t['name']}")
        if found is None:
            errors.append(f"catalogue: template {t['name']} has no catalogue entry (type template, source templates/{t['name']})")
        elif found[1]["version"] != t["version"]:
            errors.append(f"{found[0]}: version {found[1]['version']} differs from templates.json ({t['version']})")
        if found is not None:
            module_names = {e["name"] for _rel, e in entries if e["type"] == "module" and e.get("parent") == found[1]["id"]}
            for mod in t.get("modules", []):
                if f"{t['name']}:{mod}" not in module_names:
                    errors.append(f"catalogue: module {t['name']}:{mod} has no catalogue entry (parent {found[1]['id']})")
    sources = root / "catalogue" / "sources"
    for path in sorted(sources.glob("*/source.json")) if sources.is_dir() else []:
        rel = path.relative_to(root).as_posix()
        record = lib.read_json(path)
        errors += [f"{rel}: {p}" for p in lib.validate("source-record", record, root)]
        errors += [f"{rel}: candidate {c} is not in the catalogue" for c in record.get("candidates", []) if c not in ids]


def check_tables(root: Path, registry: dict, errors: list[str], fix: bool) -> list[str]:
    fixed = []
    for rel, kind in TABLES:
        path = root / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        if START not in text or END not in text:
            errors.append(f"{rel}: needs the markers {START} and {END} around the generated table")
            continue
        before, rest = text.split(START, 1)
        body, after = rest.split(END, 1)
        table = render(kind, registry)
        if body.strip() == table.strip():
            continue
        if fix:
            path.write_text(f"{before}{START}\n{table}\n{END}{after}", encoding="utf-8", newline="\n")
            fixed.append(rel)
        else:
            errors.append(f"{rel}: the template table is out of date with templates.json (run --fix)")
    return fixed


def check_removed_names(root: Path, registry: dict, errors: list[str]) -> None:
    removed = [t["name"] for t in registry["templates"] if t.get("status") == "deprecated"]
    for pattern in CURRENT_DOCS if removed else []:
        for path in sorted(root.glob(pattern)):
            text = path.read_text(encoding="utf-8")
            for name in removed:
                if re.search(rf"\b{re.escape(name)}\b", text):
                    errors.append(f"{path.relative_to(root).as_posix()}: mentions the removed template '{name}'")


def run(root: Path, fix: bool = False, warnings: list[str] | None = None) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings = [] if warnings is None else warnings
    registry = lib.registry(root)
    check_registry(registry, errors)
    check_schemas(root, errors)
    if errors:
        return errors, []
    check_files(root, registry, errors)
    check_modules(root, registry, errors)
    check_context(root, errors)
    check_ideas(root, errors)
    check_catalogue(root, errors, warnings)
    fixed = check_tables(root, registry, errors, fix)
    check_removed_names(root, registry, errors)
    return errors, fixed


def main(argv: list[str]) -> int:
    root = Path(argv[argv.index("--root") + 1]).resolve() if "--root" in argv else lib.ROOT
    warnings: list[str] = []
    errors, fixed = run(root, fix="--fix" in argv, warnings=warnings)
    for rel in fixed:
        print(f"regenerated the template table in {rel}")
    for w in warnings:
        print(f"  warning: {w}")
    if errors:
        print(f"check_factory: {len(errors)} problem(s)")
        for e in errors:
            print("  " + e)
        return 1
    print("check_factory: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
