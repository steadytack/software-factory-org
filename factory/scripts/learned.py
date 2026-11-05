#!/usr/bin/env python3
"""The learning loop: record choices that differed from a recommendation and clarifications the owner gave that
reach beyond one idea, record what each build showed about its assessment, recall what applies to a new idea, and
find the patterns worth changing a default, a context file, a lens or a knock-out for.

Usage:
  python factory/scripts/learned.py add --project <slug> --key <DEF-nn|key> --question "..." --recommended "..."
                                        --chosen "..." --reason "..." [--scope project]   append an observed entry
  python factory/scripts/learned.py clarify --project <slug> --topic <kebab> --question "..." --answer "..."
                                        --reason "..." --scope S [--assumed "..."]   append a clarification (key clarify-<topic>)
  python factory/scripts/learned.py recall <slug> | --scope S   the entries an idea in that scope should consider
  python factory/scripts/learned.py review [--threshold 2]     candidate changes, for an approver to accept or not
  python factory/scripts/learned.py mark <key> confirmed|superseded [--scope S] [--chosen "..."]   after the approver answers
  python factory/scripts/learned.py outcome <slug>             write ideas/<slug>/outcome.md from the Gate 1 assessment
  python factory/scripts/learned.py check [<slug>]             validate learned.md, every outcome and benefits review; with a slug, the Gate 3 check
  python factory/scripts/learned.py benefits <slug> [--published YYYY-MM-DD]   write ideas/<slug>/benefits.md at Publish
  python factory/scripts/learned.py check <slug> --review 30|90   the check for a benefits review done

learned.md is a table, one row per gate answer that differed from the recommendation, and one per clarification
(key clarify-<topic>: Recommended is what the factory had assumed, or "none"; Chosen is the owner's answer). An
idea reads only the rows its scope allows (`recall`), never another business's or brand's.
outcome.md (schema factory/schemas/outcome.schema.json) says, at Gate 3, whether each foundation's rating,
the effort and the one thing held; benefits.md (schema factory/schemas/benefits.schema.json) says, 30 and 90 days after
Publish, whether the success measures were met and the reach and impact held in use. `review` groups them: the same override in `threshold` or more projects,
a clarification scoped beyond its project (once is enough: it is the owner's own statement),
a foundation missed in that many outcomes, effort or reach mis-estimated by half or more (the median), impact
that did not hold or success measures missed in that many reviews, or the same lesson repeated. Each is a candidate, never a change: the factory changes a default only when an approver
says yes (then `mark ... confirmed` and edit defaults.md, a context file, a lens or the knock-out rules). Rules:
factory/context/README.md and the gate protocol in the factory skill.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import pipeline  # noqa: E402
import scopes  # noqa: E402

LEARNED = "factory/context/learned.md"
OUTCOME = "outcome.md"
COLUMNS = ["Date", "Project", "Key", "Question", "Recommended", "Chosen", "Reason", "Scope", "Status"]
STATUSES = ("observed", "confirmed", "superseded")
KEY = re.compile(r"^(DEF-\d{2}|[a-z][a-z0-9-]*)$")
SCOPE = re.compile(r"^(project|type|global|type:[a-z][a-z0-9-]*|brand:[a-z][a-z0-9-]*|business:[a-z][a-z0-9-]*)$")
CLARIFY = "clarify-"  # the key prefix of a clarification
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BLOCK = re.compile(r"\A\s*```json outcome\s*\n(.*?)\n```", re.S)
BENEFITS = "benefits.md"
BENEFITS_BLOCK = re.compile(r"\A\s*```json benefits\s*\n(.*?)\n```", re.S)
REVIEW_DAYS = (30, 90)
# The lens whose screening questions rate each foundation (factory/context/lenses/README.md).
LENS = {"problem": "business-value", "value": "business-value", "data": "data-and-integrations",
        "risk": "security", "people": "users-and-workflows"}
KNOCKOUTS = ("data-class", "policy", "paid-service", "duplicate")
RICE = ("reach", "impact", "confidence", "effort")
DRIFT = 1.5  # median actual/estimated effort at or above this (or at or below its inverse) is a candidate


# ---------------------------------------------------------------- learned.md
def learned_path(root: Path | None = None) -> Path:
    return (root or lib.ROOT) / LEARNED


def split(row: str) -> list[str]:
    cells = re.split(r"(?<!\\)\|", row.strip().strip("|"))
    return [c.strip().replace("\\|", "|") for c in cells]


def read(root: Path | None = None) -> tuple[list[dict], list[str]]:
    """(the entries, problems with the table). An entry is a dict keyed by the lower-case column names."""
    path = learned_path(root)
    if not path.exists():
        return [], [f"{LEARNED}: missing"]
    lines = path.read_text(encoding="utf-8").splitlines()
    header = next((n for n, line in enumerate(lines) if line.startswith("| Date |")), None)
    if header is None or split(lines[header]) != COLUMNS:
        return [], [f"{LEARNED}: needs the table | {' | '.join(COLUMNS)} |"]
    entries, bad = [], []
    for n, line in enumerate(lines[header + 2:], start=header + 3):
        if not line.startswith("|"):
            break
        cells = split(line)
        if len(cells) != len(COLUMNS):
            bad.append(f"{LEARNED}:{n}: {len(cells)} cells, not {len(COLUMNS)}")
            continue
        e = dict(zip((c.lower() for c in COLUMNS), cells))
        e["line"] = n
        bad += [f"{LEARNED}:{n}: {p}" for p in entry_problems(e)]
        entries.append(e)
    return entries, bad


def entry_problems(e: dict) -> list[str]:
    found = [f"{c.lower()} is empty" for c in COLUMNS if not e.get(c.lower())]
    if e.get("date") and not DATE.match(e["date"]):
        found.append(f"date {e['date']!r} is not YYYY-MM-DD")
    if e.get("key") and not KEY.match(e["key"]):
        found.append(f"key {e['key']!r} must be DEF-nn or a short kebab-case key")
    if e.get("scope") and not SCOPE.match(e["scope"]):
        found.append(f"scope {e['scope']!r} must be project, type, type:<kind>, global, brand:<x> or business:<b>")
    if e.get("status") and e["status"] not in STATUSES:
        found.append(f"status {e['status']!r} must be {', '.join(STATUSES)}")
    return found


def row(e: dict) -> str:
    return "| " + " | ".join(pipeline.cell(e[c.lower()]) for c in COLUMNS) + " |"


def write(entries: list[dict], root: Path | None = None) -> None:
    """Rewrite the table's rows, keeping everything around it."""
    path = learned_path(root)
    lines = path.read_text(encoding="utf-8").splitlines()
    header = next(n for n, line in enumerate(lines) if line.startswith("| Date |"))
    end = header + 2
    while end < len(lines) and lines[end].startswith("|"):
        end += 1
    lines[header + 2:end] = [row(e) for e in entries]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def add(project: str, key: str, question: str, recommended: str, chosen: str, reason: str,
        scope: str = "project", root: Path | None = None) -> dict:
    entries, bad = read(root)
    if bad:
        raise lib.FactoryError("; ".join(bad))
    e = {"date": lib.today(), "project": project, "key": key, "question": question, "recommended": recommended,
         "chosen": chosen, "reason": reason, "scope": scope, "status": "observed"}
    bad = entry_problems(e)
    if bad:
        raise lib.FactoryError("; ".join(bad))
    write(entries + [e], root)
    return e


