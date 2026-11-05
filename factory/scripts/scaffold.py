#!/usr/bin/env python3
"""Create an idea's working folder, and later its app from a template.

Usage:
  python factory/scripts/scaffold.py new <slug> --name "Readable name" [--kind app|factory-asset|demo] [--spike]
  python factory/scripts/scaffold.py overview <slug>       the overview, filled from the assessment (end of Develop and Assess)
  python factory/scripts/scaffold.py roadmap <slug>        a project or programme's roadmap, epic by epic (Develop and Assess)
  python factory/scripts/scaffold.py definition <slug>     the Application Definition: the solution choices (start of Spec)
  python factory/scripts/scaffold.py spec <slug>           the spec pack stubs (Spec)
  python factory/scripts/scaffold.py app <slug> <template>

`new` makes ideas/<slug>/ with state.json, idea.md, the idea brief and assessment stubs (with --spike, the
one-page spike card, spike.md, in their place), decisions.md,
changes.md and empty gates/, source/ and spec/ folders, at the start of Develop and Assess (an idea
captured in ideas/pipeline.json is made by `pipeline.py develop`, which calls it). `app` copies templates/<template> into ideas/<slug>/app
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
<Anything said while shaping it that does not belong in the brief yet.>
"""

DECISIONS_MD = """# Decisions

Decisions for this project, newest last. Small calls the factory made are logged here too (with "factory" as the decider); anything approved at a gate names the gate. A significant decision (architecture or layering, a technology or dependency, a security or data boundary, a public contract) fills every column, as a short decision record: Consequences says what it makes easier and harder, and what would make you revisit it.

| ID | Date | Decision | Options considered | Why | Consequences | Decided by | Gate |
|---|---|---|---|---|---|---|---|
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


IDEA_TEXT = "<In the owner's words: what it is, who it is for, what problem it solves.>"


def new_idea(slug: str, name: str, kind: str = "app", root: Path | None = None, idea: str | None = None,
             spike: bool = False) -> Path:
    """The idea's folder, with the brief and assessment stubs to develop and assess (factory/stages/develop-assess.md),
    or for a spike its one-page card (factory/stages/light.md)."""
    base = root or lib.ROOT
    if not re.match(lib.SLUG_PATTERN, slug):
        raise lib.FactoryError(f"slug '{slug}' must be lower-case letters, digits and hyphens, starting with a letter")
    folder = lib.idea_dir(slug, root)
    if folder.exists():
        raise lib.FactoryError(f"ideas/{slug} already exists")
    for sub in ("gates", "source", "spec"):
        (folder / sub).mkdir(parents=True)
    text = IDEA_MD.format(name=name)
    (folder / "idea.md").write_text(text.replace(IDEA_TEXT, idea.strip()) if idea else text, encoding="utf-8", newline="\n")
    (folder / "decisions.md").write_text(DECISIONS_MD, encoding="utf-8", newline="\n")
    (folder / "changes.md").write_text(CHANGES_MD, encoding="utf-8", newline="\n")
    values = {"slug": slug, "name": name, "idea": idea.strip() if idea else IDEA_TEXT}
    stubs = {"spike.md": "spike.md"} if spike else {"idea-brief.md": "idea-brief.md", "assessment.md": "assessment.md"}
    for target, stub in stubs.items():
        template = (base / "factory" / "project-files" / stub).read_text(encoding="utf-8")
        (folder / target).write_text(fill(template, values), encoding="utf-8", newline="\n")
    state = {
        "schema_version": 1,
        "slug": slug,
        "name": name,
        "kind": kind,
        "stage": "develop",
        "status": "in-progress",
        "factory_version": lib.factory_version(root),
        "updated": lib.today(),
        "template": None,
        "tier": None,
        "versions": {"assessment": "0.1", "application_definition": None, "spec": None, "composition": None},
        "gates": {str(n): {"status": "not-reached"} for n in range(1, 5)},
        "blockers": [],
        "last_verification": None,
        "imports": [],
        "changes": [],
        "next": ("Develop the spike card, spike.md (factory/stages/light.md)" if spike else
                 "Develop and Assess: draft idea-brief.md, then assessment.md (factory/stages/develop-assess.md)"),
    }
    lib.save_state(slug, state, root)
    return folder


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
    text = fill(template, {"slug": slug, "name": state["name"]})
    if state.get("tier") in (2, 3):  # a spike that grew names its tier at its Gate 3
        text = text.replace('"maturity_tier": {"value": 3, "state": "unresolved",', f'"maturity_tier": {{"value": {state["tier"]}, "state": "recommended",')
    path.write_text(text, encoding="utf-8", newline="\n")
    state["versions"]["application_definition"] = "0.1"
    lib.save_state(slug, state, root)
    return path


IMPACT_WORDS = {0.25: "minimal", 0.5: "low", 1: "medium", 2: "high", 3: "massive"}


def new_roadmap(slug: str, root: Path | None = None) -> Path:
    """A project or programme's roadmap: the end state, how it builds out, the epics (spikes among them), what starts now."""
    base = root or lib.ROOT
    state = lib.load_state(slug, root)
    path = lib.idea_dir(slug, root) / "roadmap.md"
    if path.exists():
        raise lib.FactoryError(f"ideas/{slug}/roadmap.md already exists")
    template = (base / "factory/project-files/roadmap.md").read_text(encoding="utf-8")
    path.write_text(fill(template, {"name": state["name"], "slug": slug}), encoding="utf-8", newline="\n")
    return path


