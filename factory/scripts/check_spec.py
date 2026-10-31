#!/usr/bin/env python3
"""Check an idea at Gate 1 (brief, assessment, overview) or Gate 2 (definition and spec pack; writes spec/traceability.md).

Usage:
  python factory/scripts/check_spec.py <slug | ideas/<slug> | path/to/spec>   the definition and the spec pack (Gate 2)
  python factory/scripts/check_spec.py <slug> --assessment          the idea brief, the assessment (with its pre-mortem) and the overview (Gate 1)
  python factory/scripts/check_spec.py <slug> --impact FR-007[,US-003]   what a change touches

Deterministic, no AI. Prints `BLOCKER file:line message` and `warning file:line message`; exits 1
when there is any blocker. Rules: factory/stages/develop-assess.md (Gate 1), factory/standards/requirement-ids.md
and factory/stages/spec.md (Gate 2). At both gates, an idea in the factory has its challenger's review checked
(gates/challenge-<gate>.md, factory/standards/challenge.md): missing is a warning, an unanswered challenge a blocker.
A pack copied outside the factory can be checked by its path; catalogue references are then checked
against this factory's catalogue.
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import pipeline  # noqa: E402
import scopes  # noqa: E402

PREFIXES = [
    "OBJ", "JRN", "FR", "RULE", "SCR", "NFR", "DATA", "REL", "ROLE", "PERM", "SEC", "US", "AC",
    "ASM", "Q", "RISK", "DEP", "DEC", "CR", "CMP", "INT", "EPIC", "TEST", "CAP",
]
ID = re.compile(r"\b(" + "|".join(PREFIXES + ["CAT"]) + r")-(\d{3})(-AC\d+)?\b")
ID_ONLY = re.compile(r"^(" + "|".join(PREFIXES) + r")-\d{3}(-AC\d+)?$")
HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
LINK = re.compile(r"\]\(([^)#\s]+)(#[^)]*)?\)")
PLACEHOLDER = lib.PLACEHOLDER
DEFINITION_BLOCK = re.compile(r"\A\s*```json definition\s*\n(.*?)\n```", re.S)
DOCS = [
    "README", "01-overview", "02-product-definition", "03-functional-requirements", "04-user-experience",
    "05-non-functional-requirements", "06-data-model", "07-security-and-permissions", "08-user-stories",
    "09-assumptions-risks-decisions", "10-architecture-and-deployment", "11-delivery-plan",
    "12-component-selection-and-gaps", "13-business-process",
]
GENERATED = {"traceability.md"}
PRIORITIES = {"must", "should", "could"}
OPEN_ITEMS = {"ASM", "Q", "RISK", "DEP"}
STATUSES = {"open", "closed", "accepted", "withdrawn"}
BLOCKS = {"none", "spec", "build", "release"}
DECISIONS = {"reuse", "adapt", "build", "import", "redesign", "defer"}
NEEDS_FR = {"RULE": "FR", "SCR": "FR", "DATA": "FR", "PERM": "FR", "INT": "FR"}
BRIEF_HEADINGS = ["Problem", "Outcome and success measures", "How it's done today", "Data", "Risk", "People and process",
                  "Strategic fit", "Assumptions and unknowns"]
PLAN_HEADINGS = ["The question", "Success and kill criteria", "Time box", "In and out", "Data and protection", "Template", "Afterwards"]
OVERVIEW_HEADINGS = ["Executive summary", "What it is", "How it changes people's work", "In scope and out of scope", "What happens next"]
PROCESS_SECTIONS = ("as-is", "to-be", "what changes")
# Documents added after the first release: an idea started on an older factory is warned, not blocked (versioning.md).
DOC_SINCE = {"13-business-process": "0.2.0"}
PREMORTEM_SINCE = "0.9.0"
PREMORTEM = re.compile(r"^##\s+Pre-mortem\s*$(.*?)(?=^##\s|\Z)", re.M | re.S | re.I)
CHALLENGE_COLUMNS = ["#", "where", "challenge", "answer", "outcome"]
CHALLENGE_OUTCOMES = {"changed", "kept"}
MERMAID = re.compile(r"^```mermaid\s*$", re.M)


@dataclass
class Item:
    id: str
    kind: str
    file: str
    line: int
    cells: list[str] = field(default_factory=list)
    header: list[str] = field(default_factory=list)
    text: str = ""

    @property
    def withdrawn(self) -> bool:
        return bool(re.search(r"(?i)\b(withdrawn|superseded)\b", self.text))

    def refs(self, kind: str | None = None) -> list[str]:
        found = [m.group(0) for m in ID.finditer(self.text) if m.group(0) != self.id]
        return list(dict.fromkeys(f for f in found if kind is None or kind_of(f) == kind))

    def col(self, name: str) -> str:
        """The cell under a header that starts with `name` (case-insensitive), or ''."""
        for i, head in enumerate(self.header):
            if head.startswith(name) and i < len(self.cells):
                return self.cells[i]
        return ""

    def has_col(self, name: str) -> bool:
        return any(h.startswith(name) for h in self.header)

    def col_refs(self, name: str, kind: str | None = None) -> list[str]:
        return [m.group(0) for m in ID.finditer(self.col(name)) if kind is None or kind_of(m.group(0)) == kind]


class Findings:
    def __init__(self) -> None:
        self.blockers: list[str] = []
        self.warnings: list[str] = []

    def block(self, where: str, message: str) -> None:
        self.blockers.append(f"{where}  {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}  {message}")

    def done(self) -> None:
        self.blockers = list(dict.fromkeys(self.blockers))
        self.warnings = list(dict.fromkeys(self.warnings))


def has_placeholder(text: str) -> bool:
    """Template text like <Who has the problem> left in prose; code spans and blocks are not prose."""
    prose = re.sub(r"```.*?```", "", text, flags=re.S)
    prose = re.sub(r"`[^`\n]*`", "", prose)
    return bool(PLACEHOLDER.search(prose))


def kind_of(item_id: str) -> str:
    return "AC" if "-AC" in item_id else item_id.split("-")[0]


def split_row(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def is_rule(cells: list[str]) -> bool:
    return all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c)


def pack_files(spec: Path) -> list[Path]:
    return [p for p in sorted(spec.glob("*.md")) if p.name not in GENERATED and p.name not in ("source-map.md", "id-map.md")]


def parse(spec: Path) -> tuple[list[Item], set[tuple[str, int]]]:
    items: list[Item] = []
    def_lines: set[tuple[str, int]] = set()
    for path in pack_files(spec):
        lines = path.read_text(encoding="utf-8").splitlines()
        header: list[str] = []
        open_heading: Item | None = None
        for n, line in enumerate(lines, start=1):
            h = HEADING.match(line)
            if h:
                open_heading = None
                header = []
                title = h.group(2).strip().split()[0] if h.group(2).strip() else ""
                if ID_ONLY.match(title):
                    open_heading = Item(title, kind_of(title), path.name, n, text=line)
                    items.append(open_heading)
                    def_lines.add((path.name, n))
                continue
            if open_heading is not None:
                open_heading.text += "\n" + line
            if not line.strip().startswith("|"):
                continue
            cells = split_row(line)
            if is_rule(cells):
                continue
            if cells and ID_ONLY.match(cells[0]):
                kind = kind_of(cells[0])
                if header and header[0] == kind.lower():
                    items.append(Item(cells[0], kind, path.name, n, cells, header, line))
                    def_lines.add((path.name, n))
            else:
                header = [c.lower() for c in cells]
    return items, def_lines


# ---------------------------------------------------------------- inputs around the pack
def locate(arg: str) -> tuple[Path, Path]:
    """(idea folder, spec folder) for a slug, an idea folder or a spec folder."""
    path = Path(arg)
    if not path.exists():
        path = lib.ROOT / "ideas" / arg
    path = path.resolve()
    if (path / "spec").is_dir() or (path / "state.json").exists():
        return path, path / "spec"
    return path.parent, path


def read_definition(idea: Path) -> tuple[dict | None, list[str]]:
    path = idea / "application-definition.md"
    if not path.exists():
        return None, []
    match = DEFINITION_BLOCK.match(path.read_text(encoding="utf-8"))
    if not match:
        return None, ["application-definition.md  must start with a ```json definition block"]
    try:
        data = json.loads(match.group(1))
    except ValueError as exc:
        return None, [f"application-definition.md  the definition block is not valid JSON ({exc})"]
    return data, [f"application-definition.md  {p}" for p in lib.validate("application-definition", data)]


def check_definition(idea: Path, f: Findings) -> dict | None:
    data, problems = read_definition(idea)
    for p in problems:
        f.block(*p.split("  ", 1))
    if data is None and not problems:
        f.block("application-definition.md", "missing (Spec writes it first; see factory/stages/spec.md)")
        return None
    if data is not None and not problems:
        text = (idea / "application-definition.md").read_text(encoding="utf-8")
        if has_placeholder(text):
            f.warn("application-definition.md", "placeholder text left (<...>)")
        if data["slug"] != idea.name and (idea / "state.json").exists():
            f.block("application-definition.md", f"slug {data['slug']} does not match the idea folder {idea.name}")
        for key in ("maturity_tier", "deployment", "interfaces", "template"):
            if data.get(key, {}).get("state") == "unresolved":
                f.warn("application-definition.md", f"{key} is unresolved")
        if data["maturity_tier"]["value"] == 1 and (idea / "state.json").exists():
            f.warn("application-definition.md", "tier 1 is a spike, which takes the light route (a plan, no spec pack: "
                                                "factory/stages/light.md); the full route is tier 2, 3 or 4")
        for key in ("data", "protection"):
            if key not in data:
                f.warn("application-definition.md", f"no {key} decision (factory/standards/tiers.md: data and protection are decided apart from the tier)")
    return data if not problems else None


def version_key(version: str) -> tuple[int, ...]:
    return tuple(int(x) for x in re.findall(r"\d+", version)[:3])


def started_on(idea: Path) -> str | None:
    """The factory version an idea in the factory records (state.json), or None for a pack outside it."""
    path = idea / "state.json"
    if not path.exists():
        return None
    try:
        return lib.read_json(path).get("factory_version")
    except ValueError:
        return None


def check_overview(idea: Path, f: Findings) -> None:
    """The overview for sponsors and the team (Gate 1): present, filled in, and free of requirement IDs."""
    path = idea / "overview.md"
    if not path.exists():
        f.block("overview.md", "missing (scaffold.py overview <slug>; see factory/stages/develop-assess.md)")
        return
    text = path.read_text(encoding="utf-8")
    if has_placeholder(text):
        f.block("overview.md", "placeholder text left (<...>): it goes to sponsors as written")
    for heading in OVERVIEW_HEADINGS:
        if not re.search(rf"(?im)^##\s+{re.escape(heading)}", text):
            f.warn("overview.md", f"no '{heading}' section")
    ids = sorted({m.group(0) for m in ID.finditer(text) if kind_of(m.group(0)) != "CAT"})
    if ids:
        f.warn("overview.md", f"uses requirement IDs ({', '.join(ids[:5])}); say it in plain words")


def check_brief(idea: Path, f: Findings) -> None:
    """The idea brief (Gate 1): present, every section there, nothing left to fill in."""
    path = idea / pipeline.BRIEF
    if not path.exists():
        f.block(pipeline.BRIEF, "missing (pipeline.py develop; see factory/stages/develop-assess.md)")
        return
    text = path.read_text(encoding="utf-8")
    if has_placeholder(text):
        f.block(pipeline.BRIEF, "placeholder text left (<...>): draft every section, marking assumptions")
    for heading in BRIEF_HEADINGS:
        if not re.search(rf"(?im)^##\s+{re.escape(heading)}\s*$", text):
            f.block(pipeline.BRIEF, f"no '## {heading}' section")


def check_plan(idea: Path, f: Findings) -> None:
    """The spike's plan (the light route, Gate 1): present, every section there, nothing left to fill in."""
    path = idea / pipeline.PLAN
    if not path.exists():
        f.block(pipeline.PLAN, "missing (scaffold.py plan <slug>; see factory/stages/light.md)")
        return
    text = path.read_text(encoding="utf-8")
    if has_placeholder(text):
        f.block(pipeline.PLAN, "placeholder text left (<...>): the question, the criteria and the time box are decided now")
    for heading in PLAN_HEADINGS:
        if not re.search(rf"(?im)^##\s+{re.escape(heading)}\s*$", text):
            f.block(pipeline.PLAN, f"no '## {heading}' section")