def clarify(project: str, topic: str, question: str, answer: str, reason: str, scope: str,
            assumed: str = "none", root: Path | None = None) -> dict:
    """A clarification the owner gave, at any stage, that may reach beyond this idea. One only for this idea
    stays in its decisions.md; recorded here with scope project, it is never recalled for another idea."""
    return add(project, CLARIFY + topic, question, assumed, answer, reason, scope, root)


def recall(scope: dict, slug: str | None = None, root: Path | None = None) -> list[dict]:
    """The entries an idea in `scope` should consider, not superseded: its own project's, the global and
    app-type ones, and those of its business and the brands it may use. Never another business's or brand's."""
    entries, _bad = read(root)
    seen = scopes.visible(scope, scopes.registry(root))

    def applies(e: dict) -> bool:
        s = e["scope"]
        if s == "project":
            return e["project"] == slug
        return s in ("global", "type") or s.startswith("type:") or s in seen

    return [e for e in entries if e["status"] != "superseded" and applies(e)]


def layer(scope: str) -> str:
    """Where a clarification with this scope is written if an approver says yes."""
    kind, _, name = scope.partition(":")
    if kind == "business":
        return f"factory/context/businesses/{name}/"
    if kind == "brand":
        return f"factory/context/brands/{name}/"
    if kind == "type":
        return "factory/context/group/defaults.md (" + (f"{name} apps" if name else "that kind of app") + ")"
    return "factory/context/group/"


