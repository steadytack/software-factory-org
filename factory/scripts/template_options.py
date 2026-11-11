#!/usr/bin/env python3
"""Optional template features: what the owner chooses at Gate 1, applied when the app is scaffolded.

A template declares its options in factory/templates.json (`options`):

  {"id": "share", "kind": "feature", "label": "...", "default": true, "files": ["frontend/src/..."]}
  {"id": "help", "kind": "group", "label": "...", "on_if_any": ["help.guides", "help.feedback"], "files": [...]}
  {"id": "feedback.problem", "kind": "route", "label": "...", "default": "email:", "env": "FEEDBACK_PROBLEM",
   "needs": "help.feedback"}

A feature is on or off; a group is on while any feature it names is on; a route is a value written to the
app's .env.example (for feedback: `email:<address>`, `email:` for the admin's address, `store` or `off`).

In the template's source, an optional part sits between marker lines in that file's comment syntax:

  // feature:share:start          {/* feature:share:start */}     # feature:x:start     <!-- feature:x:start -->
  ...kept when share is on...
  // feature:share:else           (optional)
  // ...kept, uncommented, when share is off...
  // feature:share:end

Scaffold keeps or drops each block, removes every marker line, and deletes the `files` of options that
are off, so the new app carries no unused code. The definition records the choices in
`template.options`, keyed by option id; a missing id takes the template's default.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

MARKER = re.compile(r"feature:([A-Za-z0-9_.-]+):(start|else|end)\b")
UNCOMMENT = [
    re.compile(r"^(\s*)// ?(.*)$"),
    re.compile(r"^(\s*)# ?(.*)$"),
    re.compile(r"^(\s*)\{/\*\s?(.*?)\s?\*/\}\s*$"),
    re.compile(r"^(\s*)<!--\s?(.*?)\s?-->\s*$"),
    re.compile(r"^(\s*)/\*\s?(.*?)\s?\*/\s*$"),
]
KINDS = ("feature", "group", "route")
ROUTE_VALUE = re.compile(r"^(email:([^\s@]+@[^\s@]+\.[^\s@]+)?|store|off)$")
TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".md", ".astro", ".html", ".css", ".json", ".yml",
    ".yaml", ".toml", ".txt", ".example", ".cfg", ".ini",
}
SKIP_DIRS = {"node_modules", "dist", ".venv", "__pycache__", ".git", "test-results", "playwright-report", ".astro"}


class OptionError(ValueError):
    pass


def declared(entry: dict) -> dict[str, dict]:
    return {o["id"]: o for o in entry.get("options", [])}


def resolve(entry: dict, chosen: dict | None) -> dict[str, object]:
    """Every option's value: the owner's choice, else the default; groups follow their features."""
    chosen = dict(chosen or {})
    options = declared(entry)
    unknown = sorted(set(chosen) - set(options))
    if unknown:
        raise OptionError(f"unknown template option(s) {unknown}; this template has {sorted(options)}")
    values: dict[str, object] = {}
    for oid, opt in options.items():
        if opt["kind"] == "feature":
            value = chosen.get(oid, opt.get("default", True))
            if not isinstance(value, bool):
                raise OptionError(f"option {oid} must be true or false, not {value!r}")
            values[oid] = value
    for oid, opt in options.items():
        if opt["kind"] == "group":
            values[oid] = any(values.get(f, False) for f in opt["on_if_any"])
    for oid, opt in options.items():
        if opt["kind"] == "route":
            value = chosen.get(oid, opt.get("default", "store"))
            if not isinstance(value, str) or not ROUTE_VALUE.match(value):
                raise OptionError(f"option {oid} must be email:<address>, email:, store or off, not {value!r}")
            values[oid] = value if values.get(opt.get("needs", ""), True) else None
    return values


def _uncomment(line: str) -> str:
    body = line.rstrip("\r\n")
    end = line[len(body):]
    for pattern in UNCOMMENT:
        m = pattern.match(body)
        if m:
            return m.group(1) + m.group(2) + end
    return line


def strip_text(text: str, values: dict[str, object], where: str = "") -> str:
    """Keep or drop each marked block; marker lines themselves always go."""
    out: list[str] = []
    stack: list[tuple[str, str]] = []  # (option id, "start" | "else")
    for number, line in enumerate(text.splitlines(keepends=True), 1):
        m = MARKER.search(line)
        if m:
            oid, part = m.groups()
            if oid not in values:
                raise OptionError(f"{where}:{number}: marker for undeclared option '{oid}'")
            if part == "start":
                stack.append((oid, "start"))
            elif not stack or stack[-1][0] != oid or (part == "else" and stack[-1][1] == "else"):
                raise OptionError(f"{where}:{number}: feature:{oid}:{part} does not close an open feature:{oid}")
            elif part == "else":
                stack[-1] = (oid, "else")
            else:
                stack.pop()
            continue
        if all(bool(values[oid]) == (part == "start") for oid, part in stack):
            out.append(_uncomment(line) if stack and stack[-1][1] == "else" else line)
    if stack:
        raise OptionError(f"{where}: feature:{stack[-1][0]} is never closed")
    return "".join(out)


def _text_files(folder: Path):
    for path in sorted(folder.rglob("*")):
        if (
            path.is_file()
            and not (SKIP_DIRS & set(path.relative_to(folder).parts))
            and (path.suffix in TEXT_SUFFIXES or path.name.startswith(".env"))
        ):
            yield path


def marked_files(folder: Path) -> dict[Path, str]:
    found = {}
    for path in _text_files(folder):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if "feature:" in text and MARKER.search(text):
            found[path] = text
    return found


def check(template_dir: Path, entry: dict) -> list[str]:
    """Problems with a template's declared options and markers (for check_factory)."""
    problems: list[str] = []
    name = template_dir.name
    options = entry.get("options", [])
    ids = [o.get("id") for o in options]
    if len(set(ids)) != len(ids):
        problems.append(f"templates.json: {name}: duplicate option ids")
    for opt in options:
        oid, kind = opt.get("id"), opt.get("kind")
        if kind not in KINDS:
            problems.append(f"templates.json: {name}: option {oid}: kind must be one of {list(KINDS)}")
            continue
        if not opt.get("label"):
            problems.append(f"templates.json: {name}: option {oid}: needs a label (the question the owner sees)")
        for rel in opt.get("files", []):
            if not (template_dir / rel).exists():
                problems.append(f"templates.json: {name}: option {oid}: file {rel} does not exist")
        if kind == "group":
            problems += [f"templates.json: {name}: option {oid}: on_if_any names unknown feature {f}"
                         for f in opt.get("on_if_any", []) if f not in ids]
        if kind == "route" and not opt.get("env"):
            problems.append(f"templates.json: {name}: option {oid}: a route needs 'env'")
    if problems or not options:
        if not options:
            problems += [f"templates/{name}/{p.relative_to(template_dir).as_posix()}: feature markers, but "
                         f"templates.json declares no options" for p in marked_files(template_dir)]
        return problems
    try:
        values = resolve(entry, {})
    except OptionError as exc:
        return [f"templates.json: {name}: {exc}"]
    for path, text in marked_files(template_dir).items():
        try:
            strip_text(text, values, f"templates/{name}/{path.relative_to(template_dir).as_posix()}")
        except OptionError as exc:
            problems.append(str(exc))
    return problems


def set_env(path: Path, key: str, value: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    pattern = re.compile(rf"^#?\s*{re.escape(key)}=")
    for i, line in enumerate(lines):
        if pattern.match(line):
            lines[i] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def apply(app: Path, entry: dict, chosen: dict | None) -> dict[str, object]:
    """Apply the owner's choices to a freshly copied app. Returns the resolved values."""
    values = resolve(entry, chosen)
    if not values:
        return values
    for path, text in marked_files(app).items():
        path.write_text(strip_text(text, values, path.relative_to(app).as_posix()), encoding="utf-8", newline="")
    for oid, opt in declared(entry).items():
        if opt["kind"] in ("feature", "group") and not values[oid]:
            for rel in opt.get("files", []):
                target = app / rel
                if target.is_dir():
                    shutil.rmtree(target)
                elif target.exists():
                    target.unlink()
        if opt["kind"] == "route" and values[oid] is not None:
            set_env(app / ".env.example", opt["env"], str(values[oid]))
    return values
