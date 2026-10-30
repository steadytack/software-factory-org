#!/usr/bin/env python3
"""Factory instances: an organisation's own factory, made from this engine and kept up to date with it.

Usage:
  python factory/scripts/instance.py create <dir> --name NAME [--templates a,b]
  python factory/scripts/instance.py update <dir> [--diff]

An instance is a separate repo, not a git fork: a copy of the engine (the paths in factory/engine.json) plus
the organisation's own content, written once from factory/starter/organisation/. `create` copies the engine,
writes the starter set (NAME filled in), records the engine version and source in factory/instance.json and
runs `git init` (nothing is committed). --templates brings chosen templates with their catalogue entries,
each with a history note recording the contribution under MIT; otherwise the catalogue starts empty.

`update` re-copies the engine paths from this engine and never touches content (context, catalogue,
templates, ideas). It lists what would change (--diff prints the text differences), asks for the word
"update" to be typed, then copies and runs check_factory.py in the instance.
"""

from __future__ import annotations

import difflib
import fnmatch
import json
import subprocess
import sys
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_factory  # noqa: E402
import factory_lib as lib  # noqa: E402
import scopes  # noqa: E402

STARTER = Path("factory") / "starter" / "organisation"
INSTANCE = "factory/instance.json"
NAME_TOKEN = "__ORGANISATION__"
CONFIRM = "update"


def manifest(src: Path) -> dict:
    return lib.read_json(src / "factory" / "engine.json")


def _ignored(rel: str, man: dict, exclude: bool = True) -> bool:
    parts = rel.split("/")
    if any(fnmatch.fnmatch(p, pat) for p in parts for pat in man.get("ignore", [])):
        return True
    return exclude and any(rel == ex or rel.startswith(ex + "/") for ex in man.get("exclude", []))


def _walk(src: Path, rel: str, man: dict, exclude: bool = True) -> dict[str, Path]:
    path = src / rel
    if path.is_file():
        return {} if _ignored(rel, man, exclude) else {rel: path}
    if not path.is_dir():
        raise lib.FactoryError(f"engine path {rel} does not exist in {src}")
    found = {}
    for p in sorted(path.rglob("*")):
        r = p.relative_to(src).as_posix()
        if p.is_file() and not _ignored(r, man, exclude):
            found[r] = p
    return found


def engine_files(src: Path, man: dict) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for rel in man["paths"]:
        files.update(_walk(src, rel, man))
    return files


def template_files(src: Path, man: dict, templates: list[dict]) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for t in templates:
        for pattern in man["template_paths"]:
            files.update(_walk(src, pattern.format(**t), man, exclude=False))
    return files


def instance_registry(engine_reg: dict, templates: list[dict]) -> dict:
    """The engine's registry with only the instance's own templates in it."""
    return {**engine_reg, "templates": templates}


def render_tables(rel: str, text: str, reg: dict) -> str:
    """A file with a generated template table, its table rendered from the instance's registry."""
    kind = dict(check_factory.TABLES).get(rel)
    if kind is None or check_factory.START not in text or check_factory.END not in text:
        return text
    before, rest = text.split(check_factory.START, 1)
    _body, after = rest.split(check_factory.END, 1)
    return f"{before}{check_factory.START}\n{check_factory.render(kind, reg)}\n{check_factory.END}{after}"


def _registry_text(reg: dict) -> str:
    return json.dumps(reg, indent=2, ensure_ascii=False) + "\n"


def planned(src: Path, man: dict, reg: dict) -> dict[str, bytes]:
    """Every engine file as it should be in the instance: copied, with tables and the registry for the instance."""
    out: dict[str, bytes] = {}
    for rel, path in engine_files(src, man).items():
        data = path.read_bytes()
        if rel in dict(check_factory.TABLES):
            data = render_tables(rel, data.decode("utf-8"), reg).encode("utf-8")
        out[rel] = data
    out[man["registry"]] = _registry_text(reg).encode("utf-8")
    return out