def mark(key: str, status: str, scope: str | None = None, chosen: str | None = None, root: Path | None = None) -> int:
    """Set the status of every entry for `key` (and `scope`, `chosen` if given) that is not superseded."""
    if status not in ("confirmed", "superseded"):
        raise lib.FactoryError("status must be confirmed or superseded")
    entries, bad = read(root)
    if bad:
        raise lib.FactoryError("; ".join(bad))
    changed = 0
    for e in entries:
        if e["key"] == key and e["status"] != "superseded" and (scope is None or e["scope"] == scope) \
                and (chosen is None or pipeline.norm(e["chosen"]) == pipeline.norm(chosen)):
            e["status"] = status
            changed += 1
    if not changed:
        raise lib.FactoryError(f"no entry for {key}" + (f" in {scope}" if scope else ""))
    write(entries, root)
    return changed


# ---------------------------------------------------------------- outcome.md
def read_outcome(idea: Path, root: Path | None = None) -> tuple[dict | None, list[str]]:
    """(the JSON block of ideas/<slug>/outcome.md, schema problems); (None, []) when there is no outcome."""
    path = idea / OUTCOME
    if not path.exists():
        return None, []
    match = BLOCK.match(path.read_text(encoding="utf-8"))
    if not match:
        return None, ["must start with a ```json outcome block"]
    try:
        data = json.loads(match.group(1))
    except ValueError as exc:
        return None, [f"the outcome block is not valid JSON ({exc})"]
    return data, lib.validate("outcome", data, root)


def new_outcome(slug: str, root: Path | None = None) -> Path:
    """Write outcome.md from the assessment approved at Gate 1: the ratings, the effort and the one thing."""
    base = root or lib.ROOT
    idea = lib.idea_dir(slug, root)
    path = idea / OUTCOME
    if path.exists():
        raise lib.FactoryError(f"ideas/{slug}/{OUTCOME} already exists")
    a, bad = pipeline.read_assessment(idea, root)
    if a is None or bad:
        raise lib.FactoryError(f"ideas/{slug} has no valid assessment" + (f" ({'; '.join(bad)})" if bad else ""))
    if a["decision"].get("decided") != "go":
        raise lib.FactoryError(f"ideas/{slug} was not a Go at Gate 1; an outcome is written after the build")
    ratings = pipeline.ratings(a)
    foundations = {k: {"rated": ratings[k], "held": "unchecked", "note": "<what the build showed>"}
                   for k in pipeline.FOUNDATIONS if k in ratings}  # a spike card rates none
    state = lib.read_json(idea / "state.json")
    template = (base / "factory/project-files" / OUTCOME).read_text(encoding="utf-8")
    text = template.replace("{foundations}", json.dumps(foundations, ensure_ascii=False)) \
        .replace("{effort}", json.dumps(a["decision"].get("timebox") if a["decision"].get("route") == "light" else a["rice"]["effort"]["value"])) \
        .replace("{one_thing}", json.dumps(a["one_thing"], ensure_ascii=False))
    text = text.replace("{slug}", slug).replace("{assessment_version}", a["version"]).replace("{name}", state.get("name", slug))
    match = BLOCK.match(text)
    block = "```json outcome\n" + json.dumps(json.loads(match.group(1)), indent=2, ensure_ascii=False) + "\n```"
    path.write_text(block + text[match.end():], encoding="utf-8", newline="\n")
    return path


def outcome_problems(o: dict, slug: str, root: Path | None = None, *, complete: bool = False) -> list[str]:
    """Problems beyond the schema; `complete` (the Gate 3 check) also refuses anything left to fill in."""
    found = [] if o["slug"] == slug else [f"slug {o['slug']!r} does not match the folder"]
    found += lesson_problems(o["lessons"], root)
    if complete:
        found += [f"foundations/{k}: held is unchecked" for k, v in o["foundations"].items() if v["held"] == "unchecked"]
        found += ["one_thing: held is unchecked"] if o["one_thing"]["held"] == "unchecked" else []
        found += ["effort: actual is 0; give the person-weeks it took"] if o["effort"]["actual"] == 0 else []
        text = json.dumps(o, ensure_ascii=False)
        found += [f"placeholder left: {m}" for m in sorted(set(lib.PLACEHOLDER.findall(text)))]
    return found


