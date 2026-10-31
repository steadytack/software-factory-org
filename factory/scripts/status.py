#!/usr/bin/env python3
"""Show every idea, its stage and what happens next.

Usage: python factory/scripts/status.py [--write]

Reads ideas/*/state.json. An idea whose state is missing or invalid is listed with the problem.
Ideas captured but not yet developed (ideas/pipeline.json, ideas/inbox.md) have no folder: one summary line
counts them with the rest of the pipeline. A second line gives the cycle times so far: the median days from
capture to Gate 1 and from Gate 1 to Gate 3, and how many spikes ended within their time box.
With --write, refreshes the table in ideas/README.md between the status markers.
"""

from __future__ import annotations

import datetime as dt
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import pipeline  # noqa: E402

START, END = "<!-- status:start -->", "<!-- status:end -->"
STAGES = ["develop", "spec", "build", "publish", "done"]
GATE_MARK = {"not-reached": "-", "awaiting-approval": "W", "approved": "A", "changes-requested": "C", "get-ready": "R", "stopped": "S"}


def collect(root: Path | None = None) -> list[dict]:
    ideas = (root or lib.ROOT) / "ideas"
    rows = []
    for folder in sorted(p for p in ideas.iterdir() if p.is_dir()) if ideas.is_dir() else []:
        path = folder / "state.json"
        if not path.exists():
            rows.append({"slug": folder.name, "stage": "?", "status": "no state.json"})
            continue
        try:
            state = lib.read_json(path)
        except ValueError as exc:
            rows.append({"slug": folder.name, "stage": "?", "status": f"state.json is not JSON ({exc})"})
            continue
        problems = lib.validate("state", state, root)
        if problems:
            state = {**state, "status": f"invalid state.json: {problems[0]}"}
        state.setdefault("slug", folder.name)
        gates = state.get("gates", {})
        state["gates_line"] = " ".join(f"{n}:{GATE_MARK.get(gates.get(str(n), {}).get('status'), '-')}" for n in range(1, 5))
        rows.append(state)
    return rows


def days(start: str | None, end: str | None) -> int | None:
    try:
        return (dt.date.fromisoformat(end) - dt.date.fromisoformat(start)).days if start and end else None
    except ValueError:
        return None


def cycle_times(rows: list[dict], root: Path | None = None) -> list[dict]:
    """Per idea, from dates already recorded: capture (ideas/pipeline.json), Gate 1 and Gate 3 (state.json)."""
    try:
        added = {e["slug"]: e.get("added") for e in pipeline.load(root)["entries"] if e.get("slug")}
    except (ValueError, KeyError):
        added = {}
    timebox = {r["slug"]: (r["a"] or {}).get("decision", {}).get("timebox") for r in pipeline.assessed_ideas(root)}
    out = []
    for r in rows:
        gates = r.get("gates") or {}
        g1 = gates.get("1", {}).get("date")
        g3 = gates.get("3", {}).get("date") if gates.get("3", {}).get("status") == "approved" else None
        g3 = g3 or (r.get("light") or {}).get("date")
        out.append({"slug": r["slug"], "light": r.get("route") == "light", "timebox_weeks": timebox.get(r["slug"]),
                    "to_gate1": days(added.get(r["slug"]), g1), "gate1_to_gate3": days(g1, g3)})
    return out


def cycle_line(times: list[dict]) -> str | None:
    """One line of medians, or None until an idea has reached Gate 1."""
    to_g1 = [t["to_gate1"] for t in times if t["to_gate1"] is not None]
    to_g3 = [t["gate1_to_gate3"] for t in times if t["gate1_to_gate3"] is not None]
    if not to_g1 and not to_g3:
        return None
    parts = []
    if to_g1:
        parts.append(f"capture to Gate 1, median {statistics.median(to_g1):g} days over {len(to_g1)} idea(s)")
    if to_g3:
        parts.append(f"Gate 1 to Gate 3, median {statistics.median(to_g3):g} days over {len(to_g3)}")
    spikes = [t for t in times if t["light"] and t["gate1_to_gate3"] is not None and t["timebox_weeks"]]
    if spikes:
        within = sum(t["gate1_to_gate3"] <= t["timebox_weeks"] * 7 for t in spikes)
        parts.append(f"{within} of {len(spikes)} spike(s) within their time box")
    return "Cycle times: " + "; ".join(parts)


def table(rows: list[dict]) -> str:
    lines = [
        "| Idea | Kind | Stage | Status | Tier | Template | Gates | Factory | Updated | Next |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]

    def order(r: dict) -> tuple[int, str]:
        return (STAGES.index(r["stage"]) if r.get("stage") in STAGES else 99, r["slug"])

    for r in sorted(rows, key=order):
        status = r.get("status", "?")
        if r.get("current", {}).get("milestone"):
            status += f" ({r['current']['milestone']})"
        lines.append(
            f"| {r['slug']} | {r.get('kind', '')} | {r.get('stage', '?')}{' (light)' if r.get('route') == 'light' else ''} | {status} | {r.get('tier') or ''} | "
            f"{r.get('template') or ''} | {r.get('gates_line', '')} | {r.get('factory_version', '')} | {r.get('updated', '')} | {r.get('next', '')} |"
        )
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    rows = collect()
    out = table(rows) if rows else "(no ideas yet)"
    print(out)
    if rows:
        print("Gates: - not reached, W waiting for approval, A approved (at gate 1: Go), C changes requested, R Get Ready, S stopped")
    line = pipeline.summary()
    if line:
        print(line)
    cycle = cycle_line(cycle_times(rows))
    if cycle:
        print(cycle)
    if "--write" in argv:
        readme = lib.ROOT / "ideas" / "README.md"
        text = readme.read_text(encoding="utf-8") if readme.exists() else ""
        if START not in text or END not in text:
            print("ideas/README.md has no status markers", file=sys.stderr)
            return 1
        before, rest = text.split(START, 1)
        _, after = rest.split(END, 1)
        readme.write_text(f"{before}{START}\n{out}\n{END}{after}", encoding="utf-8", newline="\n")
        print("updated ideas/README.md")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
