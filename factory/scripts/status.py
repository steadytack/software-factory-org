#!/usr/bin/env python3
"""Show every idea, its stage and what happens next.

Usage: python factory/scripts/status.py [--write] [--ci]
       python factory/scripts/status.py --stack <slug>

Reads ideas/*/state.json. An idea whose state is missing or invalid is listed with the problem.
Ideas captured but not yet developed (ideas/pipeline.json, ideas/inbox.md) have no folder: one summary line
counts them with the rest of the pipeline. A second line gives the cycle times so far: the median days from
capture to Gate 1 and from Gate 1 to Gate 3, and how many spikes ended within their time box.
With --write, refreshes the table in ideas/README.md between the status markers.
With --ci, adds one line per published app (state.json `app.repo`): the latest run of each of its GitHub
workflows, read with `gh`, a red one flagged.
With --stack <slug>, says whether the idea's running Docker stack is the current build: exits 1 if a built
service's image is older than a file in its build context (rebuild before looking).
"""

from __future__ import annotations

import datetime as dt
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import pipeline  # noqa: E402

START, END = "<!-- status:start -->", "<!-- status:end -->"
STAGES = ["develop", "roadmap", "spec", "build", "publish", "done"]
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
            f"| {r['slug']} | {r.get('kind', '')} | {r.get('stage', '?')}{' (light)' if r.get('route') == 'light' else ''}{f" ({r['epic']} of {r['parent']})" if r.get('parent') else ''} | {status} | {r.get('tier') or ''} | "
            f"{r.get('template') or ''} | {r.get('gates_line', '')} | {r.get('factory_version', '')} | {r.get('updated', '')} | {r.get('next', '')} |"
        )
    return "\n".join(lines)


def ci_line(slug: str, repo: str, runner=subprocess.run) -> str:
    """The latest run of each workflow in the app repository, as one line, so a red CI is seen after a push.
    Each workflow counts: GitHub's own (Dependency Graph) can be green while the app's CI is red."""
    try:
        done = runner(["gh", "run", "list", "-R", repo, "-L", "30", "--json", "conclusion,status,headSha,createdAt,workflowName"],
                      capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"{slug}: CI not read ({exc.__class__.__name__}: gh not available or not answering)"
    message = (done.stderr or done.stdout or "").strip()
    if done.returncode != 0:
        return f"{slug}: CI not read (gh: {message.splitlines()[0] if message else 'failed'})"
    try:
        runs = json.loads(done.stdout or "[]")
    except ValueError:
        return f"{slug}: CI not read (gh gave no JSON)"
    if not runs:
        return f"{slug}: no CI runs on {repo}"
    latest: dict[str, dict] = {}
    for r in sorted(runs, key=lambda r: r.get("createdAt", ""), reverse=True):
        latest.setdefault(r.get("workflowName", "?"), r)
    parts, red = [], False
    for name, r in sorted(latest.items()):
        result = r.get("conclusion") or r.get("status") or "unknown"
        red |= result != "success"
        parts.append(f"{name} {result} on {r.get('headSha', '')[:7]} ({r.get('createdAt', '')[:10]})")
    return f"{slug}: CI {repo}: {'; '.join(parts)}" + ("  <-- not green" if red else "")


def ci_lines(rows: list[dict], runner=subprocess.run) -> list[str]:
    return [ci_line(r["slug"], r["app"]["repo"], runner) for r in rows if isinstance(r.get("app"), dict) and r["app"].get("repo")]


def _done(runner, args: list[str], cwd: Path):
    return runner(args, capture_output=True, text=True, timeout=60, cwd=str(cwd))


def _when(text: str) -> dt.datetime | None:
    """A Docker or git time ("2026-11-04T23:06:30.123456789Z", "2026-11-04 23:06:30 +0000 GMT") as UTC."""
    m = re.match(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})", text or "")
    return dt.datetime.fromisoformat(f"{m.group(1)}T{m.group(2)}+00:00") if m else None