def outcomes(root: Path | None = None) -> list[dict]:
    """Every idea with an outcome: {slug, o (None if unreadable), problems}."""
    ideas = (root or lib.ROOT) / "ideas"
    rows = []
    for folder in sorted(p for p in ideas.iterdir() if p.is_dir()) if ideas.is_dir() else []:
        if (folder / OUTCOME).exists():
            o, bad = read_outcome(folder, root)
            rows.append({"slug": folder.name, "o": None if bad else o, "problems": bad})
    return rows


def gate_check(slug: str, root: Path | None = None) -> list[str]:
    """The Gate 3 check: the outcome exists, is valid and is filled in."""
    idea = lib.idea_dir(slug, root)
    o, bad = read_outcome(idea, root)
    if o is None and not bad:
        return [f"ideas/{slug}/{OUTCOME} is missing: python factory/scripts/learned.py outcome {slug}"]
    if bad:
        return [f"ideas/{slug}/{OUTCOME}: {p}" for p in bad]
    found = [f"ideas/{slug}/{OUTCOME}: {p}" for p in outcome_problems(o, slug, root, complete=True)]
    text = (idea / OUTCOME).read_text(encoding="utf-8")
    found += [f"ideas/{slug}/{OUTCOME}: placeholder left: {m}" for m in sorted(set(lib.PLACEHOLDER.findall(BLOCK.sub("", text))))]
    return found


def lesson_problems(lessons: list[dict], root: Path | None = None) -> list[str]:
    """A lesson must name a lens, knock-out rule, default or RICE factor that exists."""
    base = root or lib.ROOT
    found = []
    for lesson in lessons:
        kind, ref = lesson["kind"], lesson["ref"]
        if kind == "lens" and not (base / "factory/context/lenses" / f"{ref}.md").exists():
            found.append(f"lesson: no lens {ref!r} in factory/context/lenses/")
        elif kind == "knockout" and ref not in KNOCKOUTS:
            found.append(f"lesson: knock-out rule {ref!r} must be one of {', '.join(KNOCKOUTS)}")
        elif kind == "rice" and ref not in RICE:
            found.append(f"lesson: RICE factor {ref!r} must be one of {', '.join(RICE)}")
        elif kind == "default" and not re.fullmatch(r"DEF-\d{2}", ref):
            found.append(f"lesson: default {ref!r} must be DEF-nn")
    return found


# ---------------------------------------------------------------- benefits.md
def read_benefits(idea: Path, root: Path | None = None) -> tuple[dict | None, list[str]]:
    """(the JSON block of ideas/<slug>/benefits.md, schema problems); (None, []) when there is none."""
    path = idea / BENEFITS
    if not path.exists():
        return None, []
    match = BENEFITS_BLOCK.match(path.read_text(encoding="utf-8"))
    if not match:
        return None, ["must start with a ```json benefits block"]
    try:
        data = json.loads(match.group(1))
    except ValueError as exc:
        return None, [f"the benefits block is not valid JSON ({exc})"]
    found = lib.validate("benefits", data, root)
    if not found and tuple(r["day"] for r in data["reviews"]) != REVIEW_DAYS:
        found.append("reviews must be the 30-day and the 90-day review, in that order")
    return data, found