def check_premortem(idea: Path, f: Findings) -> None:
    """The assessment's pre-mortem (Gate 1): the likeliest reasons the idea fails, written before the decision."""
    text = re.sub(r"```.*?```", "", (idea / pipeline.ASSESSMENT).read_text(encoding="utf-8"), flags=re.S)
    match = PREMORTEM.search(text)
    if match and match.group(1).strip() and not has_placeholder(match.group(1)):
        return
    problem = "the pre-mortem is not written" if match else "no '## Pre-mortem' section"
    started = started_on(idea)
    if started is not None and version_key(started) < version_key(PREMORTEM_SINCE):
        f.warn(pipeline.ASSESSMENT, f"{problem} (required from factory {PREMORTEM_SINCE}; this idea started on {started})")
    else:
        f.block(pipeline.ASSESSMENT, f"{problem}: the likeliest reasons it fails (factory/stages/develop-assess.md)")


def check_challenge(idea: Path, gate: int, f: Findings) -> None:
    """The challenger's review before a gate (factory/standards/challenge.md): every challenge answered."""
    rel = f"gates/challenge-{gate}.md"
    path = idea / rel
    if not path.exists():
        f.warn(rel, "missing: the recommendation has not been challenged (factory/standards/challenge.md)")
        return
    text = path.read_text(encoding="utf-8")
    if has_placeholder(text):
        f.block(rel, "placeholder text left (<...>)")
    header: list[str] | None = None
    rows = 0
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip().startswith("|"):
            header = None
            continue
        cells = split_row(line)
        if header is None:
            header = [c.lower() for c in cells]
            if header[0] == "#" and header != CHALLENGE_COLUMNS:
                f.block(f"{rel}:{n}", "the table's columns must be # | Where | Challenge | Answer | Outcome")
            continue
        if header != CHALLENGE_COLUMNS or not "".join(cells).strip("-: "):
            continue
        rows += 1
        row = dict(zip(header, cells))
        if not row.get("answer"):
            f.block(f"{rel}:{n}", f"challenge {row['#']} has no answer")
        if row.get("outcome", "").lower() not in CHALLENGE_OUTCOMES:
            f.block(f"{rel}:{n}", f"challenge {row['#']}: outcome must be changed or kept")
    if not rows:
        f.warn(rel, "no challenges recorded: a challenger that finds nothing has usually not looked")


