#!/usr/bin/env python3
"""Stage 0, Triage: knock out the ideas that cannot go ahead, score the rest with RICE, rank them.

Usage:
  python factory/scripts/triage.py intake                  add every untriaged line of ideas/inbox.md (made if missing)
  python factory/scripts/triage.py add "<idea>"            add one idea
  python factory/scripts/triage.py check                   validate ideas/triage.json
  python factory/scripts/triage.py render                  validate, then write the ranked ideas/triage.md
  python factory/scripts/triage.py pick TRI-nnn [<slug>] --reply "approve"   Gate 0: scaffold the idea
  python factory/scripts/triage.py park TRI-nnn --reason "..."             the owner chose not now

The register is ideas/triage.json (schema factory/schemas/triage.schema.json). The assistant records each
entry's data classes and either a knock-out (with its rule and reason) or the four RICE factors (each with
a one-line reason); this script does the arithmetic and the ranking, so the order is reproducible:
score = Reach x Impact x Confidence% / Effort, ties broken by higher confidence, then lower effort, then ID.
Data classes are checked against the data-classes table (POL-11) in every policies.md of the entry's scope:
a class answered "no" there must be knocked out. Rules: factory/stages/triage.md.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import scaffold  # noqa: E402
import scopes  # noqa: E402

REGISTER = "ideas/triage.json"
INBOX = "ideas/inbox.md"
REPORT = "ideas/triage.md"
GATE_FILE = "ideas/gate-0.md"
IMPACTS = (0.25, 0.5, 1, 2, 3)
SURVIVING = ("scored", "picked")
BULLET = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?")
CLASS_COLUMN = "may be used"


def register_path(root: Path | None = None) -> Path:
    return (root or lib.ROOT) / REGISTER


def load(root: Path | None = None) -> dict:
    path = register_path(root)
    if not path.exists():
        return {"schema_version": 1, "period": "per month", "entries": []}
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


# ---------------------------------------------------------------- intake
INBOX_TEXT = """# Inbox