def new_benefits(slug: str, published: str | None = None, root: Path | None = None) -> Path:
    """Write benefits.md at Publish: the Gate 1 reach and impact, and the 30- and 90-day reviews with their due dates."""
    base = root or lib.ROOT
    idea = lib.idea_dir(slug, root)
    path = idea / BENEFITS
    if path.exists():
        raise lib.FactoryError(f"ideas/{slug}/{BENEFITS} already exists")
    a, bad = pipeline.read_assessment(idea, root)
    if a is None or bad:
        raise lib.FactoryError(f"ideas/{slug} has no valid assessment" + (f" ({'; '.join(bad)})" if bad else ""))
    state = lib.read_json(idea / "state.json")
    if state.get("stage") != "done":
        raise lib.FactoryError(f"ideas/{slug} is not published yet; the benefits review starts at Publish")
    day = dt.date.fromisoformat(published or lib.today())
    estimated = {"reach": a["rice"]["reach"]["value"], "period": a["period"], "impact": a["rice"]["impact"]["value"]}
    reviews = [{"day": n, "due": (day + dt.timedelta(days=n)).isoformat(), "done": None,
                "measures": [{"measure": "<a success measure from the brief or doc 02>", "target": "<its target>",
                              "actual": "<what was measured, and how>", "met": "unchecked"}],
                "reach": {"actual": None, "note": "<how it was counted>"},
                "impact": {"held": "unchecked", "note": "<what showed it>"},
                "in_use": {"held": "unchecked", "note": "<is it used as the to-be process expects?>"},
                "lessons": []} for n in REVIEW_DAYS]
    template = (base / "factory/project-files" / BENEFITS).read_text(encoding="utf-8")
    text = template.replace("{estimated}", json.dumps(estimated)).replace("{reviews}", json.dumps(reviews, ensure_ascii=False))
    text = text.replace("{slug}", slug).replace("{published}", day.isoformat()).replace("{name}", state.get("name", slug))
    match = BENEFITS_BLOCK.match(text)
    block = "```json benefits\n" + json.dumps(json.loads(match.group(1)), indent=2, ensure_ascii=False) + "\n```"
    path.write_text(block + text[match.end():], encoding="utf-8", newline="\n")
    return path


def review_problems(review: dict) -> list[str]:
    """What a review still needs before it counts as done."""
    day = review["day"]
    found = [f"{day}-day review: done is not set"] if not review["done"] else []
    found += [f"{day}-day review: measure {m['measure']!r}: met is unchecked" for m in review["measures"] if m["met"] == "unchecked"]
    found += [f"{day}-day review: reach actual is not measured"] if review["reach"]["actual"] is None else []
    found += [f"{day}-day review: {k} held is unchecked" for k in ("impact", "in_use") if review[k]["held"] == "unchecked"]
    text = json.dumps(review, ensure_ascii=False)
    found += [f"{day}-day review: placeholder left: {m}" for m in sorted(set(lib.PLACEHOLDER.findall(text)))]
    return found


def benefits_check(slug: str, day: int, root: Path | None = None) -> list[str]:
    """The check for a benefits review done: the file is valid and that review is filled in."""
    if day not in REVIEW_DAYS:
        return ["--review must be 30 or 90"]
    idea = lib.idea_dir(slug, root)
    b, bad = read_benefits(idea, root)
    where = f"ideas/{slug}/{BENEFITS}"
    if b is None and not bad:
        return [f"{where} is missing: python factory/scripts/learned.py benefits {slug}"]
    if bad:
        return [f"{where}: {p}" for p in bad]
    review = next(r for r in b["reviews"] if r["day"] == day)
    return [f"{where}: {p}" for p in review_problems(review) + lesson_problems(review["lessons"], root)]


def benefits(root: Path | None = None) -> list[dict]:
    """Every idea with a benefits review: {slug, b (None if unreadable), problems}."""
    ideas = (root or lib.ROOT) / "ideas"
    rows = []
    for folder in sorted(p for p in ideas.iterdir() if p.is_dir()) if ideas.is_dir() else []:
        if (folder / BENEFITS).exists():
            b, bad = read_benefits(folder, root)
            rows.append({"slug": folder.name, "b": None if bad else b, "problems": bad})
    return rows


def reviews_due(root: Path | None = None, today: str | None = None) -> list[dict]:
    """Benefits reviews not yet done: {slug, day, due, overdue}, soonest first (for ideas/pipeline.md)."""
    today = today or lib.today()
    due = [{"slug": r["slug"], "day": rv["day"], "due": rv["due"], "overdue": rv["due"] < today}
           for r in benefits(root) if r["b"] for rv in r["b"]["reviews"] if not rv["done"]]
    return sorted(due, key=lambda d: (d["due"], d["slug"]))


def latest_review(b: dict) -> dict | None:
    """The latest review done and filled in (the 90-day over the 30-day), or None."""
    done = [rv for rv in b["reviews"] if rv["done"] and not review_problems(rv)]
    return done[-1] if done else None


