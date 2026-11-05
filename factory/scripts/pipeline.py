#!/usr/bin/env python3
"""Stage 1, Develop and Assess: capture ideas, develop each into a brief, assess it, rank them, record Gate 1.

Usage:
  python factory/scripts/pipeline.py capture                 add every line of ideas/inbox.md (made if missing) and every
                                                             row of ideas/inbox.csv (the idea card) not yet captured
  python factory/scripts/pipeline.py add "<idea>" [--source document]   add one idea
  python factory/scripts/pipeline.py develop IDEA-nnn [<slug>] [--owner "<name>"] [--spike]   make ideas/<slug>/ with the
                                                             brief and assessment stubs, or with --spike the one-page
                                                             spike card (spike.md); the owner is the person developing it
  python factory/scripts/pipeline.py check                   validate ideas/pipeline.json and every assessment
  python factory/scripts/pipeline.py render                  validate, then write the ranked ideas/pipeline.md
  python factory/scripts/pipeline.py decide <slug> go|get-ready|stop --by <approver> --reply "..." [--reason "..."]
        [--route full|light|roadmap [--timebox N]] [--fix data,risk --owner "..." [--review YYYY-MM-DD]]   Gate 1, signed
        off by a gate approver for the idea's scope (scopes.json); the idea's owner may only stop (withdraw) it
  python factory/scripts/pipeline.py epic <parent> E<n> [<slug>] [--owner "<name>"]   start an epic of an approved
                                                             roadmap (a project or programme) as an idea of its own
  python factory/scripts/pipeline.py reassess <slug>         after Get Ready: a light re-assessment, not a restart
  python factory/scripts/pipeline.py approve-data <slug> <class> --by <approver> --reply "..."   POL-11: a class allowed only by approval
  python factory/scripts/pipeline.py light <slug> grow|keep|stop --by <approver> --reply "..." [--tier 2|3] [--reason "..."]
                                                             Gate 3 of the light route (a spike); grow names the tier

The register is ideas/pipeline.json (schema factory/schemas/pipeline.schema.json): every idea captured,
and the folder it was developed into. Each developed idea's assessment is the JSON block at the top of
ideas/<slug>/assessment.md, or of a spike's card ideas/<slug>/spike.md (schema factory/schemas/assessment.schema.json): data classes, any knock-out,
the five foundations rated green, amber or red, the RICE factors, the one thing, and the decision. The
assistant writes those; this script does the arithmetic and the ranking, so the order is reproducible:
score = Reach x Impact x Confidence% / Effort, ties broken by higher confidence, then lower effort, then slug.
Data classes are checked against the data-classes table (POL-11) in every policies.md of the idea's scope:
a class answered "no" there must be knocked out. Rules: factory/stages/develop-assess.md (the light route: factory/stages/light.md;
a project or programme's roadmap: factory/dormant/roadmap.md).
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import scaffold  # noqa: E402
import scopes  # noqa: E402

REGISTER = "ideas/pipeline.json"
INBOX = "ideas/inbox.md"
INBOX_CSV = "ideas/inbox.csv"
# The idea card's questions (factory/project-files/idea-card.md), as the columns of ideas/inbox.csv; any form
# tool's export works once its headers are these. Other columns (a timestamp, an email) are ignored, never stored.
CARD_COLUMNS = [("title", ""), ("problem", ""), ("who", "Who it affects"), ("today", "How it's done today"),
                ("better", "What better looks like"), ("data", "Data it touches")]
REPORT = "ideas/pipeline.md"
ASSESSMENT = "assessment.md"
BRIEF = "idea-brief.md"
CARD = "spike.md"  # a spike's one-page card (the light route), in place of the brief, assessment, overview and plan
ROADMAP = "roadmap.md"  # a project or programme's build-out over time, epic by epic
SCALES = {"app": "App", "project": "Project", "programme": "Programme"}
EPIC_KINDS = ("spike", "build", "project")  # project: delivered outside the factory, by a project with IT
EPIC_ROW = re.compile(r"^\|\s*(E\d+)\s*\|(.*)\|\s*$")
REVIEW_DAYS = 28  # a Get Ready idea comes back to Gate 1 this long after the decision unless --review says otherwise
LIGHT_RESULTS = {"grow": "Grow", "keep": "Keep", "stop": "Stop"}

IMPACTS = (0.25, 0.5, 1, 2, 3)
FOUNDATIONS = {"problem": "Problem", "value": "Value", "data": "Data Foundations", "risk": "Risk", "people": "People & Process"}
DECISIONS = {"go": "Go", "get-ready": "Get Ready", "stop": "Stop"}
GATE_STATUS = {"go": "approved", "get-ready": "get-ready", "stop": "stopped"}
BULLET = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?")
BLOCK = re.compile(r"\A\s*```json assessment\s*\n(.*?)\n```", re.S)
CLASS_COLUMN = "may be used"


def register_path(root: Path | None = None) -> Path:
    return (root or lib.ROOT) / REGISTER


def load(root: Path | None = None) -> dict:
    path = register_path(root)
    if not path.exists():
        return {"schema_version": 1, "entries": []}
    return lib.read_json(path)


def save(reg: dict, root: Path | None = None) -> None:
    reg["updated"] = lib.today()
    lib.write_json(register_path(root), reg)


def norm(text: str) -> str:
    return " ".join(text.lower().split())


def title_of(idea: str) -> str:
    """A short title: the text before the first colon, dash or full stop, at most eight words."""
    head = re.split(r"\s[-:–]\s|[:.]\s", idea.strip(), maxsplit=1)[0]
    words = head.split()
    return " ".join(words[:8]) + ("..." if len(words) > 8 else "")


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    slug = re.sub(r"^[^a-z]+", "", slug)
    return "-".join(slug.split("-")[:5]) or "idea"


# ---------------------------------------------------------------- capture
INBOX_TEXT = """# Inbox