def _json_objects(text: str) -> list[dict]:
    """`docker compose ps --format json` prints one object a line (newer) or one array (older)."""
    text = (text or "").strip()
    if text.startswith("["):
        return json.loads(text)
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def newest_change(context: Path, runner=subprocess.run) -> tuple[dt.datetime, str] | None:
    """The newest modification time among the files git would see in a build context (tracked, or untracked and
    not ignored), so node_modules and build output do not count."""
    done = _done(runner, ["git", "ls-files", "-co", "--exclude-standard"], context)
    if done.returncode != 0:
        return None
    newest: tuple[dt.datetime, str] | None = None
    for name in (done.stdout or "").splitlines():
        path = context / name
        if path.is_file():
            when = dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).replace(microsecond=0)
            if newest is None or when > newest[0]:
                newest = (when, name)
    return newest


def stack_line(slug: str, app: Path, runner=subprocess.run) -> str:
    """Whether the running stack is the current build, so a change is never looked at on the old one. For each
    running service built from source, the image's build time against the newest file in its build context:
    a file changed after the build means the stack shows old code."""
    if not (app / "docker-compose.yml").exists() and not (app / "compose.yaml").exists():
        return f"{slug}: no compose file in {app}"
    try:
        config = _done(runner, ["docker", "compose", "config", "--format", "json"], app)
        ps = _done(runner, ["docker", "compose", "ps", "--format", "json"], app)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"{slug}: stack not read ({exc.__class__.__name__}: docker not available or not answering)"
    for done in (config, ps):
        if done.returncode != 0:
            message = (done.stderr or done.stdout or "").strip()
            return f"{slug}: stack not read (docker: {message.splitlines()[0] if message else 'failed'})"
    try:
        services = json.loads(config.stdout or "{}").get("services", {})
        running = {c.get("Service"): c for c in _json_objects(ps.stdout) if c.get("State", "running") == "running"}
    except ValueError:
        return f"{slug}: stack not read (docker gave no JSON)"
    if not running:
        return f"{slug}: stack not running"
    stale, current = [], []
    for name, container in sorted(running.items()):
        context = ((services.get(name) or {}).get("build") or {}).get("context")
        if not context:
            continue  # a pulled image (a database): nothing here to rebuild
        image = container.get("Image", "")
        if image.startswith("sha256:"):
            # Docker names a container's image by ID once its tag has moved to a newer build: the container is older
            stale.append(f"{name} runs an image its tag no longer points to (rebuilt but not restarted)")
            continue
        inspect = _done(runner, ["docker", "image", "inspect", "-f", "{{.Created}}", image], app)
        built = _when(inspect.stdout.strip()) if inspect.returncode == 0 else None
        changed = newest_change(Path(context), runner)
        if built is None or changed is None:
            stale.append(f"{name} (build time or sources not read)")
        elif changed[0] > built:
            stale.append(f"{name} built {built:%Y-%m-%d %H:%M}, {changed[1]} changed {changed[0]:%Y-%m-%d %H:%M}")
        else:
            current.append(name)
    if stale:
        return f"{slug}: stack is an old build: {'; '.join(stale)}  <-- rebuild (docker compose up -d --build) before looking"
    return f"{slug}: stack current ({', '.join(current) or 'no built services'})"


def main(argv: list[str]) -> int:
    if "-h" in argv[1:] or "--help" in argv[1:]:
        print(__doc__)
        return 0
    if "--stack" in argv:
        i = argv.index("--stack")
        if i + 1 >= len(argv):
            print("usage: status.py --stack <slug>", file=sys.stderr)
            return 2
        slug = argv[i + 1]
        line = stack_line(slug, lib.ROOT / "ideas" / slug / "app")
        print(line)
        return 1 if "old build" in line else 0
    rows = collect()
    out = table(rows) if rows else "(no ideas yet)"
    print(out)
    if "--ci" in argv:
        lines = ci_lines(rows)
        print("\n".join(lines) if lines else "CI: no idea has a published repository")
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