def problems(root: Path | None = None) -> list[str]:
    """learned.md, every outcome and every benefits review (in full only once past the stub: see the checks)."""
    _entries, found = read(root)
    for r in outcomes(root):
        where = f"ideas/{r['slug']}/{OUTCOME}"
        found += [f"{where}: {p}" for p in r["problems"]]
        if r["o"]:
            found += [f"{where}: {p}" for p in outcome_problems(r["o"], r["slug"], root)]
    for r in benefits(root):
        where = f"ideas/{r['slug']}/{BENEFITS}"
        found += [f"{where}: {p}" for p in r["problems"]]
        if r["b"]:
            found += [f"{where}: slug {r['b']['slug']!r} does not match the folder"] if r["b"]["slug"] != r["slug"] else []
            found += [f"{where}: {p}" for rv in r["b"]["reviews"] for p in lesson_problems(rv["lessons"], root)]
    return found


# ---------------------------------------------------------------- review
def review(root: Path | None = None, threshold: int = 2) -> list[str]:
    """Candidate changes, each a line for the gate page's Decisions for you. Never applies any."""
    entries, _bad = read(root)
    found = []
    groups: dict[tuple[str, str, str], list[dict]] = {}
    clarified: dict[tuple[str, str, str], list[dict]] = {}
    for e in entries:
        if e["status"] == "observed" and e["key"].startswith(CLARIFY):
            if e["scope"] != "project":
                clarified.setdefault((e["key"], e["scope"], pipeline.norm(e["chosen"])), []).append(e)
        elif e["status"] == "observed":
            groups.setdefault((e["key"], e["scope"], pipeline.norm(e["chosen"])), []).append(e)
    for (key, scope, _), es in sorted(groups.items()):
        projects = sorted({e["project"] for e in es})
        if len(projects) >= threshold:
            found.append(f"Promote to a default? {key} ({scope}): recommended {es[-1]['recommended']!r}, "
                         f"chosen {es[-1]['chosen']!r} in {len(projects)} projects ({', '.join(projects)})")
    for (key, scope, _), es in sorted(clarified.items()):
        projects = sorted({e["project"] for e in es})
        found.append(f"Write into {layer(scope)}? {key} ({scope}): {es[-1]['question']}: {es[-1]['chosen']!r} "
                     f"(said in {', '.join(projects)})")
    done = [r for r in outcomes(root) if r["o"]]
    for k, lens in LENS.items():
        missed = sorted(r["slug"] for r in done if r["o"]["foundations"].get(k, {}).get("held") == "no")
        if len(missed) >= threshold:
            found.append(f"Review the {lens} screening questions? {pipeline.FOUNDATIONS[k]} was rated wrongly "
                         f"in {len(missed)} builds ({', '.join(missed)})")
    ratios = [r["o"]["effort"]["actual"] / r["o"]["effort"]["estimated"] for r in done if r["o"]["effort"]["actual"] > 0]
    if len(ratios) >= threshold:
        median = statistics.median(ratios)
        if median >= DRIFT or median <= 1 / DRIFT:
            found.append(f"Re-calibrate RICE effort? Builds took {pipeline.number(round(median, 2))}x the estimate "
                         f"(median of {len(ratios)})")
    reviewed = [(r["slug"], r["b"], rv) for r in benefits(root) if r["b"] for rv in [latest_review(r["b"])] if rv]
    reach = [rv["reach"]["actual"] / b["estimated"]["reach"] for _s, b, rv in reviewed if b["estimated"]["reach"] > 0]
    if len(reach) >= threshold:
        median = statistics.median(reach)
        if median >= DRIFT or median <= 1 / DRIFT:
            found.append(f"Re-calibrate RICE reach? Reach in use was {pipeline.number(round(median, 2))}x the Gate 1 estimate "
                         f"(median of {len(reach)} published ideas)")
    missed = sorted(s for s, _b, rv in reviewed if rv["impact"]["held"] == "no")
    if len(missed) >= threshold:
        found.append(f"Re-calibrate RICE impact? Impact did not hold in {len(missed)} published ideas ({', '.join(missed)})")
    missed = sorted(s for s, _b, rv in reviewed if any(m["met"] == "no" for m in rv["measures"]))
    if len(missed) >= threshold:
        found.append(f"Review the business-value screening questions? Success measures were missed in "
                     f"{len(missed)} published ideas ({', '.join(missed)})")
    lessons: dict[tuple[str, str], list[str]] = {}
    for r in done:
        for lesson in r["o"]["lessons"]:
            lessons.setdefault((lesson["kind"], lesson["ref"]), []).append(r["slug"])
    for slug, _b, rv in reviewed:
        for lesson in rv["lessons"]:
            lessons.setdefault((lesson["kind"], lesson["ref"]), []).append(slug)
    for (kind, ref), slugs in sorted(lessons.items()):
        if len(set(slugs)) >= threshold:
            found.append(f"Change the {kind} {ref}? The same lesson came up in {len(set(slugs))} builds ({', '.join(sorted(set(slugs)))})")
    return found