<!-- Put ideas here, one per line or bullet, in your own words. `/factory` captures every line not yet in
ideas/pipeline.json, develops each into a short brief, assesses it (the five foundations and RICE) and ranks
them in ideas/pipeline.md (factory/stages/develop-assess.md). Lines already captured are skipped; you may delete them. -->
"""


def ensure_inbox(root: Path | None = None) -> bool:
    """Write ideas/inbox.md when it is missing; True if written."""
    path = (root or lib.ROOT) / INBOX
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(INBOX_TEXT, encoding="utf-8", newline="\n")
    return True


def inbox_lines(root: Path | None = None) -> list[str]:
    """One idea per line or bullet; headings, quotes, comments and blank lines are not ideas."""
    path = (root or lib.ROOT) / INBOX
    if not path.exists():
        return []
    text = re.sub(r"<!--.*?-->", "", path.read_text(encoding="utf-8"), flags=re.S)
    out = []
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith(("#", ">", "|", "```")):
            continue
        idea = BULLET.sub("", line).strip()
        if idea:
            out.append(idea)
    return out


def inbox_csv_ideas(root: Path | None = None) -> list[str]:
    """One idea per row of ideas/inbox.csv; a row without a problem is not an idea. The title, if given, leads."""
    path = (root or lib.ROOT) / INBOX_CSV
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as fh:  # utf-8-sig: spreadsheet exports start with a BOM
        rows = list(csv.DictReader(fh))
    out = []
    for row in rows:
        cells = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items() if isinstance(v, str)}
        if not cells.get("problem"):
            continue
        head = f"{cells['title']}: {cells['problem']}" if cells.get("title") else cells["problem"]
        rest = [f"{label}: {cells[key]}." for key, label in CARD_COLUMNS[2:] if cells.get(key)]
        out.append(" ".join([head.rstrip(".") + ".", *rest]))
    return out


def inbox_ideas(root: Path | None = None) -> list[str]:
    return inbox_lines(root) + inbox_csv_ideas(root)


def next_id(reg: dict) -> str:
    used = [int(e["id"][5:]) for e in reg["entries"] if re.match(r"^IDEA-\d{3}$", e.get("id", ""))]
    return f"IDEA-{max(used, default=0) + 1:03d}"


def add(reg: dict, idea: str, source: str = "single") -> dict | None:
    """Capture an idea; None when the same text is already in the register."""
    if any(norm(e["idea"]) == norm(idea) for e in reg["entries"]):
        return None
    entry = {"id": next_id(reg), "title": title_of(idea), "idea": idea.strip(), "source": source, "added": lib.today()}
    reg["entries"].append(entry)
    return entry


def capture(reg: dict, root: Path | None = None) -> list[dict]:
    ensure_inbox(root)
    return [e for e in (add(reg, line, "inbox") for line in inbox_ideas(root)) if e]


def not_captured(reg: dict, root: Path | None = None) -> list[str]:
    known = {norm(e["idea"]) for e in reg["entries"]}
    return [line for line in inbox_ideas(root) if norm(line) not in known]


def find(reg: dict, ref: str) -> dict:
    for e in reg["entries"]:
        if e["id"] == ref:
            return e
    raise lib.FactoryError(f"{ref} is not in {REGISTER}")


# ---------------------------------------------------------------- develop
def develop(reg: dict, ref: str, slug: str | None = None, root: Path | None = None, owner: str | None = None,
            spike: bool = False) -> Path:
    """Make the idea's folder, with the idea in idea.md and the brief and assessment stubs, and link it in the register.
    The owner is the person developing it (Develop and Assess is theirs; Gate 1 is signed off by someone else)."""
    e = find(reg, ref)
    if e.get("slug"):
        raise lib.FactoryError(f"{ref} was already developed into ideas/{e['slug']}")
    slug = slug or slugify(e["title"])
    scope = e.get("scope", reg.get("scope", scopes.GROUP))
    parsed = scopes.parse(scope, scopes.registry(root))
    idea = scaffold.new_idea(slug, e["title"], idea=e["idea"], root=root, spike=spike)
    with (idea / "idea.md").open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(f"\nCaptured as {ref} in `{REGISTER}` on {e['added']} ({e['source']}).\n")
    if scope != scopes.GROUP or owner or e.get("parent"):
        state = lib.load_state(slug, root)
        if scope != scopes.GROUP:
            state["scope"] = parsed
        if owner:
            state["owner"] = owner
        if e.get("parent"):
            state.update(parent=e["parent"], epic=e["epic"])
        lib.save_state(slug, state, root)
    e["slug"] = slug
    return idea


# ---------------------------------------------------------------- data classes (POL-11)
def class_table(path: Path) -> dict[str, tuple[str, str]]:
    """{class (lower case): (verdict, note)} from a policies.md data-classes table; verdict is yes, no, approval (allowed
    for a named idea once approved) or conditional (allowed on another condition, such as synthetic data only)."""
    out: dict[str, tuple[str, str]] = {}
    header: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip().startswith("|"):
            header = []
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
            continue
        if not header:
            header = [c.lower() for c in cells]
            continue
        if not header[0].startswith("class") or not any(h.startswith(CLASS_COLUMN) for h in header):
            continue
        row = dict(zip(header, cells))
        answer = next((v for k, v in row.items() if k.startswith(CLASS_COLUMN)), "").strip()
        conditions = next((v for k, v in row.items() if k.startswith("condition")), "").strip()
        plain = answer.lower()
        if plain.startswith("no"):
            verdict = "no"
        elif "approv" in plain:
            verdict = "approval"
        elif plain.startswith("yes") and conditions.lower() in ("", "none", "-", "n/a"):
            verdict = "yes"
        else:
            verdict = "conditional"
        note = "; ".join(x for x in (answer, conditions) if x and x.lower() not in ("none", "-"))
        out[cells[0].lower()] = (verdict, note)
    return out


def class_rules(scope: str, root: Path | None = None) -> tuple[dict[str, tuple[str, str]], list[str]]:
    """The data classes for a scope across every layer's policies.md (the strictest answer wins), and the files read."""
    reg = scopes.registry(root)
    files = [p for p in scopes.context_files(scopes.parse(scope, reg), root) if p.name == "policies.md"]
    rank = {"yes": 0, "conditional": 1, "approval": 2, "no": 3}
    rules: dict[str, tuple[str, str]] = {}
    used = []
    for path in files:
        table = class_table(path)
        if table:
            used.append(path.relative_to(root or lib.ROOT).as_posix())
        for name, (verdict, note) in table.items():
            if name not in rules or rank[verdict] > rank[rules[name][0]]:
                rules[name] = (verdict, note)
    return rules, used


def conditions(a: dict, rules: dict[str, tuple[str, str]]) -> list[str]:
    out = []
    approved = {x["class"].lower(): x for x in a.get("data_approvals", [])}
    for c in a.get("data_classes", []):
        verdict, note = rules.get(c.lower(), ("yes", ""))
        if verdict == "approval":
            x = approved.get(c.lower())
            out.append(f"{c}: approved by {x['by']} ({x['date']})" if x else f"{c}: needs approval (POL-11)")
        elif verdict == "conditional":
            out.append(f"{c}: {note or 'conditional'}")
    return out


def unapproved(a: dict, rules: dict[str, tuple[str, str]]) -> list[str]:
    """The data classes the idea needs that POL-11 allows only by approval, and that are not approved yet."""
    approved = {x["class"].lower() for x in a.get("data_approvals", [])}
    return [c for c in a.get("data_classes", []) if rules.get(c.lower(), ("", ""))[0] == "approval" and c.lower() not in approved]


def approvers(scope: str, root: Path | None = None) -> list[str]:
    """Who may approve for a scope: the group's gate approvers and its business's (scopes.json); [] when none are set."""
    reg = scopes.registry(root)
    people = list(reg.get("group", {}).get("approvers", {}).get("gates", []))
    business = scopes.parse(scope, reg).get("business") if scope else None
    if business:
        people += reg.get("businesses", {}).get(business, {}).get("approvers", {}).get("gates", [])
    return people


# ---------------------------------------------------------------- the assessment
def assessment_file(idea: Path) -> Path:
    """Where the idea's assessment block is: the spike card (spike.md) if the idea has one, else assessment.md."""
    return idea / CARD if (idea / CARD).exists() else idea / ASSESSMENT


def is_card(idea: Path) -> bool:
    return (idea / CARD).exists()


def read_assessment(idea: Path, root: Path | None = None) -> tuple[dict | None, list[str]]:
    """(the JSON block of ideas/<slug>/assessment.md or spike.md, schema problems); (None, []) when there is none."""
    path = assessment_file(idea)
    if not path.exists():
        return None, []
    match = BLOCK.match(path.read_text(encoding="utf-8"))
    if not match:
        return None, ["must start with a ```json assessment block"]
    try:
        data = json.loads(match.group(1))
    except ValueError as exc:
        return None, [f"the assessment block is not valid JSON ({exc})"]
    return data, lib.validate("assessment", data, root)


def write_assessment(idea: Path, data: dict) -> None:
    path = assessment_file(idea)
    text = path.read_text(encoding="utf-8")
    match = BLOCK.match(text)
    if not match:
        raise lib.FactoryError(f"{path.name} must start with a ```json assessment block")
    block = "```json assessment\n" + json.dumps(data, indent=2, ensure_ascii=False) + "\n```"
    path.write_text(block + text[match.end():], encoding="utf-8", newline="\n")


def score(rice: dict) -> float:
    r, i, c, e = (rice[k]["value"] for k in ("reach", "impact", "confidence", "effort"))
    return round(r * i * (c / 100) / e, 2)