<!-- Put ideas here, one per line or bullet, in your own words. `/factory triage` takes in every line not yet
in ideas/triage.json, knocks out what cannot go ahead, scores the rest with RICE and ranks them in
ideas/triage.md (factory/stages/triage.md). Lines already taken in are skipped; you may delete them. -->
"""


def ensure_inbox(root: Path | None = None) -> bool:
    """Write ideas/inbox.md when it is missing (an instance made before 0.2.0 has none); True if written."""
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


def next_id(reg: dict) -> str:
    used = [int(e["id"][4:]) for e in reg["entries"] if re.match(r"^TRI-\d{3}$", e.get("id", ""))]
    return f"TRI-{max(used, default=0) + 1:03d}"


def add(reg: dict, idea: str, source: str = "single") -> dict | None:
    """Add an idea as `new`; None when the same text is already in the register."""
    if any(norm(e["idea"]) == norm(idea) for e in reg["entries"]):
        return None
    entry = {"id": next_id(reg), "title": title_of(idea), "idea": idea.strip(), "source": source,
             "added": lib.today(), "status": "new"}
    reg["entries"].append(entry)
    return entry


def intake(reg: dict, root: Path | None = None) -> list[dict]:
    ensure_inbox(root)
    return [e for e in (add(reg, line, "inbox") for line in inbox_lines(root)) if e]


def untriaged_inbox(reg: dict, root: Path | None = None) -> list[str]:
    known = {norm(e["idea"]) for e in reg["entries"]}
    return [line for line in inbox_lines(root) if norm(line) not in known]


# ---------------------------------------------------------------- data classes (POL-11)
def class_table(path: Path) -> dict[str, tuple[str, str]]:
    """{class (lower case): (verdict, note)} from a policies.md data-classes table; verdict is yes, no or conditional."""
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
    rank = {"yes": 0, "conditional": 1, "no": 2}
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


# ---------------------------------------------------------------- scoring
def score(rice: dict) -> float:
    r, i, c, e = (rice[k]["value"] for k in ("reach", "impact", "confidence", "effort"))
    return round(r * i * (c / 100) / e, 2)


def ranked(reg: dict) -> list[tuple[int, dict, float]]:
    scored = [e for e in reg["entries"] if e["status"] == "scored"]
    order = sorted(scored, key=lambda e: (-score(e["rice"]), -e["rice"]["confidence"]["value"], e["rice"]["effort"]["value"], e["id"]))
    return [(n, e, score(e["rice"])) for n, e in enumerate(order, start=1)]


def conditions(entry: dict, rules: dict[str, tuple[str, str]]) -> list[str]:
    return [f"{c}: {rules[c.lower()][1] or 'conditional'}" for c in entry.get("data_classes", [])
            if rules.get(c.lower(), ("yes", ""))[0] == "conditional"]


# ---------------------------------------------------------------- validation
def problems(reg: dict, root: Path | None = None) -> list[str]:
    base = root or lib.ROOT
    found = lib.validate("triage", reg, root)
    if found:
        return found
    ids = [e["id"] for e in reg["entries"]]
    found += [f"{i} is used twice" for i in sorted({i for i in ids if ids.count(i) > 1})]
    catalogue = {p.stem for p in (base / "catalogue" / "assets").glob("CAT-*.json")}
    scope_reg = scopes.registry(root)
    rules_for: dict[str, tuple[dict, list[str]]] = {}
    for e in reg["entries"]:
        i, status = e["id"], e["status"]
        scope = e.get("scope", reg.get("scope", scopes.GROUP))
        try:
            scopes.parse(scope, scope_reg)
        except lib.FactoryError as exc:
            found.append(f"{i}: {exc}")
            continue
        if scope not in rules_for:
            rules_for[scope] = class_rules(scope, root)
        rules = rules_for[scope][0]
        found += [f"{i}: asset {a} is not in the catalogue" for a in e.get("assets", []) if a not in catalogue]
        if status == "new":
            continue
        if "data_classes" not in e:
            found.append(f"{i}: record the data classes it needs (data_classes, [] for none)")
        elif rules:
            unknown = [c for c in e["data_classes"] if c.lower() not in rules]
            if unknown:
                found.append(f"{i}: data class {', '.join(unknown)} is not in the data-classes table (POL-11); known: {', '.join(sorted(rules))}")
            barred = [c for c in e["data_classes"] if rules.get(c.lower(), ("", ""))[0] == "no"]
            if barred and status != "knocked-out":
                found.append(f"{i}: needs {', '.join(barred)}, which POL-11 does not allow; knock it out (rule data-class)")
        if status == "knocked-out":
            found += knockout_problems(e, reg, base)
            continue
        if e.get("knockout"):
            found.append(f"{i}: has a knock-out but status {status}")
        if status in SURVIVING or (status == "parked" and "rice" in e):
            found += rice_problems(e)
        if status == "parked" and "parked" not in e:
            found.append(f"{i}: parked needs the parked record (date and reason)")
        if status == "picked":
            slug = e.get("picked", {}).get("slug")
            if not slug:
                found.append(f"{i}: picked needs the picked record (use triage.py pick)")
            elif not (lib.idea_dir(slug, root) / "state.json").exists():
                found.append(f"{i}: picked as ideas/{slug}, which does not exist")
    return found


def knockout_problems(e: dict, reg: dict, base: Path) -> list[str]:
    i, ko = e["id"], e.get("knockout")
    if not ko:
        return [f"{i}: knocked out without a knock-out record (rule and reason)"]
    rule, ref = ko["rule"], ko.get("ref", "")
    if rule == "policy" and not re.fullmatch(r"POL-\d+", ref):
        return [f"{i}: a policy knock-out names the policy it breaks (ref POL-nn)"]
    if rule == "duplicate":
        if re.fullmatch(r"CAT-\d{3}", ref):
            ok = (base / "catalogue" / "assets" / f"{ref}.json").exists()
        elif re.fullmatch(r"TRI-\d{3}", ref):
            ok = ref != i and any(x["id"] == ref for x in reg["entries"])
        elif ref.startswith("ideas/"):
            ok = (base / ref / "state.json").exists()
        else:
            return [f"{i}: a duplicate names what it duplicates (ref ideas/<slug>, CAT-nnn or TRI-nnn)"]
        if not ok:
            return [f"{i}: duplicates {ref}, which does not exist"]
    return []


def rice_problems(e: dict) -> list[str]:
    i, rice = e["id"], e.get("rice")
    if not rice:
        return [f"{i}: {e['status']} needs the four RICE factors"]
    out = []
    if rice["reach"]["value"] < 0:
        out.append(f"{i}: reach cannot be negative")
    if rice["impact"]["value"] not in IMPACTS:
        out.append(f"{i}: impact must be one of {', '.join(str(x) for x in IMPACTS)}")
    if not 0 < rice["confidence"]["value"] <= 100:
        out.append(f"{i}: confidence is a percentage, above 0 and at most 100")
    if rice["effort"]["value"] <= 0:
        out.append(f"{i}: effort is person-weeks, above 0")
    return out


# ---------------------------------------------------------------- report
def cell(text: object) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ")


def number(x: float) -> str:
    return f"{x:.2f}".rstrip("0").rstrip(".")


def counts(reg: dict, root: Path | None = None) -> dict[str, int]:
    out = {s: sum(1 for e in reg["entries"] if e["status"] == s) for s in ("scored", "parked", "knocked-out", "picked", "new")}
    out["new"] += len(untriaged_inbox(reg, root))
    return out


def summary(root: Path | None = None) -> str | None:
    """One line for status.py, or None with no register and no inbox."""
    if not register_path(root).exists() and not inbox_lines(root):
        return None
    try:
        reg = load(root)
        c = counts(reg, root)
    except (ValueError, KeyError) as exc:
        return f"Triage: {REGISTER} cannot be read ({exc})"
    return (f"Triage: {c['scored']} ranked, {c['picked']} picked, {c['parked']} parked, "
            f"{c['knocked-out']} knocked out, {c['new']} not yet triaged ({REPORT})")


def render(reg: dict, root: Path | None = None) -> str:
    c = counts(reg, root)
    default_scope = reg.get("scope", scopes.GROUP)
    lines = [
        "# Triage", "",
        f"Generated by `python factory/scripts/triage.py render` from `{REGISTER}`; do not edit. "
        f"Reach is counted {reg['period']}; Impact is 0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive; "
        "Confidence is a percentage; Effort is rough person-weeks. Score = Reach x Impact x Confidence / Effort.", "",
        f"Updated {reg.get('updated', lib.today())}: {c['scored']} ranked, {c['picked']} picked, {c['parked']} parked, "
        f"{c['knocked-out']} knocked out, {c['new']} not yet triaged. The owner picks at Gate 0 (`{GATE_FILE}`).", "",
        "## Ranked", "",
    ]
    rows = ranked(reg)
    if rows:
        lines += ["| Rank | ID | Idea | Score | Reach | Impact | Confidence | Effort | Why | Conditions |",
                  "|---|---|---|---|---|---|---|---|---|---|"]
        for n, e, s in rows:
            rice = e["rice"]
            why = "; ".join(f"{k[0].upper()}: {rice[k]['reason']}" for k in ("reach", "impact", "confidence", "effort"))
            rules = class_rules(e.get("scope", default_scope), root)[0]
            lines.append(
                f"| {n} | {e['id']} | {cell(e['title'])} | {number(s)} | {number(rice['reach']['value'])} | "
                f"{number(rice['impact']['value'])} | {number(rice['confidence']['value'])}% | {number(rice['effort']['value'])} | "
                f"{cell(why)} | {cell('; '.join(conditions(e, rules)) or '-')} |")
    else:
        lines.append("Nothing scored yet.")
    picked = [e for e in reg["entries"] if e["status"] == "picked"]
    if picked:
        lines += ["", "## Picked at Gate 0", "", "| ID | Idea | Score | Idea folder | Date |", "|---|---|---|---|---|"]
        lines += [f"| {e['id']} | {cell(e['title'])} | {number(score(e['rice']))} | `ideas/{e['picked']['slug']}/` | {e['picked']['date']} |" for e in picked]
    parked = [e for e in reg["entries"] if e["status"] == "parked"]
    if parked:
        lines += ["", "## Parked", "", "| ID | Idea | Score | Reason | Date |", "|---|---|---|---|---|"]
        lines += [f"| {e['id']} | {cell(e['title'])} | {number(score(e['rice'])) if 'rice' in e else '-'} | {cell(e['parked']['reason'])} | {e['parked']['date']} |"
                  for e in parked]
    out = [e for e in reg["entries"] if e["status"] == "knocked-out"]
    if out:
        lines += ["", "## Knocked out", "", "| ID | Idea | Rule | Ref | Reason |", "|---|---|---|---|---|"]
        lines += [f"| {e['id']} | {cell(e['title'])} | {e['knockout']['rule']} | {cell(e['knockout'].get('ref') or '-')} | {cell(e['knockout']['reason'])} |"
                  for e in out]
    new = [e for e in reg["entries"] if e["status"] == "new"]
    waiting = untriaged_inbox(reg, root)
    if new or waiting:
        lines += ["", "## Not yet triaged", ""]
        lines += [f"- {e['id']} {e['title']}" for e in new]
        lines += [f"- (inbox, not taken in yet) {line}" for line in waiting]
    files = sorted({f for s in {e.get("scope", default_scope) for e in reg["entries"]} | {default_scope} for f in class_rules(s, root)[1]})
    lines += ["", "Data classes checked against: " + (", ".join(f"`{f}`" for f in files) if files else "no data-classes table (POL-11) found, so not checked") + ".", ""]
    return "\n".join(lines)


# ---------------------------------------------------------------- Gate 0
def find(reg: dict, tri: str) -> dict:
    for e in reg["entries"]:
        if e["id"] == tri:
            return e
    raise lib.FactoryError(f"{tri} is not in {REGISTER}")


IDEA_TEXT = "<In the owner's words: what it is, who it is for, what problem it solves.>"


def pick(reg: dict, tri: str, slug: str | None, reply: str, root: Path | None = None) -> Path:
    """Gate 0 approved for one entry: scaffold the idea and carry its triage record into idea.md and state.json."""
    bad = problems(reg, root)
    if bad:
        raise lib.FactoryError("fix the register first: " + "; ".join(bad))
    e = find(reg, tri)
    if e["status"] not in ("scored", "parked") or "rice" not in e:
        raise lib.FactoryError(f"{tri} is {e['status']}; only a scored (or parked and scored) idea can be picked")
    slug = slug or slugify(e["title"])
    rice = e["rice"]
    idea = scaffold.new_idea(slug, e["title"], root=root)
    text = (idea / "idea.md").read_text(encoding="utf-8").replace(IDEA_TEXT, e["idea"])
    rows = "\n".join(f"| {k.capitalize()} | {number(rice[k]['value'])}{'%' if k == 'confidence' else ''} | {cell(rice[k]['reason'])} |"
                     for k in ("reach", "impact", "confidence", "effort"))
    text += (f"\n## Triage (Gate 0)\n{tri} in `{REGISTER}`, picked on {lib.today()} (\"{reply}\"). "
             f"RICE score {number(score(rice))}; Reach is counted {reg['period']}, Effort in person-weeks.\n\n"
             f"| Factor | Value | Why |\n|---|---|---|\n{rows}\n")
    if e.get("data_classes"):
        text += f"\nData classes: {', '.join(e['data_classes'])}.\n"
    (idea / "idea.md").write_text(text, encoding="utf-8", newline="\n")
    state = lib.load_state(slug, root)
    state["gates"]["0"] = {"status": "approved", "date": lib.today(), "reply": reply, "file": GATE_FILE}
    state["triage"] = {"id": tri, "score": score(rice), "period": reg["period"],
                       **{k: rice[k]["value"] for k in ("reach", "impact", "confidence", "effort")}}
    scope = e.get("scope", reg.get("scope", scopes.GROUP))
    if scope != scopes.GROUP:
        state["scope"] = scopes.parse(scope, scopes.registry(root))
    lib.save_state(slug, state, root)
    e["status"] = "picked"
    e["picked"] = {"date": lib.today(), "slug": slug, "reply": reply}
    return idea


def park(reg: dict, tri: str, reason: str) -> None:
    e = find(reg, tri)
    if e["status"] not in ("new", "scored"):
        raise lib.FactoryError(f"{tri} is {e['status']}; only a new or scored idea can be parked")
    e["status"] = "parked"
    e["parked"] = {"date": lib.today(), "reason": reason}


# ---------------------------------------------------------------- command line
def option(args: list[str], name: str) -> str | None:
    if name in args:
        at = args.index(name)
        value = args[at + 1] if at + 1 < len(args) else None
        del args[at : at + 2]
        return value
    return None


def main(argv: list[str]) -> int:
    args = argv[1:]
    try:
        reply = option(args, "--reply")
        reason = option(args, "--reason")
        reg = load()
        if args == ["intake"]:
            added = intake(reg)
            save(reg)
            print(f"triage: {len(added)} idea(s) taken in from {INBOX}" + "".join(f"\n  {e['id']} {e['title']}" for e in added))
            return 0
        if len(args) == 2 and args[0] == "add":
            entry = add(reg, args[1])
            if entry is None:
                print("triage: that idea is already in the register")
                return 1
            save(reg)
            print(f"triage: added {entry['id']} {entry['title']}")
            return 0
        if args in (["check"], ["render"]):
            bad = problems(reg)
            for p in bad:
                print("  " + p)
            if bad:
                print(f"triage: FAILED ({len(bad)} problem(s))")
                return 1
            if args == ["render"]:
                (lib.ROOT / REPORT).write_text(render(reg), encoding="utf-8", newline="\n")
            c = counts(reg)
            tail = f"; wrote {REPORT}" if args == ["render"] else ""
            print(f"triage: OK ({c['scored']} ranked, {c['knocked-out']} knocked out, {c['parked']} parked, {c['new']} not yet triaged){tail}")
            for n, e, s in ranked(reg)[:5]:
                print(f"  {n}. {e['id']} {e['title']} ({number(s)})")
            return 0
        if args and args[0] == "pick" and len(args) in (2, 3) and reply:
            idea = pick(reg, args[1], args[2] if len(args) == 3 else None, reply)
            save(reg)
            (lib.ROOT / REPORT).write_text(render(reg), encoding="utf-8", newline="\n")
            print(f"triage: {args[1]} picked; created {idea.relative_to(lib.ROOT).as_posix()}/ (stage analyse)")
            return 0
        if len(args) == 2 and args[0] == "park" and reason:
            park(reg, args[1], reason)
            save(reg)
            print(f"triage: {args[1]} parked")
            return 0
    except (lib.FactoryError, ValueError) as exc:
        print(f"triage: {exc}", file=sys.stderr)
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