def factory_root(idea: Path) -> Path | None:
    """The factory an idea folder sits in (ideas/<slug>), or None for this one."""
    return idea.parents[1] if idea.parent.name == "ideas" and (idea.parents[1] / "factory").is_dir() else None


def check_gate_one(idea: Path, f: Findings, root: Path | None = None) -> dict | None:
    """Gate 1, the investment decision: the brief, the assessment (in full) and, unless knocked out, the overview."""
    root = root or factory_root(idea)
    check_brief(idea, f)
    a, problems = pipeline.read_assessment(idea, root)
    for p in problems:
        f.block(pipeline.ASSESSMENT, p)
    if a is None and not problems:
        f.block(pipeline.ASSESSMENT, "missing (pipeline.py develop; see factory/stages/develop-assess.md)")
    if a is None or problems:
        check_overview(idea, f)
        return None
    state, reg = {}, pipeline.load(root)
    if (idea / "state.json").exists():
        state = lib.read_json(idea / "state.json")
    blockers, warnings = pipeline.assessment_problems(a, idea.name, root, complete=True, reg=reg,
                                                     scope=pipeline.idea_scope(state, reg, idea.name))
    for b in blockers:
        f.block(pipeline.ASSESSMENT, b)
    for w in warnings:
        f.warn(pipeline.ASSESSMENT, w)
    light = a["decision"].get("route") == "light"
    if light:
        check_plan(idea, f)
        if "go" not in (a["decision"]["recommended"], a["decision"].get("decided")):
            f.warn(pipeline.ASSESSMENT, "route is light, but the recommendation is not Go")
    if light and not (idea / "overview.md").exists():
        f.warn("overview.md", "missing: the light route needs none, but sponsors read it if the idea grows")
    elif not a.get("knockout"):
        check_overview(idea, f)
    if not a.get("knockout"):
        check_premortem(idea, f)
        check_challenge(idea, 1, f)
    return a