def rice_problems(rice: dict | None) -> list[str]:
    if not rice:
        return ["needs the four RICE factors"]
    out = []
    if rice["reach"]["value"] < 0:
        out.append("reach cannot be negative")
    if rice["impact"]["value"] not in IMPACTS:
        out.append(f"impact must be one of {', '.join(str(x) for x in IMPACTS)}")
    if not 0 < rice["confidence"]["value"] <= 100:
        out.append("confidence is a percentage, above 0 and at most 100")
    if rice["effort"]["value"] <= 0:
        out.append("effort is person-weeks, above 0")
    return out


def scored(a: dict) -> bool:
    """A surviving idea whose RICE factors are complete enough to rank."""
    return not a.get("knockout") and not rice_problems(a.get("rice"))


def ratings(a: dict) -> dict[str, str]:
    return {k: v["rating"] for k, v in (a.get("foundations") or {}).items()}


def suggest(a: dict) -> tuple[str, list[str]]:
    """The recommendation the ratings point to: stop when knocked out, get-ready with every red foundation to fix, else go."""
    if a.get("knockout"):
        return "stop", []
    reds = [k for k, r in ratings(a).items() if r == "red"]
    return ("get-ready", reds) if reds else ("go", [])


def placeholder_fields(a: dict) -> list[str]:
    """Where template text like <...> is left in the assessment's strings."""
    found = []

    def walk(value: object, where: str) -> None:
        if isinstance(value, dict):
            for k, v in value.items():
                walk(v, f"{where}/{k}" if where else k)
        elif isinstance(value, list):
            for n, v in enumerate(value):
                walk(v, f"{where}/{n}")
        elif isinstance(value, str) and lib.PLACEHOLDER.search(value):
            found.append(where)

    walk(a, "")
    return found


def assessment_problems(a: dict, slug: str, root: Path | None = None, *, complete: bool = False,
                        reg: dict | None = None, scope: str | None = None) -> tuple[list[str], list[str]]:
    """(problems, warnings) for a schema-valid assessment. Always: the slug, data classes against POL-11, knock-out refs,
    assets. With complete (Gate 1): no placeholder, every foundation rated, valid RICE, the one thing, and a decision
    consistent with the ratings, a Get Ready re-assessment having re-rated what it fixed."""
    base = root or lib.ROOT
    out: list[str] = []
    warn: list[str] = []
    if a["slug"] != slug:
        out.append(f"slug {a['slug']} does not match the idea folder {slug}")
    rules = class_rules(scope or scopes.GROUP, root)[0]
    if rules:
        unknown = [c for c in a["data_classes"] if c.lower() not in rules]
        if unknown:
            out.append(f"data class {', '.join(unknown)} is not in the data-classes table (POL-11); known: {', '.join(sorted(rules))}")
        barred = [c for c in a["data_classes"] if rules.get(c.lower(), ("", ""))[0] == "no"]
        if barred and not a.get("knockout"):
            out.append(f"needs {', '.join(barred)}, which POL-11 does not allow; knock it out (rule data-class)")
        needed = {c.lower() for c in a["data_classes"]}
        out += [f"data_approvals: {x['class']} is not a class this idea needs (data_classes)"
                for x in a.get("data_approvals", []) if x["class"].lower() not in needed]
        waiting = unapproved(a, rules)
        if waiting and not a.get("knockout"):
            warn.append(f"needs {', '.join(waiting)}, which POL-11 allows only by approval: ask for it at Gate 1 "
                        "(pipeline.py approve-data); the idea cannot go ahead without it")
    ko = a.get("knockout")
    if ko:
        out += knockout_problems(ko, slug, base, reg or load(root))
    catalogue = {p.stem for p in (base / "catalogue" / "assets").glob("CAT-*.json")}
    out += [f"asset {x} is not in the catalogue" for x in a.get("assets", []) if x not in catalogue]
    if not complete:
        return out, warn

    out += [f"placeholder text left in {w}" for w in placeholder_fields(a)]
    d = a["decision"]
    chosen = [x for x in (d["recommended"], d.get("decided")) if x and x != "undecided"]
    if d["recommended"] == "undecided":
        out.append("no recommendation: decision/recommended is go, get-ready or stop")
    card = d.get("route") == "light" and "foundations" not in a and "rice" not in a  # a spike card has neither
    if card and d["recommended"] == "get-ready":
        out.append("a spike card is Go or Stop; to fix foundations first, develop the idea in full (assessment.md)")
    if not ko:
        if card:
            pass
        elif "foundations" not in a:
            out.append("rate the five foundations")
        else:
            out += [f"{FOUNDATIONS[k]} is not rated" for k, r in ratings(a).items() if r == "unrated"]
        if not card:
            out += rice_problems(a.get("rice"))
    elif any(x != "stop" for x in chosen):
        out.append("a knocked-out idea can only be stopped; to overrule a knock-out, remove it and rate the idea")
    reds = [FOUNDATIONS[k] for k, r in ratings(a).items() if r == "red"]
    if "go" in chosen and reds:
        out.append(f"a Go cannot have a red foundation ({', '.join(reds)}): fix it, or Get Ready")
    larger = a.get("scale", "app") != "app"
    if larger and "go" in chosen and d.get("route", "roadmap") != "roadmap":
        out.append(f"a {a['scale']} goes ahead on its roadmap (decision/route roadmap, {ROADMAP}); its spikes are epics in it")
    if not larger and d.get("route") == "roadmap":
        out.append("the roadmap route is for a project or programme (scale); an app goes the full or the light route")
    if "get-ready" in chosen:
        if not d["fix"]:
            out.append("Get Ready names the foundations to fix (decision/fix)")
        out += [f"{FOUNDATIONS[k]} is green, so there is nothing to fix" for k in d["fix"] if ratings(a).get(k) == "green"]
    if a.get("reassessments") and "foundations" in a:
        last = a["reassessments"][-1]
        for k in last["fix"]:
            before, now = last["before"].get(k), a["foundations"][k]
            if before and now["reason"].strip() == before["reason"].strip():
                out.append(f"{FOUNDATIONS[k]} was to be fixed but has not been re-assessed (its reason is unchanged since Get Ready)")
    hint, fix = suggest(a)
    if d["recommended"] not in ("undecided", hint) and not out:
        warn.append(f"the ratings point to {DECISIONS[hint]}" + (f" (fix {', '.join(FOUNDATIONS[k] for k in fix)})" if fix else "")
                    + f", not {DECISIONS[d['recommended']]}: say why in decision/reason")
    return out, warn


def knockout_problems(ko: dict, slug: str, base: Path, reg: dict) -> list[str]:
    rule, ref = ko["rule"], ko.get("ref", "")
    if rule == "policy" and not re.fullmatch(r"POL-\d+", ref):
        return ["a policy knock-out names the policy it breaks (ref POL-nn)"]
    if rule == "duplicate":
        if re.fullmatch(r"CAT-\d{3}", ref):
            ok = (base / "catalogue" / "assets" / f"{ref}.json").exists()
        elif re.fullmatch(r"IDEA-\d{3}", ref):
            ok = any(x["id"] == ref and x.get("slug") != slug for x in reg["entries"])
        elif ref.startswith("ideas/"):
            ok = ref != f"ideas/{slug}" and (base / ref / "state.json").exists()
        else:
            return ["a duplicate names what it duplicates (ref ideas/<slug>, CAT-nnn or IDEA-nnn)"]
        if not ok:
            return [f"duplicates {ref}, which does not exist"]
    return []


# ---------------------------------------------------------------- every idea
def idea_scope(state: dict, reg: dict, slug: str) -> str:
    """The scope string of an idea: its state's scope, else its register entry's, else the register's."""
    sc = state.get("scope") or {}
    sc = sc if isinstance(sc, dict) else {}  # an invalid scope is the state's problem, reported by status and check_factory
    if sc.get("brands"):
        return f"brand:{sc['brands'][0]}"
    if sc.get("business"):
        return f"business:{sc['business']}"
    entry = next((e for e in reg["entries"] if e.get("slug") == slug), {})
    return entry.get("scope", reg.get("scope", scopes.GROUP))


def gate_one(state: dict) -> str:
    return state.get("gates", {}).get("1", {}).get("status", "not-reached")


