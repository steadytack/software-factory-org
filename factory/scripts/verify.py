#!/usr/bin/env python3
"""Run a template's verification in clean containers.

Usage:
  python factory/scripts/verify.py --template <name> [--path DIR] [--part NAME]
  python factory/scripts/verify.py --parts path/to/verify.json [--part NAME or component]   an app's own checks

The commands come from the 'verify' list of the template in factory/templates.json. Each part runs
in its own container from a copy of the project (so nothing is written into it), with sidecar
services (a database, say) on a private network, reachable by their name. Needs Docker.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COPY_EXCLUDES = ["node_modules", ".venv", "dist", ".astro", "__pycache__", ".git", ".pytest_cache", ".ruff_cache", ".env", "backups"]  # never copy secrets into a check
TAIL_LINES = int(os.environ.get("VERIFY_TAIL", "14"))
TEST_SUMMARY = re.compile(r"\b\d+ (passed|failed|errors?)\b")  # pytest's, vitest's and Playwright's summary lines
ANSI = re.compile(r"\x1b\[[0-9;]*m")


class VerifyError(Exception):
    pass


@dataclass
class PartResult:
    component: str
    part: str
    ok: bool
    output: str


def docker(*args: str, check: bool = False, input_text: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",  # tool output is UTF-8 whatever the Windows code page says
        input=input_text,
        check=check,
        env={**os.environ, "MSYS_NO_PATHCONV": "1"},
    )


def require_docker() -> None:
    if shutil.which("docker") is None:
        raise VerifyError("verify needs Docker (it runs everything in clean containers)")


def template_parts(template: str) -> list[dict]:
    reg = json.loads((ROOT / "factory" / "templates.json").read_text(encoding="utf-8"))
    for t in reg["templates"]:
        if t["name"] == template and t.get("status") == "ready":
            return t["verify"]
    raise VerifyError(f"'{template}' is not a ready template in templates.json")


def container_script(part: dict) -> str:
    """The shell script a part runs: copy the project, set up, then each step in order."""
    excludes = " ".join(f"--exclude={e}" for e in COPY_EXCLUDES)
    lines = [
        "set -e",
        "mkdir -p /tmp/w",
        f"tar -C /work {excludes} -cf - . | tar -C /tmp/w -xf -",
        f"cd /tmp/w/{part['cwd']}",
    ]
    for command in part.get("setup", []):
        lines.append(f"{command} 2>&1 | tail -2")
    for command in part["steps"]:
        lines.append(f"echo '== {command}'")
        lines.append(command)
    return "\n".join(lines)


def start_services(part: dict, network: str) -> list[str]:
    started: list[str] = []
    for service in part.get("services", []):
        name = f"{network}-{service['name']}"
        args = ["run", "-d", "--rm", "--name", name, "--network", network, "--network-alias", service["name"]]
        for key, value in service.get("env", {}).items():
            args += ["-e", f"{key}={value}"]
        if service.get("entrypoint"):
            args += ["--entrypoint", service["entrypoint"]]
        done = docker(*args, service["image"], *service.get("command", []))
        if done.returncode != 0:
            raise VerifyError(f"could not start service {service['name']}: {done.stderr.strip()}")
        started.append(name)
        for _ in range(60):
            ready = docker("exec", name, "sh", "-c", service["ready"])
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise VerifyError(f"service {service['name']} did not become ready in 60 seconds")
        time.sleep(1)  # a database reports ready slightly before it accepts every connection
    return started


def run_part(component: str, part: dict, path: Path) -> PartResult:
    """Run one verify part against the project at `path`."""
    require_docker()
    network = f"verify-{uuid.uuid4().hex[:8]}"
    docker("network", "create", network, check=True)
    services: list[str] = []
    try:
        services = start_services(part, network)
        args = ["run", "--rm", "--network", network, "-v", f"{path}:/work", "-w", "/work"]
        if part.get("entrypoint"):  # an image whose entrypoint is a tool (gitleaks, say) needs a shell to run the script
            args += ["--entrypoint", part["entrypoint"]]
        for key, value in part.get("env", {}).items():
            args += ["-e", f"{key}={value}"]
        shell = [] if part.get("entrypoint") else ["sh"]  # an overridden entrypoint is already the shell
        done = docker(*args, part["image"], *shell, "-c", container_script(part))
        output = (done.stdout + done.stderr).strip()
        return PartResult(component, part["name"], done.returncode == 0, output)
    except VerifyError as exc:
        return PartResult(component, part["name"], False, str(exc))
    finally:
        for name in services:
            docker("rm", "-f", name)
        docker("network", "rm", network)


def verify_template(component: str, template: str, path: Path, only: str | None = None) -> list[PartResult]:
    parts = [p for p in template_parts(template) if only in (None, p["name"])]
    if not parts:
        raise VerifyError(f"{template} has no verify part named '{only}'")
    return [run_part(component, part, path) for part in parts]


def verify_parts_file(path: Path, only: str | None = None) -> list[PartResult]:
    """An app's own verify parts (verify.json beside it): {"parts": [{"component", "name", ...part}]}.
    Each part's cwd is relative to the file's folder; the format is the registry's verify part."""
    data = json.loads(path.read_text(encoding="utf-8"))
    parts = [p for p in data["parts"] if only in (None, p["name"], p.get("component"))]
    if not parts:
        raise VerifyError(f"{path.name} has no part or component named '{only}'")
    return [run_part(p.get("component", p["name"]), p, path.parent) for p in parts]