def process_sections(text: str) -> dict[str, tuple[int, str]]:
    """{as-is | to-be | what changes: (line of the heading, the section's text)} from doc 13."""
    out: dict[str, tuple[int, str]] = {}
    current, start, body = None, 0, []
    for n, line in enumerate(text.splitlines() + ["## end"], start=1):
        h = re.match(r"^##\s+(.*)$", line)
        if h:
            if current:
                out.setdefault(current, (start, "\n".join(body)))
            title = h.group(1).strip().lower().replace("as is", "as-is").replace("to be", "to-be")
            current = next((k for k in PROCESS_SECTIONS if title.startswith(k)), None)
            start, body = n, []
        elif current:
            body.append(line)
    return out


def check_process(spec: Path, by_id: dict[str, Item], f: Findings) -> None:
    """Doc 13: as-is and to-be as Mermaid, to-be steps naming the FRs they rely on, and what changes."""
    path = spec / "13-business-process.md"
    if not path.exists():
        return  # reported as a missing document
    sections = process_sections(path.read_text(encoding="utf-8"))
    for key in ("as-is", "to-be"):
        if key not in sections:
            f.block(path.name, f"no '## {key.capitalize()}' section")
        elif not MERMAID.search(sections[key][1]):
            f.block(f"{path.name}:{sections[key][0]}", f"the {key} section needs a ```mermaid flowchart")
    if "what changes" not in sections:
        f.warn(path.name, "no '## What changes' section (steps removed, automated or changed; who does what; savings)")
    elif not any(ln.strip().startswith("|") for ln in sections["what changes"][1].splitlines()):
        f.warn(f"{path.name}:{sections['what changes'][0]}", "'What changes' has no table")
    if "to-be" not in sections:
        return
    start, body = sections["to-be"]
    header: list[str] = []
    steps = 0
    for n, line in enumerate(body.splitlines(), start=start + 1):
        if not line.strip().startswith("|"):
            header = []
            continue
        cells = split_row(line)
        if is_rule(cells):
            continue
        if not header:
            header = [c.lower() for c in cells]
            continue
        if header[0] != "step":
            continue
        steps += 1
        frs = [m.group(0) for m in ID.finditer(line) if kind_of(m.group(0)) == "FR"]
        if not frs:
            f.warn(f"{path.name}:{n}", f"to-be step {cells[0]} names no FR it relies on (a manual step may say so and be accepted)")
    if not steps:
        f.warn(f"{path.name}:{start}", "the to-be section has no steps table (Step | Who | What happens | Relies on)")