def assessed_ideas(root: Path | None = None) -> list[dict]:
    """Every idea folder with an assessment: {slug, name, stage, gate, scope, a (None if unreadable), problems}."""
    base = root or lib.ROOT
    ideas = base / "ideas"
    rows = []
    for folder in sorted(p for p in ideas.iterdir() if p.is_dir()) if ideas.is_dir() else []:
        if not assessment_file(folder).exists():
            continue
        try:
            state = lib.read_json(folder / "state.json") if (folder / "state.json").exists() else {}
        except ValueError:
            state = {}
        a, bad = read_assessment(folder, root)
        rows.append({"slug": folder.name, "name": state.get("name", folder.name), "stage": state.get("stage"),
                     "gate": gate_one(state), "state": state, "a": None if bad else a, "problems": bad})
    return rows


def problems(reg: dict, root: Path | None = None) -> list[str]:
    """The register and every assessment. An assessment is checked in full once its idea has reached Gate 1."""
    found = [f"{REGISTER}: {p}" for p in lib.validate("pipeline", reg, root)]
    if found:
        return found
    ids = [e["id"] for e in reg["entries"]]
    found += [f"{REGISTER}: {i} is used twice" for i in sorted({i for i in ids if ids.count(i) > 1})]
    scope_reg = scopes.registry(root)
    for e in reg["entries"]:
        try:
            scopes.parse(e.get("scope", reg.get("scope", scopes.GROUP)), scope_reg)
        except lib.FactoryError as exc:
            found.append(f"{REGISTER}: {e['id']}: {exc}")
        if e.get("slug") and not (lib.idea_dir(e["slug"], root) / "state.json").exists():
            found.append(f"{REGISTER}: {e['id']}: developed as ideas/{e['slug']}, which does not exist")
    for row in assessed_ideas(root):
        where = f"ideas/{row['slug']}/{assessment_file(lib.idea_dir(row['slug'], root)).name}"
        if row["problems"]:
            found += [f"{where}: {p}" for p in row["problems"]]
            continue
        complete = row["gate"] != "not-reached" or "decided" in row["a"]["decision"]
        try:
            scope = idea_scope(row["state"], reg, row["slug"])
            scopes.parse(scope, scope_reg)
        except lib.FactoryError:
            scope = scopes.GROUP  # the state's own scope problem is reported by check_factory
        bad, _warnings = assessment_problems(row["a"], row["slug"], root, complete=complete, reg=reg, scope=scope)
        found += [f"{where}: {p}" for p in bad]
    return found


# ---------------------------------------------------------------- report
def cell(text: object) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def number(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".")


def ranked(rows: list[dict]) -> list[tuple[int, dict, float]]:
    live = [r for r in rows if r["a"] and scored(r["a"]) and r["a"]["decision"].get("decided") != "stop"]
    order = sorted(live, key=lambda r: (-score(r["a"]["rice"]), -r["a"]["rice"]["confidence"]["value"], r["a"]["rice"]["effort"]["value"], r["slug"]))
    return [(n, r, score(r["a"]["rice"])) for n, r in enumerate(order, start=1)]


def rag(a: dict) -> str:
    letters = {"green": "G", "amber": "A", "red": "R", "unrated": "?"}
    return " ".join(f"{FOUNDATIONS[k].split()[0]} {letters[r]}" for k, r in ratings(a).items()) or "-"


def decision_text(a: dict) -> str:
    d = a["decision"]
    fix = f": fix {', '.join(FOUNDATIONS[k] for k in d['fix'])}" if d.get("fix") and "get-ready" in (d.get("decided"), d["recommended"]) else ""
    light = {"light": " as a spike", "roadmap": " on its roadmap"}.get(d.get("route"), "") if "go" in (d.get("decided"), d["recommended"]) else ""
    if d.get("decided"):
        owner = (f" ({d['owner']}, review {d['review']}{', overdue' if overdue(a) else ''})"
                 if d["decided"] == "get-ready" and d.get("owner") else "")
        return f"{DECISIONS[d['decided']]}{light} ({d['date']}){fix}{owner}"
    if d["recommended"] == "undecided":
        return "being assessed"
    return f"recommended {DECISIONS[d['recommended']]}{light}{fix}"


def overdue(a: dict, today: str | None = None) -> bool:
    """A Get Ready idea past its review date: it should be back at Gate 1, fixed or not."""
    d = a["decision"]
    return d.get("decided") == "get-ready" and bool(d.get("review")) and d["review"] < (today or lib.today())


IN_FLIGHT = ("spec", "build", "publish")  # a roadmap is not in flight itself: its epics are, each as an idea
WIP_DEFAULT = "DEF-23"
# The defaults file: an instance keeps its group defaults in group/ (check_factory.py CONTEXT_FILES).
DEFAULTS = ("factory/context/group/defaults.md", "factory/context/defaults.md")


def wip_limit(root: Path | None = None) -> int | None:
    """The most ideas past Gate 1 and not yet published at once (DEF-23's first number), or None when unset.
    When DEF-23 says "per operator", the number is multiplied by the operators in scopes.json (at least one)."""
    base = root or lib.ROOT
    for rel in DEFAULTS:
        path = base / rel
        if not path.exists():
            continue
        for row in path.read_text(encoding="utf-8").splitlines():
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            if cells and cells[0] == WIP_DEFAULT and len(cells) > 2:
                found = re.search(r"\d+", cells[2])
                if not found:
                    return None
                per = "per operator" in cells[2].lower()
                return int(found.group(0)) * (max(1, len(scopes.registry(root)["group"].get("operators", []))) if per else 1)
    return None


def in_flight(rows: list[dict]) -> list[dict]:
    """Ideas past Gate 1 and not yet published: in Spec, Build or Publish, and not stopped."""
    return [r for r in rows if r["stage"] in IN_FLIGHT and r["state"].get("status") not in ("stopped", "done")]


def being_developed(r: dict, root: Path | None = None) -> bool:
    """Not yet ready for Gate 1: unreadable, or neither scored, knocked out, decided nor a spike card with a recommendation."""
    a = r["a"]
    if not a:
        return True
    card = is_card(lib.idea_dir(r["slug"], root))
    return not (scored(a) or a.get("knockout") or (card and (a["decision"].get("decided") or a["decision"]["recommended"] != "undecided")))


def counts(reg: dict, rows: list[dict], root: Path | None = None) -> dict[str, int]:
    def decided(r: dict) -> str | None:
        return r["a"]["decision"].get("decided") if r["a"] else None

    return {
        "ranked": len(ranked(rows)),
        "go": sum(1 for r in rows if decided(r) == "go"),
        "get-ready": sum(1 for r in rows if decided(r) == "get-ready"),
        "overdue": sum(1 for r in rows if r["a"] and overdue(r["a"])),
        "stopped": sum(1 for r in rows if decided(r) == "stop"),
        "knocked-out": sum(1 for r in rows if r["a"] and r["a"].get("knockout")),
        "developing": sum(1 for r in rows if being_developed(r, root)),
        "captured": sum(1 for e in reg["entries"] if not e.get("slug")) + len(not_captured(reg, root)),
        "in-flight": len(in_flight(rows)),
        "reviews-overdue": sum(1 for d in reviews_due(root) if d["overdue"]),
    }


def reviews_due(root: Path | None = None) -> list[dict]:
    """Benefits reviews not yet done (learned.py, which imports this module, is imported here)."""
    import learned

    return learned.reviews_due(root)


def line(c: dict[str, int]) -> str:
    late = f" ({c['overdue']} past review)" if c.get("overdue") else ""
    benefits = f", {c['reviews-overdue']} benefits review(s) overdue" if c.get("reviews-overdue") else ""
    return (f"{c['ranked']} ranked, {c['go']} go, {c['get-ready']} getting ready{late}, {c['stopped']} stopped, "
            f"{c['knocked-out']} knocked out, {c['developing']} being developed, {c['captured']} captured and not yet developed"
            f"{benefits}")