# ---------------------------------------------------------------- command line
def main(argv: list[str]) -> int:
    if "-h" in argv[1:] or "--help" in argv[1:]:
        print(__doc__)
        return 0
    args = argv[1:]
    try:
        opts = {name: pipeline.option(args, f"--{name}") for name in
                ("project", "key", "question", "recommended", "chosen", "reason", "scope", "threshold", "published", "review",
                  "topic", "answer", "assumed")}
        if args == ["add"]:
            need = ("project", "key", "question", "recommended", "chosen", "reason")
            missing = [f"--{n}" for n in need if not opts[n]]
            if missing:
                raise lib.FactoryError(f"add needs {', '.join(missing)}")
            e = add(*(opts[n] for n in need), scope=opts["scope"] or "project")
            print(f"learned: observed {e['key']} for {e['project']} ({e['scope']})")
            return 0
        if args == ["clarify"]:
            need = ("project", "topic", "question", "answer", "reason", "scope")
            missing = [f"--{n}" for n in need if not opts[n]]
            if missing:
                raise lib.FactoryError(f"clarify needs {', '.join(missing)}")
            e = clarify(*(opts[n] for n in need), assumed=opts["assumed"] or "none")
            print(f"learned: clarification {e['key']} for {e['project']} ({e['scope']})")
            return 0
        if args[:1] == ["recall"] and (len(args) == 2 or len(args) == 1 and opts["scope"]):
            slug = args[1] if len(args) == 2 else None
            scope = scopes.idea_scope(lib.load_state(slug)) if slug else scopes.parse(opts["scope"], scopes.registry())
            found = recall(scope, slug)
            print(f"learned: {len(found)} entr{'y' if len(found) == 1 else 'ies'} to consider"
                  + "".join(f"\n  {e['date']} {e['project']} {e['key']} ({e['scope']}, {e['status']}): {e['question']}: "
                            f"{e['chosen']!r}" + ("" if e["key"].startswith(CLARIFY) else f" (recommended {e['recommended']!r})")
                            + f"; {e['reason']}" for e in found))
            return 0
        if args == ["review"]:
            found = review(threshold=int(opts["threshold"] or 2))
            print(f"learned: {len(found)} candidate change(s)" + "".join(f"\n  {n}. {c}" for n, c in enumerate(found, 1)))
            return 0
        if len(args) == 3 and args[0] == "mark":
            n = mark(args[1], args[2], opts["scope"], opts["chosen"])
            print(f"learned: {n} entr{'y' if n == 1 else 'ies'} for {args[1]} marked {args[2]}"
                  + ("; now edit defaults.md (or the lens or knock-out rule) and record it in CHANGELOG.md" if args[2] == "confirmed" else ""))
            return 0
        if len(args) == 2 and args[0] == "outcome":
            path = new_outcome(args[1])
            print(f"learned: wrote {path.relative_to(lib.ROOT).as_posix()} (fill in held, the actual effort and any lessons)")
            return 0
        if len(args) == 2 and args[0] == "benefits":
            path = new_benefits(args[1], opts["published"])
            print(f"learned: wrote {path.relative_to(lib.ROOT).as_posix()} (the 30- and 90-day reviews are due as it says)")
            return 0
        if args and args[0] == "check" and len(args) in (1, 2):
            if opts["review"] and len(args) == 2:
                bad = problems() + benefits_check(args[1], int(opts["review"]))
            else:
                bad = problems() + (gate_check(args[1]) if len(args) == 2 else [])
            for p in bad:
                print("  " + p)
            print(f"learned: FAILED ({len(bad)} problem(s))" if bad else "learned: OK")
            return 1 if bad else 0
    except (lib.FactoryError, ValueError) as exc:
        print(f"learned: {exc}", file=sys.stderr)
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