def load_catalogue() -> dict[str, dict] | None:
    assets = lib.ROOT / "catalogue" / "assets"
    if not assets.is_dir():
        return None
    out = {}
    for path in assets.glob("CAT-*.json"):
        try:
            entry = lib.read_json(path)
            out[entry["id"]] = entry
        except (ValueError, KeyError):
            continue
    return out


def current_source_ids(idea: Path) -> list[str] | None:
    index = idea / "source" / "INDEX.md"
    if not index.exists():
        return None
    match = re.search(r"^current:\s*(\S+)", index.read_text(encoding="utf-8"), re.M)
    ids_file = idea / "source" / match.group(1) / "ids.json" if match else None
    if ids_file is None or not ids_file.exists():
        return None
    return json.loads(ids_file.read_text(encoding="utf-8"))


def check_source_map(idea: Path, spec: Path, by_id: dict[str, Item], f: Findings) -> None:
    source_ids = current_source_ids(idea)
    if not source_ids:
        return
    path = spec / "source-map.md"
    if not path.exists():
        f.block("source-map.md", f"missing (the imported source has {len(source_ids)} IDs to map or defer)")
        return
    seen: dict[str, int] = {}
    header: list[str] = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip().startswith("|"):
            continue
        cells = split_row(line)
        if is_rule(cells):
            continue
        if cells and cells[0].lower() == "source id":
            header = [c.lower() for c in cells]
            continue
        if not header or len(cells) < 3:
            continue
        sid, maps_to, status = cells[0], cells[1], cells[2].lower()
        note = cells[3] if len(cells) > 3 else ""
        where = f"source-map.md:{n}"
        if sid in seen:
            f.block(where, f"{sid} is listed twice (first at line {seen[sid]})")
        seen[sid] = n
        if sid not in source_ids:
            f.block(where, f"{sid} is not an ID in the imported source")
        if status not in ("mapped", "deferred"):
            f.block(where, f"{sid} status must be Mapped or Deferred")
        elif status == "mapped" and not any(m.group(0) in by_id for m in ID.finditer(maps_to)):
            f.block(where, f"{sid} is Mapped but names no defined spec ID")
        elif status == "deferred" and not note.strip():
            f.block(where, f"{sid} is Deferred but gives no reason")
    for sid in source_ids:
        if sid not in seen:
            f.block("source-map.md", f"source ID {sid} is neither mapped nor deferred")