def summary(root: Path | None = None) -> str | None:
    """One line for status.py, or None with no register, no inbox and no assessments."""
    rows = assessed_ideas(root)
    if not register_path(root).exists() and not inbox_ideas(root) and not rows:
        return None
    try:
        reg = load(root)
        c = counts(reg, rows, root)
    except (ValueError, KeyError) as exc:
        return f"Pipeline: {REGISTER} cannot be read ({exc})"
    return f"Pipeline: {line(c)} ({REPORT})"


def render(reg: dict, root: Path | None = None) -> str:
    rows = assessed_ideas(root)
    c = counts(reg, rows, root)
    lines = [
        "# Idea pipeline", "",
        f"Generated by `python factory/scripts/pipeline.py render` from `{REGISTER}` and each idea's `{ASSESSMENT}` or `{CARD}`; do not edit. "
        "Foundations: Problem, Value, Data Foundations, Risk, People & Process, each G green, A amber, R red. "
        "Impact is 0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive; Confidence is a percentage; Effort is rough person-weeks. "
        "Score = Reach x Impact x Confidence / Effort.", "",
        f"Updated {reg.get('updated', lib.today())}: {line(c)}. A gate approver signs off Go, Get Ready or Stop at Gate 1, idea by idea.", "",
    ]
    limit = wip_limit(root)
    if limit is not None:
        over = " **Over the limit**: finish or pause one before the next Go." if c["in-flight"] > limit else ""
        lines += [f"In flight (past Gate 1, not yet published): {c['in-flight']} of {limit} ({WIP_DEFAULT}).{over}", ""]
    lines += ["## Ranked", ""]
    order = ranked(rows)
    if order:
        lines += ["| Rank | Idea | Score | Reach | Impact | Confidence | Effort | Foundations | Decision | The one thing | Conditions |",
                  "|---|---|---|---|---|---|---|---|---|---|---|"]
        for n, r, s in order:
            a, rice = r["a"], r["a"]["rice"]
            rules = class_rules(idea_scope(r["state"], reg, r["slug"]), root)[0]
            lines.append(
                f"| {n} | [{cell(r['name'])}]({r['slug']}/{ASSESSMENT}) | {number(s)} | {number(rice['reach']['value'])} {cell(a['period'])} | "
                f"{number(rice['impact']['value'])} | {number(rice['confidence']['value'])}% | {number(rice['effort']['value'])} | "
                f"{rag(a)} | {cell(decision_text(a))} | {cell(a['one_thing'])} | {cell('; '.join(conditions(a, rules)) or '-')} |")
    else:
        lines.append("Nothing assessed yet.")
    spikes = [r for r in rows if r["a"] and is_card(lib.idea_dir(r["slug"], root)) and not r["a"].get("knockout")
              and r["a"]["decision"]["recommended"] != "undecided" and r["a"]["decision"].get("decided") != "stop"]
    if spikes:
        lines += ["", "## Spikes", "", f"Spikes are not scored: each has a one-page card ({CARD}) and a time box.", "",
                  "| Idea | Time box | Decision | The one thing | Conditions |", "|---|---|---|---|---|"]
        for r in spikes:
            a = r["a"]
            rules = class_rules(idea_scope(r["state"], reg, r["slug"]), root)[0]
            lines.append(f"| [{cell(r['name'])}]({r['slug']}/{CARD}) | {number(a['decision'].get('timebox', 1))} person-week(s) | "
                         f"{cell(decision_text(a))} | {cell(a['one_thing'])} | {cell('; '.join(conditions(a, rules)) or '-')} |")
    ready = [r for r in rows if r["a"] and r["a"]["decision"].get("decided") == "get-ready"]
    if ready:
        lines += ["", "## Getting ready", "", "| Idea | Fix | Owner | Review by | |", "|---|---|---|---|---|"]
        for r in sorted(ready, key=lambda r: (r["a"]["decision"].get("review", "9"), r["slug"])):
            d = r["a"]["decision"]
            lines.append(f"| {cell(r['name'])} | {', '.join(FOUNDATIONS[k] for k in d['fix'])} | {cell(d.get('owner', '-'))} | "
                         f"{d.get('review', '-')} | {'**overdue**: back to Gate 1' if overdue(r['a']) else ''} |")
    roadmaps = [r for r in rows if r["state"].get("route") == "roadmap"]
    if roadmaps:
        lines += ["", "## Roadmaps", "", "Each epic goes through the factory as an idea of its own; a project epic is delivered outside it.", "",
                  "| Roadmap | Epic | Kind | Depends on | Idea | Where it is |", "|---|---|---|---|---|---|"]
        for r in roadmaps:
            started = epic_ideas(reg, r["slug"])
            for e in roadmap_epics(lib.idea_dir(r["slug"], root)):
                x = started.get(e["id"], {})
                child = next((c for c in rows if x.get("slug") and c["slug"] == x["slug"]), None)
                where = (f"{child['state'].get('stage')}, {child['state'].get('status')}" if child else
                         "outside the factory" if e["kind"] == "project" else "not started")
                lines.append(f"| [{cell(r['name'])}]({r['slug']}/{ROADMAP}) | {e['id']} {cell(e['name'])} | {e['kind']} | "
                             f"{', '.join(e['depends']) or '-'} | {('`ideas/' + x['slug'] + '/`') if x.get('slug') else '-'} | {where} |")
    due = reviews_due(root)
    if due:
        names = {r["slug"]: r["name"] for r in rows}
        lines += ["", "## Benefits reviews due", "", "| Idea | Review | Due | |", "|---|---|---|---|"]
        lines += [f"| {cell(names.get(d['slug'], d['slug']))} | {d['day']} days | {d['due']} | {'**overdue**' if d['overdue'] else ''} |"
                  for d in due]
    stopped = [r for r in rows if r["a"] and r["a"]["decision"].get("decided") == "stop"]
    if stopped:
        lines += ["", "## Stopped at Gate 1", "", "| Idea | Reason | Date |", "|---|---|---|"]
        lines += [f"| {cell(r['name'])} | {cell(r['a']['decision']['reason'])} | {r['a']['decision']['date']} |" for r in stopped]
    out = [r for r in rows if r["a"] and r["a"].get("knockout")]
    if out:
        lines += ["", "## Knocked out", "", "| Idea | Rule | Ref | Reason |", "|---|---|---|---|"]
        lines += [f"| {cell(r['name'])} | {r['a']['knockout']['rule']} | {cell(r['a']['knockout'].get('ref') or '-')} | {cell(r['a']['knockout']['reason'])} |"
                  for r in out]
    developing = [r for r in rows if being_developed(r, root)]
    if developing:
        lines += ["", "## Being developed", ""]
        lines += [f"- `ideas/{r['slug']}/`: {cell(r['name'])}" + (" (assessment cannot be read: run `pipeline.py check`)" if not r["a"] else "")
                  for r in developing]
    waiting = [e for e in reg["entries"] if not e.get("slug")]
    inbox = not_captured(reg, root)
    if waiting or inbox:
        lines += ["", "## Captured, not yet developed", ""]
        lines += [f"- {e['id']} {cell(e['title'])}" for e in waiting]
        lines += [f"- (inbox, not captured yet) {cell(x)}" for x in inbox]
    scopes_used = {idea_scope(r["state"], reg, r["slug"]) for r in rows} | {reg.get("scope", scopes.GROUP)}
    files = sorted({f for s in scopes_used for f in class_rules(s, root)[1]})
    lines += ["", "Data classes checked against: " + (", ".join(f"`{f}`" for f in files) if files else "no data-classes table (POL-11) found, so not checked") + ".", ""]
    return "\n".join(lines)


