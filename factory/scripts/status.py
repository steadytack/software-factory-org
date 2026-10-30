#!/usr/bin/env python3
"""Show every idea, its stage and what happens next.

Usage: python factory/scripts/status.py [--write]

Reads ideas/*/state.json. An idea whose state is missing or invalid is listed with the problem.
Ideas captured but not yet developed (ideas/pipeline.json, ideas/inbox.md) have no folder: one summary line
counts them with the rest of the pipeline.
With --write, refreshes the table in ideas/README.md between the status markers.
"""

from __future__ import annotations

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
            f"| {r['slug']} | {r.get('kind', '')} | {r.get('stage', '?')} | {status} | {r.get('tier') or ''} | "
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