# ---------------------------------------------------------------- the pack
def check_pack(idea: Path, spec: Path, f: Findings, tier: int, deployment: str | None) -> tuple[dict[str, Item], dict]:
    started = started_on(idea)
    for name in DOCS:
        if not (spec / f"{name}.md").exists():
            since = DOC_SINCE.get(name)
            if since and started is not None and version_key(started) < version_key(since):
                f.warn(f"spec/{name}.md", f"missing (required from factory {since}; this idea started on {started}: add it with a change request)")
            else:
                f.block(f"spec/{name}.md", "missing")
    items, def_lines = parse(spec)

    by_id: dict[str, Item] = {}
    for it in items:
        if it.id in by_id:
            first = by_id[it.id]
            f.block(f"{it.file}:{it.line}", f"duplicate ID {it.id} (first at {first.file}:{first.line})")
        else:
            by_id[it.id] = it
    live = {i: it for i, it in by_id.items() if not it.withdrawn}
    loc = {i: f"{it.file}:{it.line}" for i, it in by_id.items()}

    # every file: metadata, links, placeholders, references
    catalogue = load_catalogue()
    reach = scope_reach(idea)
    for path in pack_files(spec):
        text = path.read_text(encoding="utf-8")
        first_table = next((ln for ln in text.splitlines() if ln.strip().startswith("|")), "")
        if path.stem in DOCS and not split_row(first_table)[0].lower() == "doc":
            f.warn(path.name, "no metadata table (Doc | Version | Status | Updated | Baseline) before the content")
        if has_placeholder(text):
            f.warn(path.name, "placeholder text left (<...>)")
        for n, line in enumerate(text.splitlines(), start=1):
            for m in LINK.finditer(line):
                target = m.group(1)
                if not re.match(r"[a-z]+:", target) and target not in GENERATED and not (path.parent / target).exists():
                    f.block(f"{path.name}:{n}", f"broken link to {target}")
            for m in ID.finditer(line):
                ref = m.group(0)
                if kind_of(ref) == "CAT":
                    if catalogue is None:
                        f.warn(f"{path.name}:{n}", f"{ref} not checked (no catalogue available)")
                    elif ref not in catalogue:
                        f.block(f"{path.name}:{n}", f"refers to {ref}, which is not in the catalogue")
                elif ref not in by_id:
                    f.block(f"{path.name}:{n}", f"mentions {ref}, which is not defined")
                elif by_id[ref].withdrawn and (path.name, n) not in def_lines:
                    f.warn(f"{path.name}:{n}", f"refers to {ref}, which is withdrawn or superseded")

    kinds: dict[str, dict[str, Item]] = defaultdict(dict)
    for i, it in live.items():
        kinds[it.kind][i] = it
    frs, stories, epics, tests = kinds["FR"], kinds["US"], kinds["EPIC"], kinds["TEST"]
    acs = {i: it for i, it in by_id.items() if it.kind == "AC"}
    if not frs:
        f.block("03-functional-requirements.md", "no functional requirements (FR)")

    def referrers(kind: str) -> dict[str, list[str]]:
        """For each ID, the live items of `kind` that mention it."""
        out: dict[str, list[str]] = defaultdict(list)
        for i, it in kinds[kind].items():
            for ref in it.refs():
                out[ref].append(i)
        return out

    stories_for, epics_for, tests_for = referrers("US"), referrers("EPIC"), referrers("TEST")
    caps_for = referrers("CAP")

    for i, it in kinds["OBJ"].items():
        if not it.col("success"):
            f.warn(loc[i], f"{i} has no success measure")
    for i in kinds["JRN"]:
        if not any(i in fr.refs("JRN") for fr in frs.values()):
            f.warn(loc[i], f"{i} has no functional requirement (FR)")

    for i, it in frs.items():
        priority = it.col("priority").lower()
        if priority not in PRIORITIES:
            f.block(loc[i], f"{i} needs a priority (Must, Should or Could)")
        if not it.refs("JRN") and not it.refs("OBJ"):
            f.block(loc[i], f"{i} names no journey (JRN) or objective (OBJ)")
        if not stories_for.get(i):
            (f.warn if priority == "could" else f.block)(loc[i], f"{i} has no user story (US)")
        story_epics = {e for s in stories_for.get(i, []) for e in stories[s].refs("EPIC")}
        if not epics_for.get(i) and not story_epics:
            (f.warn if priority == "could" else f.block)(loc[i], f"{i} is in no epic (no implementation path)")
        if it.has_col("verification") and not it.col("verification"):
            f.warn(loc[i], f"{i} has no verification")

    for i, it in stories.items():
        if not it.refs("FR"):
            f.block(loc[i], f"{i} names no functional requirement (FR)")
        if not any(a.startswith(i + "-AC") for a in acs):
            f.block(loc[i], f"{i} has no acceptance criterion ({i}-AC1)")
        if not it.refs("EPIC") and not epics_for.get(i):
            f.warn(loc[i], f"{i} is in no epic")
    for a, it in acs.items():
        parent = a.split("-AC")[0]
        if parent not in by_id:
            f.block(loc[a], f"{a} belongs to {parent}, which is not defined")
        if not it.withdrawn and not it.col("verification") and not tests_for.get(a):
            (f.warn if tier == 1 else f.block)(loc[a], f"{a} has no verification (a test intent or a TEST)")

    for kind, parent in NEEDS_FR.items():
        for i, it in kinds[kind].items():
            if not it.refs(parent):
                f.block(loc[i], f"{i} names no {parent} that needs it")
    for i, it in kinds["PERM"].items():
        if not it.refs("ROLE") and not it.col("roles"):
            f.block(loc[i], f"{i} names no role (ROLE)")
        if not it.col("test") and not tests_for.get(i):
            f.warn(loc[i], f"{i} has no test")
    for i, it in kinds["REL"].items():
        if len(it.refs("DATA")) < 2:
            f.warn(loc[i], f"{i} should name the two entities (DATA) it relates")
    for kind in ("NFR", "SEC"):
        for i, it in kinds[kind].items():
            if not it.col("verification") and not tests_for.get(i):
                f.warn(loc[i], f"{i} has no verification")
    for i, it in kinds["NFR"].items():
        if it.has_col("threshold") and not it.col("threshold"):
            f.warn(loc[i], f"{i} has no threshold")

    for i, it in kinds["CMP"].items():
        built = it.col("built from")
        cats = [m.group(0) for m in ID.finditer(built) if kind_of(m.group(0)) == "CAT"]
        if not cats and "custom" not in built.lower() and "external" not in built.lower():
            f.block(loc[i], f"{i}: 'Built from' must be a catalogue asset (CAT-nnn), custom, or external")
        elif not cats and "external" in built.lower():
            f.warn(loc[i], f"{i} uses an external component not yet in the catalogue (import and approve it before Build)")
        for cat in cats:
            check_selected(cat, built, catalogue, loc[i], f, reach)
        if epics and not any(i in e.refs("CMP") for e in epics.values()):
            f.warn(loc[i], f"{i} is built by no epic")

    for i, it in epics.items():
        if not it.refs("FR") and not it.refs("US"):
            f.block(loc[i], f"{i} delivers no FR or story")
    for i, it in tests.items():
        if not it.col_refs("verifies") and not it.refs():
            f.warn(loc[i], f"{i} verifies nothing named")

    for i, it in kinds["CAP"].items():
        decision = it.col("decision").lower()
        selected = it.col("selected")
        if decision not in DECISIONS:
            f.block(loc[i], f"{i}: decision must be one of {', '.join(sorted(DECISIONS))}")
        cats = [m.group(0) for m in ID.finditer(selected) if kind_of(m.group(0)) == "CAT"]
        if decision in ("reuse", "adapt") and not cats:
            f.block(loc[i], f"{i}: {decision} needs the selected catalogue asset (CAT-nnn version)")
        for cat in cats:
            check_selected(cat, selected, catalogue, loc[i], f, reach)
        if not it.col_refs("requirements") and "infrastructure" not in it.text.lower():
            f.block(loc[i], f"{i} supports no requirement (say 'infrastructure' if that is its purpose)")
        if decision in ("build", "import", "redesign", "defer") and not it.col("rationale"):
            f.block(loc[i], f"{i}: a {decision} decision needs a rationale")
        if it.has_col("reuse scope") and it.col("reuse scope").lower() not in ("project", "catalogue", "-", ""):
            f.warn(loc[i], f"{i}: reuse scope should be project or catalogue")

    for kind in OPEN_ITEMS:
        for i, it in kinds[kind].items():
            status = it.col("status").lower()
            blocks = it.col("blocks").lower()
            if status and status not in STATUSES:
                f.warn(loc[i], f"{i}: status should be one of {', '.join(sorted(STATUSES))}")
            if blocks and blocks not in BLOCKS:
                f.warn(loc[i], f"{i}: blocks should be one of {', '.join(sorted(BLOCKS))}")
            if status in ("", "open") and not it.col("owner"):
                f.warn(loc[i], f"{i} has no owner")
            if status in ("", "open") and blocks == "spec":
                f.block(loc[i], f"{i} is open and blocks the spec (resolve it, or accept it explicitly)")

    if deployment and (spec / "10-architecture-and-deployment.md").exists():
        text = (spec / "10-architecture-and-deployment.md").read_text(encoding="utf-8")
        stated = re.search(r"(?im)^deployment category:\s*([a-z-]+)", text)
        if stated and stated.group(1).lower() != deployment:
            f.warn("10-architecture-and-deployment.md", f"deployment category {stated.group(1)} differs from the Application Definition ({deployment})")

    check_process(spec, by_id, f)
    check_source_map(idea, spec, by_id, f)
    context = {"live": live, "kinds": kinds, "acs": acs, "stories_for": stories_for, "epics_for": epics_for, "tests_for": tests_for, "caps_for": caps_for}
    return by_id, context