# ---------------------------------------------------------------- roadmaps (a project or programme)
def roadmap_epics(idea: Path) -> list[dict]:
    """The epics in roadmap.md's '## Epics' table, in order: {id, name, kind, does, tier, depends, after}."""
    path = idea / ROADMAP
    if not path.exists():
        return []
    text = path.read_text(encoding="utf-8")
    section = re.search(r"(?ims)^##\s+Epics\s*$(.*?)(?=^##\s|\Z)", text)
    epics = []
    for row in (section.group(1) if section else "").splitlines():
        m = EPIC_ROW.match(row.strip())
        if not m:
            continue
        cells = [c.strip() for c in m.group(2).split("|")] + [""] * 6
        depends = [x for x in re.split(r"[,\s]+", cells[4]) if re.fullmatch(r"E\d+", x)]
        epics.append({"id": m.group(1), "name": cells[0], "kind": cells[1].lower(), "does": cells[2], "tier": cells[3],
                      "depends": depends, "after": cells[5]})
    return epics


def epic_ideas(reg: dict, parent: str) -> dict[str, dict]:
    """{epic id: register entry} for the epics of a roadmap already started as ideas."""
    return {e["epic"]: e for e in reg["entries"] if e.get("parent") == parent and e.get("epic")}


def epic_finished(state: dict) -> bool:
    """An epic is finished at its Gate 3: a spike's result (grow, keep or stop), or a build past its audit; or stopped."""
    gate3 = state.get("gates", {}).get("3", {}).get("status")
    return bool(state.get("light")) or gate3 in ("approved", "stopped") or state.get("status") == "stopped"


def start_epic(reg: dict, parent: str, epic: str, slug: str | None = None, root: Path | None = None,
               owner: str | None = None) -> Path:
    """Start an epic of an approved roadmap as an idea of its own, linked to its parent, at Develop and Assess."""
    state = lib.load_state(parent, root)
    if state.get("route") != "roadmap" or state["stage"] != "roadmap":
        raise lib.FactoryError(f"ideas/{parent} has no approved roadmap (route {state.get('route', 'full')}, stage {state['stage']}): "
                               "its Gate 1 approves the roadmap first")
    epics = {e["id"]: e for e in roadmap_epics(lib.idea_dir(parent, root))}
    if epic not in epics:
        raise lib.FactoryError(f"{epic} is not an epic in ideas/{parent}/{ROADMAP} ({', '.join(epics) or 'none'})")
    e = epics[epic]
    if e["kind"] == "project":
        raise lib.FactoryError(f"{epic} is delivered outside the factory (kind project): record its progress in {ROADMAP}")
    started = epic_ideas(reg, parent)
    if epic in started:
        raise lib.FactoryError(f"{epic} was already started as {started[epic]['id']}"
                               + (f" (ideas/{started[epic]['slug']})" if started[epic].get("slug") else ""))
    for x in e["depends"]:
        dep = lib.load_state(started[x]["slug"], root) if started.get(x, {}).get("slug") else None
        if dep is None or not epic_finished(dep):
            raise lib.FactoryError(f"{epic} depends on {x}, which has not finished (its Gate 3)")
        if dep.get("status") == "stopped":
            raise lib.FactoryError(f"{epic} depends on {x}, which stopped: revise the roadmap before going on (factory/dormant/roadmap.md)")
    entry = {"id": next_id(reg), "title": f"{state['name']}: {e['name']}", "idea": e["does"] or e["name"], "source": "epic",
             "added": lib.today(), "parent": parent, "epic": epic}
    parent_entry = next((x for x in reg["entries"] if x.get("slug") == parent), {})
    if parent_entry.get("scope"):
        entry["scope"] = parent_entry["scope"]
    reg["entries"].append(entry)
    idea = develop(reg, entry["id"], slug or slugify(f"{parent}-{epic}"), root, owner=owner or state.get("owner"))
    if state.get("scope"):
        child = lib.load_state(idea.name, root)
        child["scope"] = state["scope"]
        lib.save_state(idea.name, child, root)
    kind = ("a spike: Go as a spike with its plan (factory/stages/light.md)" if e["kind"] == "spike"
            else f"a build at tier {e['tier'] or '(to choose)'}")
    with (idea / "idea.md").open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(f"\nEpic {epic} of the roadmap in `ideas/{parent}/{ROADMAP}`, {kind}. Its brief may cite the parent's "
                 f"`ideas/{parent}/{BRIEF}` for what does not change; its own Gate 1 is signed off like any idea's.\n")
    return idea


# ---------------------------------------------------------------- sign-off
def sign_off(slug: str, state: dict, by: str | None, decision: str, root: Path | None = None) -> str | None:
    """Who signs off a gate decision. Go, Get Ready, grow and keep: a gate approver for the idea's scope, other than the
    idea's owner unless no one else can. Stop: an approver, or the owner withdrawing the idea. Returns a note or None."""
    if not by or not by.strip():
        raise lib.FactoryError("a gate decision is signed off by name (--by <approver>): Develop and Assess is the owner's, "
                               "the decision to go further is an approver's")
    people = approvers(idea_scope(state, load(root), slug), root)
    owner = state.get("owner")
    if decision == "stop" and by == owner:
        return None
    if people and by not in people:
        raise lib.FactoryError(f"{by} is not a gate approver for this idea's scope (scopes.json: {', '.join(people)})"
                               + ("; its owner may only stop (withdraw) it" if by == owner else ""))
    if by == owner and decision != "stop":
        others = [x for x in people if x != owner]
        if others:
            raise lib.FactoryError(f"{by} owns this idea, so cannot sign it off; ask {', '.join(others)}")
        return f"{by} owns this idea and is its only approver: signed off by its owner (name a second approver in scopes.json)"
    return None


# ---------------------------------------------------------------- Gate 1
def gate_check(slug: str, root: Path | None = None) -> list[str]:
    """The Gate 1 blockers (check_spec.py --assessment)."""
    import check_spec

    f = check_spec.Findings()
    check_spec.check_gate_one(lib.idea_dir(slug, root), f, root)
    f.done()
    return f.blockers


def bump(version: str) -> str:
    major, minor = (int(x) for x in version.split("."))
    return f"{major}.{minor + 1}"


