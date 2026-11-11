#!/usr/bin/env python3
"""Show how many AI tokens each session, idea and helper used, from the Claude Code transcripts.

Usage: python factory/scripts/usage.py [--days N] [--idea SLUG] [--by session|idea] [--all] [--csv FILE]
                                       [--max-context TOKENS] [--max-reread SHARE] [--projects DIR]

Reads ~/.claude/projects/*/*.jsonl and their subagents/*.jsonl, keeping only lines whose cwd is inside
this repository (sessions in any other folder, including one whose name this one starts with, are not
counted). Each API call is counted once (by requestId). A session belongs to the idea its cwd is under
(ideas/<slug>), else the idea its lines name most, else "factory".

Columns: calls (API calls of the main chain), base (the context of the first call: system prompt, tools,
CLAUDE.md and skills, sent again on every call), peak (the largest context sent in one call), fresh (input
sent uncached plus cache writes), reread (cache reads: the conversation sent again), out (output),
reread% (reread over all input), helper% (helper tokens over all tokens).
A session is flagged "split" (DEF-18) when its peak passes --max-context (or its reread% passes --max-reread).
Tokens only, no money: prices and plans change.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIN_MENTIONS = 5  # lines naming ideas/<slug> before a session run from the root counts for that idea
MENTION = re.compile(r"ideas[/\\]+([a-z0-9][a-z0-9-]*)")


@dataclass
class Call:
    usage: dict
    model: str
    helper: bool


@dataclass
class Session:
    sid: str
    start: str = ""
    calls: dict = field(default_factory=dict)  # requestId -> Call, in the order first seen
    cwd_ideas: Counter = field(default_factory=Counter)
    mentions: Counter = field(default_factory=Counter)
    idea: str = "factory"

    def totals(self) -> dict:
        t = Counter()
        for c in self.calls.values():
            u = c.usage
            fresh = u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0)
            read = u.get("cache_read_input_tokens", 0)
            out = u.get("output_tokens", 0)
            key = "helper" if c.helper else "main"
            t[f"{key}_tokens"] += fresh + read + out
            t["fresh"] += fresh
            t["reread"] += read
            t["out"] += out
            if not c.helper:
                if not t["calls"]:
                    t["base"] = fresh + read
                t["calls"] += 1
                t["peak"] = max(t["peak"], fresh + read)
        return dict(t)

    def model(self) -> str:
        models = Counter(c.model for c in self.calls.values() if not c.helper and c.model)
        return models.most_common(1)[0][0] if models else "-"


def norm(path: str) -> str:
    return path.replace("\\", "/").rstrip("/").lower()


def idea_of(cwd: str, root: str) -> str | None:
    """'factory' for the repository itself, the slug under ideas/, None when outside the repository."""
    c = norm(cwd)
    if c != root and not c.startswith(root + "/"):
        return None
    parts = c[len(root):].strip("/").split("/")
    return parts[1] if len(parts) > 1 and parts[0] == "ideas" else "factory"


def read_sessions(projects: Path, root: Path, slugs: set[str]) -> dict[str, Session]:
    r = norm(str(root))
    sessions: dict[str, Session] = {}
    for f in sorted(projects.glob("*/*.jsonl")) + sorted(projects.glob("*/*/subagents/*.jsonl")):
        with f.open(encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                try:
                    d = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if not isinstance(d, dict) or not d.get("sessionId") or not d.get("cwd"):
                    continue
                where = idea_of(d["cwd"], r)
                if where is None:
                    continue
                s = sessions.setdefault(d["sessionId"], Session(d["sessionId"]))
                ts = d.get("timestamp", "")
                if ts and (not s.start or ts < s.start):
                    s.start = ts
                s.cwd_ideas[where] += 1
                for m in set(MENTION.findall(raw)) & slugs:
                    s.mentions[m] += 1
                msg = d.get("message")
                if d.get("type") == "assistant" and isinstance(msg, dict) and msg.get("usage"):
                    # One response is written as several lines; the last carries the final counts.
                    rid = d.get("requestId") or d.get("uuid")
                    s.calls[rid] = Call(msg["usage"], msg.get("model", ""), bool(d.get("isSidechain")))
    for s in sessions.values():
        named = [i for i, _ in s.cwd_ideas.most_common() if i != "factory"]
        if named:
            s.idea = named[0]
        elif s.mentions:
            (top, n), *rest = s.mentions.most_common(2) + [("", 0)]
            # A clear lead, else the session spread over several ideas.
            if n >= MIN_MENTIONS and n >= 2 * rest[0][1]:
                s.idea = top
            elif n >= MIN_MENTIONS:
                s.idea = "several"
    return {k: v for k, v in sessions.items() if v.calls}


def human(n: float) -> str:
    for unit, size in (("M", 1e6), ("k", 1e3)):
        if n >= size:
            return f"{n / size:.1f}{unit}"
    return str(int(n))


def pct(a: float, b: float) -> str:
    return f"{100 * a / b:.0f}%" if b else "-"


def session_rows(sessions: list[Session], max_context: int, max_reread: float | None = None) -> list[dict]:
    rows = []
    for s in sessions:
        t = s.totals()
        all_in = t.get("fresh", 0) + t.get("reread", 0)
        share = t.get("reread", 0) / all_in if all_in else 0
        total = t.get("main_tokens", 0) + t.get("helper_tokens", 0)
        flag = t.get("peak", 0) > max_context or (max_reread is not None and share > max_reread)
        rows.append({
            "date": s.start[:10], "session": s.sid[:8], "idea": s.idea, "model": s.model(),
            "calls": t.get("calls", 0), "base": t.get("base", 0), "peak": t.get("peak", 0), "fresh": t.get("fresh", 0),
            "reread": t.get("reread", 0), "out": t.get("out", 0), "reread_share": round(share, 3),
            "helper_share": round(t.get("helper_tokens", 0) / total, 3) if total else 0.0,
            "total": total, "flag": "split" if flag else "",
        })
    return rows


def idea_rows(rows: list[dict]) -> list[dict]:
    by: dict[str, dict] = {}
    for r in rows:
        i = by.setdefault(r["idea"], Counter())
        i["sessions"] += 1
        i["flagged"] += bool(r["flag"])
        for k in ("calls", "fresh", "reread", "out", "total"):
            i[k] += r[k]
        i["helper"] += r["helper_share"] * r["total"]
    out = []
    for idea, i in sorted(by.items(), key=lambda kv: -kv[1]["total"]):
        all_in = i["fresh"] + i["reread"]
        out.append({"idea": idea, "sessions": i["sessions"], "flagged": i["flagged"], "calls": i["calls"],
                    "fresh": i["fresh"], "reread": i["reread"], "out": i["out"], "total": i["total"],
                    "reread_share": round(i["reread"] / all_in, 3) if all_in else 0.0,
                    "helper_share": round(i["helper"] / i["total"], 3) if i["total"] else 0.0})
    return out


def table(rows: list[dict], cols: list[str]) -> str:
    def cell(r, c):
        v = r[c]
        if c in ("base", "peak", "fresh", "reread", "out", "total"):
            return human(v)
        if c.endswith("_share"):
            return pct(v, 1)
        return str(v)
    heads = [c.replace("_share", "%") for c in cols]
    grid = [heads] + [[cell(r, c) for c in cols] for r in rows]
    widths = [max(len(row[i]) for row in grid) for i in range(len(cols))]
    return "\n".join("  ".join(v.ljust(w) for v, w in zip(row, widths)).rstrip() for row in grid)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--days", type=int, help="only sessions that started in the last N days")
    p.add_argument("--idea", help="only this idea's sessions (or 'factory')")
    p.add_argument("--by", choices=["session", "idea"], default="session")
    p.add_argument("--all", action="store_true", help="print every row, not the latest 20")
    p.add_argument("--csv", type=Path, help="write every row to this file")
    p.add_argument("--max-context", type=int, default=150_000)
    p.add_argument("--max-reread", type=float, help="also flag above this reread share (off by default: most sessions re-read over 95%%)")
    p.add_argument("--projects", type=Path, default=Path.home() / ".claude" / "projects")
    p.add_argument("--root", type=Path, default=ROOT)
    a = p.parse_args(argv)

    ideas_dir = a.root / "ideas"
    slugs = {d.name for d in ideas_dir.iterdir() if d.is_dir()} if ideas_dir.is_dir() else set()
    sessions = sorted(read_sessions(a.projects, a.root, slugs).values(), key=lambda s: s.start)
    if a.days is not None:
        since = (datetime.now(timezone.utc) - timedelta(days=a.days)).isoformat()
        sessions = [s for s in sessions if s.start >= since]
    if a.idea:
        sessions = [s for s in sessions if s.idea == a.idea]
    if not sessions:
        print("No sessions found.")
        return 0

    rows = session_rows(sessions, a.max_context, a.max_reread)
    if a.by == "idea":
        out = idea_rows(rows)
        cols = ["idea", "sessions", "flagged", "calls", "fresh", "reread", "out", "reread_share", "helper_share"]
    else:
        out = rows
        cols = ["date", "session", "idea", "model", "calls", "base", "peak", "fresh", "reread", "out",
                "reread_share", "helper_share", "flag"]
    if a.csv:
        with a.csv.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=list(out[0]))
            w.writeheader()
            w.writerows(out)
    shown = out if a.all or a.by == "idea" else out[-20:]
    print(table(shown, cols))
    total = sum(r["total"] for r in rows)
    flagged = sum(bool(r["flag"]) for r in rows)
    reread = sum(r["reread"] for r in rows)
    all_in = reread + sum(r["fresh"] for r in rows)
    print(f"\n{len(rows)} sessions, {human(total)} tokens, {pct(reread, all_in)} re-read, "
          f"{flagged} flagged to split (DEF-18)" + (f"; {len(out) - len(shown)} older rows not shown" if len(shown) < len(out) else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