def scope_reach(idea: Path) -> tuple[set[str], str] | None:
    """The catalogue scopes an idea in the factory may use, and its decisions (which may record an exception)."""
    if not (idea / "state.json").exists():
        return None
    reg = scopes.registry()
    decisions = idea / "decisions.md"
    seen = scopes.visible(scopes.idea_scope(lib.read_json(idea / "state.json")), reg)
    return seen, decisions.read_text(encoding="utf-8") if decisions.exists() else ""


def check_selected(cat: str, cell: str, catalogue: dict | None, where: str, f: Findings,
                   reach: tuple[set[str], str] | None = None) -> None:
    if catalogue is None or cat not in catalogue:
        return  # reported once per mention above
    entry = catalogue[cat]
    if entry["type"] in ("system", "process", "policy"):
        f.block(where, f"{cat} is a reference card ({entry['type']}): it constrains the design, it is not built from")
        return
    scope = scopes.entry_scope(entry)
    if reach is not None and scope not in reach[0] and cat not in reach[1]:
        f.block(where, f"{cat} belongs to {scope}, outside this idea's scope (record the reason in decisions.md to use it)")
    if entry["status"] in ("deprecated", "archived", "rejected"):
        f.block(where, f"{cat} is {entry['status']} in the catalogue")
    elif entry["status"] != "approved":
        f.block(where, f"{cat} is {entry['status']}, not approved for reuse (policy POL-10)")
    version = re.search(rf"{cat}\s+v?(\d+\.\d+(?:\.\d+)?)", cell)
    if version and version.group(1) != entry["version"]:
        f.warn(where, f"{cat} version {version.group(1)} differs from the catalogue ({entry['version']})")
    elif not version:
        f.warn(where, f"{cat} names no version (catalogue has {entry['version']})")