def decide(slug: str, decision: str, reply: str, reason: str | None = None, fix: list[str] | None = None,
           root: Path | None = None, *, route: str | None = None, timebox: float | None = None,
           owner: str | None = None, review: str | None = None, by: str | None = None) -> dict:
    """Record the Gate 1 decision, signed off by an approver (`by`), in the assessment and state.json; returns the state."""
    if decision not in DECISIONS:
        raise lib.FactoryError(f"the decision is go, get-ready or stop, not {decision!r}")
    state = lib.load_state(slug, root)
    if state["stage"] != "develop" or gate_one(state) in ("approved", "stopped"):
        raise lib.FactoryError(f"ideas/{slug} is not waiting for its investment decision (stage {state['stage']}, gate 1 {gate_one(state)})")
    note = sign_off(slug, state, by, decision, root)
    blockers = gate_check(slug, root)
    if blockers:
        raise lib.FactoryError("the Gate 1 check has blockers: " + "; ".join(blockers))
    idea = lib.idea_dir(slug, root)
    a, _ = read_assessment(idea, root)
    d = a["decision"]
    reds = [FOUNDATIONS[k] for k, r in ratings(a).items() if r == "red"]
    if decision != "stop" and a.get("knockout"):
        raise lib.FactoryError("a knocked-out idea can only be stopped; to overrule the knock-out, remove it and rate the idea first")
    if decision == "go" and reds:
        raise lib.FactoryError(f"a Go cannot have a red foundation ({', '.join(reds)})")
    if decision == "go":
        waiting = unapproved(a, class_rules(idea_scope(state, load(root), slug), root)[0])
        if waiting:
            raise lib.FactoryError(f"a Go needs the approval POL-11 asks for {', '.join(waiting)} first "
                                   f"(pipeline.py approve-data {slug} <class> --by <approver> --reply \"...\")")
    larger = a.get("scale", "app") != "app"
    route = route or d.get("route") or ("roadmap" if larger else "full")
    if route not in ("full", "light", "roadmap"):
        raise lib.FactoryError(f"the route is full, light or roadmap, not {route!r}")
    if decision == "go" and is_card(idea) and route != "light":
        raise lib.FactoryError(f"a spike card ({CARD}) takes the light route; for the {route} route, develop the idea in full")
    if decision == "go" and larger != (route == "roadmap"):
        raise lib.FactoryError(f"a {a['scale']} goes ahead on its roadmap (--route roadmap), each epic as an idea of its own"
                               if larger else "the roadmap route is for a project or programme (assessment scale)")
    if decision == "go" and route == "roadmap":
        d["route"] = "roadmap"
    elif decision == "go" and route == "light":
        if not is_card(idea):
            raise lib.FactoryError(f"the light route needs its card ({CARD}): develop the idea with pipeline.py develop --spike")
        d.update(route="light", timebox=timebox or d.get("timebox") or 1)
    elif decision == "go":
        d["route"] = "full"
    if decision == "get-ready":
        fix = fix or d["fix"]
        unknown = [k for k in fix if k not in FOUNDATIONS]
        if not fix or unknown:
            raise lib.FactoryError("Get Ready names the foundations to fix (--fix " + ",".join(FOUNDATIONS) + ")"
                                   + (f"; unknown: {', '.join(unknown)}" if unknown else ""))
        green = [FOUNDATIONS[k] for k in fix if ratings(a).get(k) == "green"]
        if green:
            raise lib.FactoryError(f"{', '.join(green)} is green, so there is nothing to fix")
        if not owner:
            raise lib.FactoryError("Get Ready names who fixes it (--owner), so the idea does not wait on no one")
        review = review or (dt.date.today() + dt.timedelta(days=REVIEW_DAYS)).isoformat()
        try:
            past = dt.date.fromisoformat(review).isoformat() < lib.today()
        except ValueError:
            raise lib.FactoryError(f"the review date {review!r} is not YYYY-MM-DD") from None
        if past:
            raise lib.FactoryError(f"the review date {review} is in the past")
        d.update(fix=fix, owner=owner, review=review)
    if decision == "stop":
        reason = reason or (d["reason"] if d["recommended"] == "stop" else None) or (a.get("knockout") or {}).get("reason")
        if not reason:
            raise lib.FactoryError("a Stop needs its reason (--reason)")
        d["reason"] = reason
    d.update(decided=decision, date=lib.today(), reply=reply, by=by)
    write_assessment(idea, a)
    if is_card(idea):
        sign_card(idea, f'{lib.today()}, {by}: "{reply}". {decision_text(a)}.')
    names = ", ".join(FOUNDATIONS[k] for k in d["fix"])
    gate = {"status": GATE_STATUS[decision], "date": lib.today(), "reply": reply, "version": a["version"], "by": by}
    if note:
        gate["note"] = note
    if (idea / "gates" / "gate-1.md").exists():
        gate["file"] = "gates/gate-1.md"
    state["gates"]["1"] = gate
    state["assessment"] = {"decision": decision, "score": score(a["rice"]) if scored(a) else None, "period": a["period"],
                           "foundations": {k: r for k, r in ratings(a).items() if r != "unrated"}}
    if decision == "get-ready":
        state["assessment"].update(fix=d["fix"], owner=d["owner"], review=d["review"])
    state["versions"]["assessment"] = a["version"]
    if decision == "go" and d["route"] == "roadmap":
        first = [e["id"] for e in roadmap_epics(idea) if not e["depends"] and e["kind"] != "project"]
        state.update(stage="roadmap", status="in-progress", route="roadmap",
                     next=f"Roadmap approved: start {', '.join(first) or 'the first epic'} with pipeline.py epic {slug} <E>, "
                          "each an idea of its own (factory/dormant/roadmap.md)")
    elif decision == "go" and d["route"] == "light":
        state["gates"]["2"] = {"status": "approved", "date": lib.today(), "reply": f"card ({CARD}) approved with Gate 1: {reply}"}
        state.update(stage="build", status="in-progress", route="light", tier=1,
                     next=f"Build the spike to {CARD} within {number(d['timebox'])} person-week(s), "
                          "then Gate 3: grow, keep or stop (factory/stages/light.md)")
    elif decision == "go":
        state.pop("route", None)
        state.update(stage="spec", status="in-progress", next="Spec: the solution choices, then the spec pack (factory/dormant/spec.md)")
    elif decision == "get-ready":
        state.update(status="paused", next=f"Get Ready: {d['owner']} fixes {names} by {d['review']}; then pipeline.py reassess {slug} (factory/stages/develop-assess.md)")
    else:
        state.update(status="stopped", next=f"Stopped at Gate 1: {d['reason']}")
    lib.save_state(slug, state, root)
    return state


def sign_card(idea: Path, text: str) -> None:
    """Write the sign-off into the spike card's '## Sign-off' section, in place of what was there."""
    path = idea / CARD
    body = path.read_text(encoding="utf-8").rstrip() + "\n"
    match = re.search(r"(?m)^## Sign-off[ \t]*$", body)
    if not match:
        body += "\n## Sign-off\n"
        match = re.search(r"(?m)^## Sign-off[ \t]*$", body)
    after = body[match.end():]
    nxt = re.search(r"(?m)^## ", after)
    tail = after[nxt.start():] if nxt else ""
    path.write_text(body[:match.end()] + "\n" + text + "\n" + ("\n" + tail if tail else ""), encoding="utf-8", newline="\n")


def approve_data(slug: str, data_class: str, by: str, reply: str, root: Path | None = None) -> dict:
    """POL-11: record an approver's approval for a data class the policy allows only by approval. Returns the assessment."""
    state = lib.load_state(slug, root)
    idea = lib.idea_dir(slug, root)
    a, bad = read_assessment(idea, root)
    if a is None or bad:
        raise lib.FactoryError(f"ideas/{slug}/{ASSESSMENT} cannot be read" + (": " + "; ".join(bad) if bad else ""))
    scope = idea_scope(state, load(root), slug)
    rules = class_rules(scope, root)[0]
    name = next((c for c in a["data_classes"] if c.lower() == data_class.lower()), None)
    if name is None:
        raise lib.FactoryError(f"{data_class} is not a class this idea needs (data_classes: {', '.join(a['data_classes']) or 'none'})")
    if rules.get(name.lower(), ("", ""))[0] != "approval":
        raise lib.FactoryError(f"POL-11 does not ask for approval for {name} ({rules.get(name.lower(), ('not in the table', ''))[0]})")
    people = approvers(scope, root)
    if people and by not in people:
        raise lib.FactoryError(f"{by} is not an approver for {scope} (scopes.json: {', '.join(people)})")
    if not reply.strip():
        raise lib.FactoryError("the approval needs the approver's words (--reply)")
    a["data_approvals"] = [x for x in a.get("data_approvals", []) if x["class"].lower() != name.lower()]
    a["data_approvals"].append({"class": name, "by": by, "date": lib.today(), "reply": reply})
    write_assessment(idea, a)
    return a