def verify_merged(component: str, path: Path, package: str, namespaces: list[str]) -> list[PartResult]:
    """A Python component built by grafting: lint, imports, then the base's tests and each donor's own."""
    require_docker()
    imports = " ".join(f"import {package}.{ns};" for ns in namespaces)
    groups = [("base", "python -m pytest -q " + " ".join(f"--ignore=tests/{ns}" for ns in namespaces))]
    groups += [(ns, f"python -m pytest -q tests/{ns}") for ns in namespaces]
    part = {
        "name": "merged",
        "image": "python:3.12-slim",
        "cwd": ".",
        "setup": ["pip install -q -e '.[dev]'"],
        "steps": ["ruff check .", "ruff format --check .", f"python -c \"{imports} print('imports ok')\""]
        + [command for _label, command in groups],
    }
    result = run_part(component, part, path)
    return [PartResult(component, f"merged ({', '.join(['base', *namespaces])})", result.ok, result.output)]


def run_summaries(output: str) -> list[str]:
    """Each test run's pass/fail line, so its count shows however much output (a build, say) comes after it."""
    return [ln.strip() for ln in ANSI.sub("", output).splitlines() if TEST_SUMMARY.search(ln)]


def summarise(results: list[PartResult]) -> str:
    lines = []
    for r in results:
        tests = "".join(f"\n    tests: {s}" for s in run_summaries(r.output))
        tail = "\n".join(f"    {ln}" for ln in r.output.splitlines()[-TAIL_LINES:])
        lines.append(f"{'OK    ' if r.ok else 'FAILED'} {r.component}: {r.part}{tests}\n{tail}")
    ok = all(r.ok for r in results)
    lines.append(f"verify: {'OK' if ok else 'FAILED'} ({sum(r.ok for r in results)} of {len(results)} parts)")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if "-h" in argv[1:] or "--help" in argv[1:]:
        print(__doc__)
        return 0
    rest = list(argv[1:])

    def option(name: str) -> str | None:
        if name in rest:
            at = rest.index(name)
            value = rest[at + 1] if at + 1 < len(rest) else None
            del rest[at : at + 2]
            return value
        return None

    template, path, only, parts_file = option("--template"), option("--path"), option("--part"), option("--parts")
    if (template is None) == (parts_file is None) or rest:
        print(__doc__)
        return 2
    try:
        if parts_file:
            results = verify_parts_file(Path(parts_file).resolve(), only)
        else:
            target = Path(path).resolve() if path else (ROOT / "templates" / template)
            results = verify_template(template, template, target, only)
    except VerifyError as exc:
        print(f"verify: {exc}", file=sys.stderr)
        return 1
    print(summarise(results))
    return 0 if all(r.ok for r in results) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