def traceability(by_id: dict[str, Item], ctx: dict) -> str:
    kinds, acs = ctx["kinds"], ctx["acs"]
    rows = [
        "# Traceability (generated by check_spec.py; do not edit)", "",
        "| FR | Priority | Journey / objective | Stories | ACs | Rules | Screens | Data | Permissions | Integrations | Capabilities | Epics | Tests |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]

    def cell(xs) -> str:
        return ", ".join(sorted(set(xs))) or "-"

    def users(kind: str, fr: str) -> list[str]:
        return [i for i, it in kinds[kind].items() if fr in it.refs()]

    for fr, it in sorted(kinds["FR"].items()):
        stories = ctx["stories_for"].get(fr, [])
        fr_acs = [a for a in acs if a.split("-AC")[0] in stories]
        epics = set(ctx["epics_for"].get(fr, [])) | {e for s in stories for e in by_id[s].refs("EPIC")}
        tests = {t for x in [fr, *stories, *fr_acs] for t in ctx["tests_for"].get(x, [])}
        rows.append(
            f"| {fr} | {it.col('priority') or '?'} | {cell(it.refs('JRN') + it.refs('OBJ'))} | {cell(stories)} | {cell(fr_acs)} | "
            f"{cell(users('RULE', fr))} | {cell(users('SCR', fr))} | {cell(users('DATA', fr))} | {cell(users('PERM', fr))} | "
            f"{cell(users('INT', fr))} | {cell(ctx['caps_for'].get(fr, []))} | {cell(epics)} | {cell(tests)} |"
        )
    counts = defaultdict(int)
    for it in ctx["live"].values():
        counts[it.kind] += 1
    counts["AC"] = len(acs)
    rows += ["", "Counts: " + ", ".join(f"{k} {counts[k]}" for k in PREFIXES if counts.get(k)), ""]
    return "\n".join(rows)


def impact(idea: Path, spec: Path, targets: list[str]) -> tuple[int, str]:
    items, _ = parse(spec)
    by_id = {it.id: it for it in items}
    unknown = [t for t in targets if t not in by_id]
    if unknown:
        return 1, f"not defined in the spec: {', '.join(unknown)}"
    related: dict[str, set[str]] = defaultdict(set)
    for it in items:
        for ref in it.refs():
            related[it.id].add(ref)
            related[ref].add(it.id)
    found: set[str] = set()
    for t in targets:
        found |= related[t]
    found |= {i for i in by_id if "-AC" in i and i.split("-AC")[0] in found | set(targets)}
    found -= set(targets)
    found = {i for i in found if i in by_id}
    lines = [f"Impact of {', '.join(targets)}:"]
    for kind in PREFIXES:
        ids = sorted(i for i in found if by_id[i].kind == kind)
        if ids:
            lines.append(f"  {kind}: {', '.join(ids)}")
    lines.append(f"  Documents to review: {', '.join(sorted({by_id[i].file for i in found | set(targets)}))}")
    if not found:
        lines.append("  nothing else refers to it")
    return 0, "\n".join(lines)


def run(arg: str, assessment_only: bool = False) -> tuple[Findings, str | None, Path]:
    idea, spec = locate(arg)
    f = Findings()
    if assessment_only:
        check_gate_one(idea, f)
        f.done()
        return f, None, spec
    in_factory = (idea / "state.json").exists()
    data = check_definition(idea, f) if in_factory or (idea / "application-definition.md").exists() else None
    if not spec.is_dir():
        f.block(str(spec), "no spec folder")
        f.done()
        return f, None, spec
    tier = data["maturity_tier"]["value"] if data else 2
    deployment = data["deployment"]["value"] if data else None
    by_id, ctx = check_pack(idea, spec, f, tier, deployment)
    if in_factory:
        check_challenge(idea, 2, f)
    f.done()
    return f, traceability(by_id, ctx), spec


def main(argv: list[str]) -> int:
    rest = list(argv[1:])
    targets: list[str] = []
    if "--impact" in rest:
        at = rest.index("--impact")
        if at + 1 >= len(rest):
            print(__doc__)
            return 2
        targets = [t.strip() for t in rest[at + 1].split(",") if t.strip()]
        del rest[at : at + 2]
    assessment_only = "--assessment" in rest
    rest = [a for a in rest if a != "--assessment"]
    if len(rest) != 1:
        print(__doc__)
        return 2
    if targets:
        idea, spec = locate(rest[0])
        code, text = impact(idea, spec, targets)
        print(text)
        return code
    f, matrix, spec = run(rest[0], assessment_only)
    if matrix is not None:
        (spec / "traceability.md").write_text(matrix, encoding="utf-8", newline="\n")
    for b in f.blockers:
        print("BLOCKER " + b)
    for w in f.warnings:
        print("warning " + w)
    what = "Gate 1: brief, assessment and overview" if assessment_only else "spec"
    verdict = "FAILED" if f.blockers else "OK"
    tail = "" if assessment_only or matrix is None else "; wrote spec/traceability.md"
    print(f"check_spec: {verdict} ({what}: {len(f.blockers)} blocker(s), {len(f.warnings)} warning(s)){tail}")
    return 1 if f.blockers else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