def reassess(slug: str, root: Path | None = None) -> dict:
    """After Get Ready: keep the brief and the assessment, record what is being fixed and its ratings now, and reopen
    the idea for a light re-assessment of only those foundations. Returns the assessment."""
    state = lib.load_state(slug, root)
    if gate_one(state) != "get-ready":
        raise lib.FactoryError(f"ideas/{slug} is not getting ready (gate 1 {gate_one(state)}); only a Get Ready idea is re-assessed")
    idea = lib.idea_dir(slug, root)
    a, bad = read_assessment(idea, root)
    if bad or a is None:
        raise lib.FactoryError(f"ideas/{slug}/{ASSESSMENT} cannot be read: " + "; ".join(bad))
    d = a["decision"]
    gate = state["gates"]["1"]
    a.setdefault("reassessments", []).append({
        "date": lib.today(), "fix": list(d["fix"]), "before": {k: dict(a["foundations"][k]) for k in d["fix"]},
        "previous": {"date": gate.get("date", lib.today()), "reply": gate.get("reply", "")},
    })
    names = ", ".join(FOUNDATIONS[k] for k in d["fix"])
    a["version"] = bump(a["version"])
    a["decision"] = {"recommended": "undecided", "reason": f"Re-assessing after Get Ready: {names}", "fix": list(d["fix"])}
    write_assessment(idea, a)
    state["gates"]["1"] = {"status": "changes-requested", "date": gate.get("date", lib.today()), "reply": gate.get("reply", "")}
    state["versions"]["assessment"] = a["version"]
    state.update(status="in-progress", next=f"Re-assess: re-rate {names} only, refresh the overview, then Gate 1 (factory/stages/develop-assess.md)")
    lib.save_state(slug, state, root)
    return a


def end_light(slug: str, result: str, reply: str, reason: str | None = None, root: Path | None = None,
              tier: int | None = None, by: str | None = None) -> dict:
    """Gate 3 of the light route (a spike): grow it to the full route at the tier the approver names (from Spec), keep it
    (as it is, on to Publish) or stop it."""
    if result not in LIGHT_RESULTS:
        raise lib.FactoryError(f"the light route ends grow, keep or stop, not {result!r}")
    state = lib.load_state(slug, root)
    if state.get("route") != "light" or state["stage"] != "build":
        raise lib.FactoryError(f"ideas/{slug} is not on the light route in Build (route {state.get('route', 'full')}, stage {state['stage']})")
    import learned

    blockers = learned.gate_check(slug, root)
    if blockers:
        raise lib.FactoryError("the Gate 3 check has blockers: " + "; ".join(blockers))
    if result == "stop" and not reason:
        raise lib.FactoryError("a Stop needs its reason (--reason)")
    note = sign_off(slug, state, by, result, root)
    if result == "grow" and tier not in (2, 3):
        raise lib.FactoryError(f"grow names the tier it grows to (--tier 2 or 3; there is no default), not {tier!r}")
    state["light"] = {"result": result, "date": lib.today(), "reply": reply, "by": by}
    if note:
        state["light"]["note"] = note
    if result == "grow":
        state["light"]["to_tier"] = tier
        state.pop("route")
        state["gates"]["2"] = {"status": "not-reached"}
        state["gates"]["3"] = {"status": "not-reached"}
        state.update(stage="spec", status="in-progress", tier=tier,
                     next=f"Grow to tier {tier}: Spec, starting from what the spike showed (factory/dormant/spec.md)")
    elif result == "keep":
        state["gates"]["3"] = {"status": "approved", "date": lib.today(), "reply": reply, "by": by}
        state.update(stage="publish", status="in-progress", next="Keep: publish the spike as it is (factory/dormant/publish.md)")
    else:
        state["gates"]["3"] = {"status": "stopped", "date": lib.today(), "reply": reply, "by": by}
        state.update(status="stopped", next=f"Stopped after the spike: {reason}")
    lib.save_state(slug, state, root)
    return state


# ---------------------------------------------------------------- command line
def option(args: list[str], name: str) -> str | None:
    if name in args:
        at = args.index(name)
        value = args[at + 1] if at + 1 < len(args) else None
        del args[at : at + 2]
        return value
    return None


def main(argv: list[str]) -> int:
    if "-h" in argv[1:] or "--help" in argv[1:]:
        print(__doc__)
        return 0
    args = argv[1:]
    try:
        reply = option(args, "--reply")
        reason = option(args, "--reason")
        fix = option(args, "--fix")
        route = option(args, "--route")
        tier = option(args, "--tier")
        timebox = option(args, "--timebox")
        owner = option(args, "--owner")
        review = option(args, "--review")
        by = option(args, "--by")
        spike = "--spike" in args
        if spike:
            args.remove("--spike")
        source = option(args, "--source") or "single"
        reg = load()
        if args == ["capture"]:
            added = capture(reg)
            save(reg)
            print(f"pipeline: {len(added)} idea(s) captured from the inbox" + "".join(f"\n  {e['id']} {e['title']}" for e in added))
            return 0
        if len(args) == 2 and args[0] == "add":
            entry = add(reg, args[1], source)
            if entry is None:
                print("pipeline: that idea is already in the register")
                return 1
            save(reg)
            print(f"pipeline: captured {entry['id']} {entry['title']}")
            return 0
        if args and args[0] == "develop" and len(args) in (2, 3):
            idea = develop(reg, args[1], args[2] if len(args) == 3 else None, owner=owner, spike=spike)
            save(reg)
            todo = f"write {CARD}" if spike else f"write {BRIEF}, then {ASSESSMENT}"
            print(f"pipeline: {args[1]} developing in {idea.relative_to(lib.ROOT).as_posix()}/ ({todo})")
            return 0
        if args in (["check"], ["render"]):
            bad = problems(reg)
            for p in bad:
                print("  " + p)
            if bad:
                print(f"pipeline: FAILED ({len(bad)} problem(s))")
                return 1
            if args == ["render"]:
                (lib.ROOT / REPORT).write_text(render(reg), encoding="utf-8", newline="\n")
            rows = assessed_ideas()
            tail = f"; wrote {REPORT}" if args == ["render"] else ""
            print(f"pipeline: OK ({line(counts(reg, rows))}){tail}")
            for n, r, s in ranked(rows)[:5]:
                print(f"  {n}. {r['slug']} ({number(s)}) {decision_text(r['a'])}")
            return 0
        if args and args[0] == "epic" and len(args) in (3, 4):
            idea = start_epic(reg, args[1], args[2], args[3] if len(args) == 4 else None, owner=owner)
            save(reg)
            (lib.ROOT / REPORT).write_text(render(reg), encoding="utf-8", newline="\n")
            print(f"pipeline: {args[2]} of {args[1]} developing in {idea.relative_to(lib.ROOT).as_posix()}/ (write {BRIEF}, then {ASSESSMENT})")
            return 0
        if len(args) == 3 and args[0] == "decide" and reply:
            state = decide(args[1], args[2], reply, reason, [k.strip() for k in fix.split(",") if k.strip()] if fix else None,
                           route=route, timebox=float(timebox) if timebox else None, owner=owner, review=review, by=by)
            (lib.ROOT / REPORT).write_text(render(reg), encoding="utf-8", newline="\n")
            print(f"pipeline: {args[1]} {DECISIONS[args[2]]} at Gate 1, signed off by {by}; {state['next']}")
            if state["gates"]["1"].get("note"):
                print(f"pipeline: note: {state['gates']['1']['note']}")
            limit, flying = wip_limit(), len(in_flight(assessed_ideas()))
            if args[2] == "go" and limit is not None and flying > limit:
                print(f"pipeline: {flying} ideas are now in flight, over the {WIP_DEFAULT} limit of {limit}: "
                      "say so to the owner, and finish or pause one before the next starts")
            return 0
        if len(args) == 3 and args[0] == "light" and reply:
            state = end_light(args[1], args[2], reply, reason, tier=int(tier) if tier else None, by=by)
            print(f"pipeline: {args[1]} light route: {LIGHT_RESULTS[args[2]]}; {state['next']}")
            return 0
        if len(args) == 3 and args[0] == "approve-data" and by and reply:
            approve_data(args[1], args[2], by, reply)
            print(f"pipeline: {args[2]} approved for {args[1]} by {by} (POL-11); record it in decisions.md too")
            return 0
        if len(args) == 2 and args[0] == "reassess":
            a = reassess(args[1])
            print(f"pipeline: {args[1]} re-opened for a light re-assessment (assessment {a['version']}); {a['decision']['reason']}")
            return 0
    except (lib.FactoryError, ValueError) as exc:
        print(f"pipeline: {exc}", file=sys.stderr)
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