def new_overview(slug: str, root: Path | None = None) -> Path:
    """The overview for sponsors and the team, with the RICE numbers, the five foundations, the one thing and the
    recommendation filled in from the assessment where it has them."""
    import pipeline

    base = root or lib.ROOT
    state = lib.load_state(slug, root)
    idea = lib.idea_dir(slug, root)
    path = idea / "overview.md"
    if path.exists():
        raise lib.FactoryError(f"ideas/{slug}/overview.md already exists")
    a, bad = pipeline.read_assessment(idea, root)
    a = a if a and not bad else None

    def num(x: float) -> str:
        return f"{x:.2f}".rstrip("0").rstrip(".")

    def filled(text: str) -> bool:
        return not lib.PLACEHOLDER.search(text)

    if a and pipeline.scored(a):
        r, period = a["rice"], a["period"]
        values = {
            "reach": f"{num(r['reach']['value'])} {period}", "impact": f"{num(r['impact']['value'])} ({IMPACT_WORDS.get(r['impact']['value'], '')})",
            "confidence": f"{num(r['confidence']['value'])}%", "effort": f"{num(r['effort']['value'])} person-weeks", "score": num(pipeline.score(r)),
            "rice_note": f"From the assessment, where it is ranked with every other idea (`ideas/pipeline.md`): Reach is the people or processes "
                         f"touched {period}; Impact runs from 0.25 (minimal) to 3 (massive) for each; Confidence is how sure the estimate is; "
                         "Effort is rough person-weeks to a first release. Priority score = Reach x Impact x Confidence / Effort.",
        }
    else:
        values = {
            "reach": "<people or processes touched per month>", "impact": "<0.25 minimal to 3 massive>",
            "confidence": "<percentage>", "effort": "<rough person-weeks>", "score": "<Reach x Impact x Confidence / Effort>",
            "rice_note": "<Assess first (factory/stages/develop-assess.md), then say what each factor means in a line.>",
        }
    rows = []
    for key, label in pipeline.FOUNDATIONS.items():
        f = (a or {}).get("foundations", {}).get(key)
        if f and f["rating"] != "unrated" and filled(f["reason"]):
            rows.append(f"| {label} | {f['rating'].capitalize()} | {f['reason']} |")
        else:
            rows.append(f"| {label} | <green, amber or red> | <why, in a line> |")
    values["foundations"] = "\n".join(rows)
    values["one_thing"] = a["one_thing"] if a and filled(a["one_thing"]) else "<The one thing to know or fix before investing.>"
    d = (a or {}).get("decision", {})
    if d.get("recommended") in pipeline.DECISIONS and filled(d.get("reason", "")):
        fix = f", fixing {', '.join(pipeline.FOUNDATIONS[k] for k in d['fix'])} first" if d["recommended"] == "get-ready" and d["fix"] else ""
        values["recommendation"] = f"Recommended: **{pipeline.DECISIONS[d['recommended']]}**{fix}. {d['reason']}"
    else:
        values["recommendation"] = "<Go, Get Ready or Stop, and why.>"
    template = (base / "factory" / "project-files" / "overview.md").read_text(encoding="utf-8")
    path.write_text(fill(template, {"name": state["name"], **values}), encoding="utf-8", newline="\n")
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
    sources = definition["sources"] if definition else [{"kind": "idea", "ref": "idea-brief.md"}]
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
    for name in ("PRINCIPLES.md", "ai-features.md"):
        shutil.copy(base / "factory" / "standards" / name, app / "standards" / name)
    shutil.copy(stack, app / "STANDARDS.md")
    if shutil.which("git"):
        subprocess.run(["git", "-C", str(app), "init", "-q"], check=True, capture_output=True)
    state["template"] = template
    lib.save_state(slug, state, root)
    return app


def main(argv: list[str]) -> int:
    if "-h" in argv[1:] or "--help" in argv[1:]:
        print(__doc__)
        return 0
    args = argv[1:]
    try:
        if len(args) >= 2 and args[0] == "new":
            name = args[args.index("--name") + 1] if "--name" in args else args[1]
            kind = args[args.index("--kind") + 1] if "--kind" in args else "app"
            idea = new_idea(args[1], name, kind, spike="--spike" in args)
            print(f"Created {idea.relative_to(lib.ROOT).as_posix()}/ (stage develop)")
            return 0
        if len(args) == 2 and args[0] in ("definition", "overview", "spec", "roadmap"):
            made = {"definition": new_definition, "overview": new_overview, "spec": new_spec, "roadmap": new_roadmap}[args[0]](args[1])
            print(f"Wrote {made.relative_to(lib.ROOT).as_posix()}")
            return 0
        if len(args) == 3 and args[0] == "app":
            app = new_app(args[1], args[2])
            print(f"Scaffolded {app.relative_to(lib.ROOT).as_posix()}/ from {args[2]}, with NOTES.md, STANDARDS.md, standards/PRINCIPLES.md and standards/ai-features.md")
            return 0
    except lib.FactoryError as exc:
        print(f"scaffold: {exc}", file=sys.stderr)
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