def starter(src: Path, name: str) -> dict[str, bytes]:
    """The blank organisation content: context/ goes to factory/context/, gitignore to .gitignore."""
    base = src / STARTER
    out = {}
    for p in sorted(base.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(base).as_posix()
        rel = "factory/" + rel if rel.startswith("context/") else ".gitignore" if rel == "gitignore" else rel
        out[rel] = p.read_text(encoding="utf-8").replace(NAME_TOKEN, name).encode("utf-8")
    return out


def contributed(src: Path, templates: list[dict], org: str, who: str) -> list[dict]:
    """The catalogue entries of the chosen templates and their modules, each with a contribution note."""
    entries = [lib.read_json(p) for p in sorted((src / "catalogue" / "assets").glob("*.json"))]
    refs = {f"templates/{t['name']}" for t in templates}
    chosen = [e for e in entries if e["type"] == "template" and e["source"]["ref"] in refs]
    ids = {e["id"] for e in chosen}
    chosen += [e for e in entries if e["type"] == "module" and e.get("parent") in ids]
    ids = {e["id"] for e in chosen}
    note = f"contributed to {org} by {who} from the personal factory, under the MIT licence"
    out = []
    for e in chosen:
        e = dict(e)
        e["licence"] = f"MIT, {note} ({lib.today()})"
        e["maintainer"] = who
        e["related"] = [r for r in e.get("related", []) if r in ids]
        if not e["related"]:
            e.pop("related", None)
        if e.get("replaced_by") not in ids:
            e.pop("replaced_by", None)
        e["history"] = [*e["history"], {"date": lib.today(), "status": e["status"], "by": who, "note": note}]
        out.append(e)
    return out


def engine_source(src: Path) -> dict:
    def git(*args: str) -> str:
        try:
            done = subprocess.run(["git", *args], cwd=src, capture_output=True, text=True)
        except OSError:
            return ""
        return done.stdout.strip() if done.returncode == 0 else ""

    return {
        "version": lib.factory_version(src),
        "source": git("remote", "get-url", "origin") or src.name,
        "commit": git("rev-parse", "--short", "HEAD") or None,
        "uncommitted_changes": bool(git("status", "--porcelain", "--", *manifest(src)["paths"])),
    }


def _write(dest: Path, files: dict[str, bytes]) -> None:
    for rel, data in files.items():
        path = dest / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def check(dest: Path) -> int:
    """check_factory.py as the instance runs it (its own copy, its own root)."""
    done = subprocess.run([sys.executable, str(dest / "factory" / "scripts" / "check_factory.py")], cwd=dest,
                          capture_output=True, text=True)
    print(done.stdout.rstrip())
    return done.returncode


def create(src: Path, dest: Path, name: str, template_names: list[str], who: str | None = None) -> dict:
    if dest.exists() and any(dest.iterdir()):
        raise lib.FactoryError(f"{dest} exists and is not empty")
    ready = lib.ready_templates(src)
    unknown = [t for t in template_names if t not in ready]
    if unknown:
        raise lib.FactoryError(f"unknown template(s) {', '.join(unknown)}; ready: {', '.join(sorted(ready))}")
    if not name.strip() or "{{" in name or NAME_TOKEN in name:
        raise lib.FactoryError("--name must be the organisation's name")
    who = who or scopes.who(src)
    man = manifest(src)
    templates = [ready[t] for t in template_names]
    reg = instance_registry(lib.registry(src), templates)
    engine = planned(src, man, reg)
    content = starter(src, name)
    content = {rel: render_tables(rel, data.decode("utf-8"), reg).encode("utf-8") for rel, data in content.items()}
    dest.mkdir(parents=True, exist_ok=True)
    _write(dest, engine)
    _write(dest, content)
    _write(dest, {rel: p.read_bytes() for rel, p in template_files(src, man, templates).items()})
    for entry in contributed(src, templates, name, who):
        lib.write_json(dest / "catalogue" / "assets" / f"{entry['id']}.json", entry)
    for folder in ("catalogue/assets", "catalogue/sources", "catalogue/lessons"):
        (dest / folder).mkdir(parents=True, exist_ok=True)
    record = {
        "schema_version": 1,
        "name": name,
        "created": lib.today(),
        "updated": lib.today(),
        "engine": engine_source(src),
        "templates": template_names,
        "files": sorted(engine),
    }
    lib.write_json(dest / INSTANCE, record)
    subprocess.run(["git", "init", "-q", "-b", "main"], cwd=dest, check=True)
    return record


def changes(src: Path, dest: Path) -> tuple[dict[str, bytes], list[tuple[str, str]]]:
    """The engine files for the instance, and what differs: (path, added | changed | removed)."""
    record = lib.read_json(dest / INSTANCE)
    man = manifest(src)
    reg = instance_registry(lib.registry(src), lib.registry(dest)["templates"])
    files = planned(src, man, reg)
    found = []
    for rel, data in sorted(files.items()):
        path = dest / rel
        if not path.exists():
            found.append((rel, "added"))
        elif path.read_bytes() != data:
            found.append((rel, "changed"))
    found += [(rel, "removed") for rel in record.get("files", []) if rel not in files and (dest / rel).exists()]
    return files, found


def update(src: Path, dest: Path, ask: Callable[[str], str] = input, diff: bool = False) -> int:
    if not (dest / INSTANCE).exists():
        raise lib.FactoryError(f"{dest} is not a factory instance (no {INSTANCE})")
    files, found = changes(src, dest)
    if not found:
        print("The instance already has this engine.")
        return check(dest)
    for rel, kind in found:
        print(f"  {kind:8} {rel}")
        if diff and kind == "changed":
            old = (dest / rel).read_text(encoding="utf-8", errors="replace").splitlines()
            new = files[rel].decode("utf-8", errors="replace").splitlines()
            print("\n".join(difflib.unified_diff(old, new, f"instance/{rel}", f"engine/{rel}", lineterm="")))
    print(f"{len(found)} engine file(s) would change. Context, catalogue, templates and ideas are not touched.")
    if ask(f'Type "{CONFIRM}" to copy them: ').strip() != CONFIRM:
        print("Not confirmed; nothing changed.", file=sys.stderr)
        return 1
    _write(dest, {rel: files[rel] for rel, kind in found if kind != "removed"})
    for rel, kind in found:
        if kind == "removed":
            (dest / rel).unlink()
    record = lib.read_json(dest / INSTANCE)
    record.update(updated=lib.today(), engine=engine_source(src), files=sorted(files))
    lib.write_json(dest / INSTANCE, record)
    print(f"Updated {len(found)} file(s).")
    return check(dest)


def main(argv: list[str]) -> int:
    args = argv[1:]

    def option(flag: str) -> str | None:
        if flag in args:
            i = args.index(flag)
            value = args[i + 1] if i + 1 < len(args) else None
            del args[i:i + 2]
            return value
        return None

    try:
        if args[:1] == ["create"]:
            name, chosen = option("--name"), option("--templates")
            if len(args) != 2 or not name:
                print(__doc__)
                return 2
            dest = Path(args[1]).resolve()
            record = create(lib.ROOT, dest, name, [t for t in (chosen or "").split(",") if t])
            print(f"Created {name}'s factory in {dest} (engine {record['engine']['version']}, "
                  f"templates: {', '.join(record['templates']) or 'none'}). Nothing is committed. Next: SETUP.md.")
            check(dest)
            return 0
        if args[:1] == ["update"]:
            diff = "--diff" in args
            args = [a for a in args if a != "--diff"]
            if len(args) != 2:
                print(__doc__)
                return 2
            return update(lib.ROOT, Path(args[1]).resolve(), diff=diff)
    except lib.FactoryError as exc:
        print(f"instance: {exc}", file=sys.stderr)
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
