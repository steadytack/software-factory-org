#!/usr/bin/env python3
"""The catalogue: find approved assets, and bring new material in safely.

Usage:
  python factory/scripts/catalogue.py list [--status S] [--type T]
  python factory/scripts/catalogue.py search <terms...> [--all] [--scope SCOPE]   approved assets and confirmed cards only, unless --all
  python factory/scripts/catalogue.py show <CAT-nnn>
  python factory/scripts/catalogue.py import <folder | file.zip | wheel.whl | git URL> [--ref TAG] [--component] [--by NAME]
  python factory/scripts/catalogue.py validate <CAT-nnn> --yes      runs a code asset's own tests in a container
  python factory/scripts/catalogue.py approve <CAT-nnn> --by NAME [--note TEXT]
  python factory/scripts/catalogue.py review <CAT-nnn> --by NAME --reason TEXT    the owner accepts blocker findings
  python factory/scripts/catalogue.py reject <CAT-nnn> --reason TEXT [--by NAME]
  python factory/scripts/catalogue.py card <system|process|policy> <name> --link URL --maintainer WHO --purpose TEXT [--scope SCOPE] [--tags a,b]
  python factory/scripts/catalogue.py confirm <CAT-nnn> [--by NAME] [--review-by YYYY-MM-DD]   the maintainer confirms a card is accurate
  python factory/scripts/catalogue.py retire <CAT-nnn> --reason TEXT [--by NAME]

--by defaults to git user.name. --scope (group, business:<b>, brand:<x>; factory/context/scopes.json) limits a
search to what an idea in that scope may use.

Import (factory spec section 11) receives the material into catalogue/sources/SRC-nnn/original/ (kept out
of git; source.json records where it came from, its revision and checksum), inspects it, extracts
candidate assets, understands them (purpose, dependencies, licence), assesses them with static checks
only (scan.py: secrets, risky scripts, instructions aimed at an AI, licences) and writes a preview,
report.md: "What can I reuse from this?". Nothing imported is executed (policy POL-04). Each candidate
becomes an entry with status `assessed`. With --component, the whole source is one candidate: a third-party
component to use as it is (type technical), its version from --ref or the wheel's metadata. `validate` is the only step that runs imported code, in a
throwaway container, and only when asked. `approve` needs passed validation and no blocker findings,
and is the owner's decision.

Reference cards (types system, process, policy) describe what already exists: a system in the landscape, a
process or a policy. A card points at its source of truth (source.ref is the URL) rather than copying it,
is never composed into an app, and has its own lifecycle: draft -> confirmed (its maintainer says it is
accurate, until review_by) -> retired. A confirmed card past review_by is stale: still found, flagged.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import factory_lib as lib  # noqa: E402
import scan  # noqa: E402
import scopes  # noqa: E402

SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", ".pytest_cache", ".ruff_cache", ".astro", "test-results", "playwright-report", ".mypy_cache"}
MAX_FILE_BYTES = 20 * 1024 * 1024
WITHHELD = "secret-looking file: withheld, not copied"
MAX_TOTAL_BYTES = 300 * 1024 * 1024
MAX_FILES = 20000
RUNTIMES = ("python", "node", "web", "python+node", "go", "rust", "cpp", "java", "docker", "none")
ROOT_MARKERS = [  # (file at the root, runtime) for a component imported whole
    ("go.mod", "go"), ("Cargo.toml", "rust"), ("CMakeLists.txt", "cpp"), ("pom.xml", "java"),
    ("pyproject.toml", "python"), ("setup.py", "python"), ("package.json", "node"),
]
SOURCE_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".vue", ".svelte"}
KNOWN_TAGS = {
    "fastapi", "flask", "django", "sqlalchemy", "alembic", "pydantic", "streamlit", "pandas", "anthropic", "openai", "httpx",
    "react", "vue", "svelte", "astro", "vite", "tailwindcss", "leaflet", "maplibre-gl", "openlayers", "zustand", "dexie",
    "playwright", "vitest", "pytest", "geoalchemy2", "shapely", "asyncpg", "psycopg", "postgis", "jwt", "pyjwt", "bcrypt",
}
DESIGN_FILES = re.compile(r"(?i)^(design(_tokens)?\.md|component_catalogue\.md|.*tokens?\.(json|css)|theme\.(css|json))$")
OPS_FILES = re.compile(r"(?i)^(dockerfile.*|docker-compose.*\.ya?ml|compose.*\.ya?ml|nginx.*\.conf|.*backup.*\.(sh|py))$")
AI_FILES = re.compile(r"(?i)^(skill\.md|claude\.md|agents\.md|copilot-instructions\.md|.*\.prompt(\.md)?)$")
SPEC_FILES = re.compile(r"(?i)^(openapi\.(json|ya?ml)|.*\.schema\.json|.*spec.*\.md)$")
CARD_TYPES = ("system", "process", "policy")
USABLE = ("approved", "confirmed")
REVIEW_DAYS = 365


class CatalogueError(Exception):
    pass


# ---------------------------------------------------------------- the catalogue
def assets_dir(root: Path | None = None) -> Path:
    return (root or lib.ROOT) / "catalogue" / "assets"


def sources_dir(root: Path | None = None) -> Path:
    return (root or lib.ROOT) / "catalogue" / "sources"


def load_all(root: Path | None = None) -> dict[str, dict]:
    return {p.stem: lib.read_json(p) for p in sorted(assets_dir(root).glob("CAT-*.json"))}


def get(cid: str, root: Path | None = None) -> dict:
    path = assets_dir(root) / f"{cid}.json"
    if not path.exists():
        raise CatalogueError(f"{cid} is not in the catalogue")
    return lib.read_json(path)


def save(entry: dict, root: Path | None = None) -> None:
    problems = lib.validate("catalogue-entry", entry, root)
    if problems:
        raise CatalogueError(f"{entry.get('id')} would be invalid: " + "; ".join(problems))
    lib.write_json(assets_dir(root) / f"{entry['id']}.json", entry)


def next_id(prefix: str, existing: list[str]) -> str:
    numbers = [int(x.split("-")[1]) for x in existing if re.fullmatch(rf"{prefix}-\d{{3}}", x)]
    return f"{prefix}-{(max(numbers) if numbers else 0) + 1:03d}"


def is_card(entry: dict) -> bool:
    return entry["type"] in CARD_TYPES


def is_stale(entry: dict, on: str | None = None) -> bool:
    return entry["status"] == "confirmed" and entry.get("review_by", "9999") < (on or lib.today())


def set_status(entry: dict, status: str, by: str, note: str = "") -> None:
    entry["status"] = status
    item = {"date": lib.today(), "status": status, "by": by}
    if note:
        item["note"] = note
    entry["history"].append(item)


# ---------------------------------------------------------------- search
def words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9][a-z0-9-]*", text.lower()) if len(w) > 2}


def score(entry: dict, terms: list[str]) -> int:
    """Tags weigh most, then the name, then the purpose and usage: fit, not name similarity alone."""
    total = 0
    tags = set(entry["tags"])
    name = words(entry["name"].replace(":", " ").replace(".", " "))
    body = words(" ".join([entry["purpose"], entry.get("usage", ""), " ".join(entry.get("compatibility", []))]))
    for term in (t.lower() for t in terms):
        total += 3 * any(term == t or term in t.split("-") for t in tags)
        total += 2 * any(term == w or w.startswith(term) for w in name)
        total += 1 * any(term == w or w.startswith(term) for w in body)
    return total


def search(terms: list[str], include_all: bool = False, root: Path | None = None, scope: set[str] | None = None) -> list[tuple[int, dict]]:
    """Approved assets and confirmed cards (all entries with include_all), within `scope` when given."""
    found = []
    for entry in load_all(root).values():
        if not include_all and entry["status"] not in USABLE:
            continue
        if scope is not None and scopes.entry_scope(entry) not in scope:
            continue
        s = score(entry, terms)
        if s:
            found.append((s, entry))
    return sorted(found, key=lambda x: (-x[0], x[1]["id"]))


# ---------------------------------------------------------------- receive
@dataclass
class Received:
    sid: str
    folder: Path
    kind: str
    origin: str
    revision: str = ""
    skipped: list[str] = field(default_factory=list)


def walk(root: Path):
    """Files under root, skipping build output, caches and VCS folders."""
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if path.is_file() and not path.is_symlink():
            yield rel.as_posix(), path


def copy_tree(source: Path, dest: Path) -> list[str]:
    skipped, total, count = [], 0, 0
    for rel, path in walk(source):
        if scan.secret_files([rel]):
            skipped.append(f"{rel} ({WITHHELD})")
            continue
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            skipped.append(f"{rel} (over {MAX_FILE_BYTES // 1024 // 1024} MB)")
            continue
        total += size
        count += 1
        if total > MAX_TOTAL_BYTES or count > MAX_FILES:
            raise CatalogueError(f"the source is larger than the importer accepts ({MAX_FILES} files, {MAX_TOTAL_BYTES // 1024 // 1024} MB)")
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)  # contents only: no permissions, no executable bits carried over
    return skipped


def extract_zip(archive: Path, dest: Path) -> list[str]:
    """Unpack safely: no absolute paths, no '..', no symlinks, size and count limits."""
    skipped, total = [], 0
    with zipfile.ZipFile(archive) as zf:
        members = zf.infolist()
        if len(members) > MAX_FILES:
            raise CatalogueError(f"the archive has more than {MAX_FILES} entries")
        for info in members:
            name = info.filename.replace("\\", "/")
            parts = Path(name).parts
            mode = info.external_attr >> 16
            if info.is_dir():
                continue
            if name.startswith("/") or ".." in parts or re.match(r"^[A-Za-z]:", name):
                skipped.append(f"{name} (unsafe path)")
                continue
            if (mode & 0o170000) == 0o120000:
                skipped.append(f"{name} (symbolic link)")
                continue
            if any(p in SKIP_DIRS for p in parts):
                continue
            if scan.secret_files([name]):
                skipped.append(f"{name} ({WITHHELD})")
                continue
            if info.file_size > MAX_FILE_BYTES:
                skipped.append(f"{name} (over {MAX_FILE_BYTES // 1024 // 1024} MB)")
                continue
            total += info.file_size
            if total > MAX_TOTAL_BYTES:
                raise CatalogueError(f"the archive unpacks to more than {MAX_TOTAL_BYTES // 1024 // 1024} MB")
            target = dest / Path(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)
    # a single top-level folder (as GitHub archives have) becomes the root
    entries = [p for p in dest.iterdir()]
    if len(entries) == 1 and entries[0].is_dir():
        inner = entries[0]
        for child in inner.iterdir():
            shutil.move(str(child), dest / child.name)
        inner.rmdir()
    return skipped


def checksum(folder: Path) -> str:
    digest = hashlib.sha256()
    for rel, path in walk(folder):
        digest.update(rel.encode("utf-8"))
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    return "sha256:" + digest.hexdigest()


def remove_tree(path: Path) -> None:
    """Delete a folder even when it holds read-only files (git's objects are read-only on Windows)."""
    import os
    import stat

    def clear_and_retry(func, target, _exc):
        os.chmod(target, stat.S_IWRITE)
        func(target)

    if path.exists():
        shutil.rmtree(path, onexc=clear_and_retry)


def receive(origin: str, root: Path | None = None, ref: str | None = None) -> Received:
    existing = [p.name for p in sources_dir(root).glob("SRC-*")] if sources_dir(root).is_dir() else []
    sid = next_id("SRC", existing)
    folder = sources_dir(root) / sid / "original"
    folder.mkdir(parents=True)
    try:
        if re.match(r"^(https://|git@|file://)", origin):
            git = shutil.which("git")
            if git is None:
                raise CatalogueError("git is needed to import a repository URL")
            clone = sources_dir(root) / sid / "clone"
            # no hooks, no submodules, shallow, one tag or branch; cloning runs none of the repository's code
            command = [git, "-c", "core.hooksPath=/dev/null", "clone", "--depth", "1", "--no-recurse-submodules"]
            command += ["--branch", ref] if ref else []
            done = subprocess.run(command + [origin, str(clone)], capture_output=True, text=True)
            if done.returncode != 0:
                raise CatalogueError("git clone failed: " + done.stderr.strip())
            commit = subprocess.run([git, "-C", str(clone), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
            skipped = copy_tree(clone, folder)
            remove_tree(clone)
            return Received(sid, folder, "git", origin, f"{ref} ({commit})" if ref else commit, skipped)
        if ref:
            raise CatalogueError("--ref applies to a git URL only")
        path = Path(origin).resolve()
        if path.is_dir():
            return Received(sid, folder, "folder", str(path), "", copy_tree(path, folder))
        if path.is_file() and path.suffix.lower() in (".zip", ".whl"):  # a Python wheel is a ZIP archive
            revision = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
            return Received(sid, folder, "zip", str(path), revision, extract_zip(path, folder))
        if path.is_file():
            shutil.copyfile(path, folder / path.name)
            return Received(sid, folder, "file", str(path))
        raise CatalogueError(f"{origin}: not a folder, a .zip file, a file or a git URL")
    except Exception:
        remove_tree(sources_dir(root) / sid)
        raise


# ---------------------------------------------------------------- extract and understand
@dataclass
class Candidate:
    name: str
    type: str
    path: str  # folder inside the source ('' = its root)
    runtime: str = "unknown"
    purpose: str = "unknown"
    files: list[str] = field(default_factory=list)  # for a group of files; empty = the whole folder
    dependencies: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    interfaces: list[str] = field(default_factory=list)
    version: str = "unknown"


NOT_PACKAGES = {"tests", "test", "migrations", "scripts", "docs", "examples", "alembic"}


def is_package(path: Path) -> bool:
    """A Python package, with or without __init__.py (namespace packages count)."""
    if not path.is_dir() or path.name in SKIP_DIRS or path.name in NOT_PACKAGES or path.name.startswith("."):
        return False
    return any(child.suffix == ".py" for child in path.iterdir() if child.is_file())


def readme_purpose(folder: Path) -> str:
    """The first paragraph of a README, else the description in pyproject.toml or package.json."""
    for name in ("README.md", "readme.md", "README.txt"):
        path = folder / name
        if path.exists():
            text = path.read_text(encoding="utf-8", errors="replace")
            for para in re.split(r"\n\s*\n", text):
                para = para.strip()
                if para and not para.startswith(("#", "!", "<", "[", "|", "```", ">")):
                    return " ".join(para.split())[:300]
    pyproject = folder / "pyproject.toml"
    if pyproject.exists():
        match = re.search(r'(?m)^description\s*=\s*"([^"]+)"', pyproject.read_text(encoding="utf-8", errors="replace"))
        if match:
            return match.group(1)
    if (folder / "package.json").exists():
        try:
            return json.loads((folder / "package.json").read_text(encoding="utf-8")).get("description", "")
        except ValueError:
            return ""
    return ""


def python_dependencies(folder: Path) -> list[str]:
    deps: list[str] = []
    pyproject = folder / "pyproject.toml"
    if pyproject.exists():
        text = pyproject.read_text(encoding="utf-8", errors="replace")
        block = re.search(r"(?ms)^dependencies\s*=\s*\[(.*?)^\]", text)
        if block:
            deps += re.findall(r'"([A-Za-z0-9_.\-]+)', block.group(1))
        poetry = re.search(r"(?ms)^\[tool\.poetry\.dependencies\](.*?)^\[", text + "\n[")
        if poetry:
            deps += [d for d in re.findall(r"(?m)^([A-Za-z0-9_.\-]+)\s*=", poetry.group(1)) if d.lower() != "python"]
    for req in ("requirements.txt",):
        if (folder / req).exists():
            for line in (folder / req).read_text(encoding="utf-8", errors="replace").splitlines():
                m = re.match(r"^\s*([A-Za-z0-9_.\-]+)", line)
                if m and not line.strip().startswith(("#", "-")):
                    deps.append(m.group(1))
    return sorted({d.lower().replace("_", "-") for d in deps})


def node_dependencies(folder: Path) -> list[str]:
    try:
        data = json.loads((folder / "package.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return sorted(set(data.get("dependencies", {})))


def tags_for(*texts: str, deps: list[str] = ()) -> list[str]:
    out = {d for d in deps if d in KNOWN_TAGS}
    for text in texts:
        out |= {w for w in words(text) if w in KNOWN_TAGS}
    return sorted(out)


def find_candidates(root: Path, label: str | None = None) -> list[Candidate]:
    label = label or root.name
    files = [rel for rel, _ in walk(root)]
    dirs_with = lambda name: sorted({str(Path(f).parent.as_posix()) for f in files if Path(f).name == name})  # noqa: E731
    found: list[Candidate] = []
    covered: set[str] = set()

    # 1. modules a template already describes (module.json)
    for d in dirs_with("module.json"):
        folder = root / d if d != "." else root
        try:
            man = json.loads((folder / "module.json").read_text(encoding="utf-8"))
        except ValueError:
            continue
        for mod, spec in man.get("modules", {}).items():
            paths = [p["from"] for p in spec.get("paths", [])] + [t["from"] for t in spec.get("tests", [])]
            found.append(Candidate(f"{man.get('template', folder.name)}:{mod}", "module", "" if d == "." else d, man.get("runtime", "unknown"),
                                   spec.get("description", "unknown"), paths, spec.get("dependencies", []),
                                   tags_for(mod, spec.get("description", ""), deps=spec.get("dependencies", [])),
                                   ["module.json: graftable into a Python base"] + [f"needs {n}" for n in spec.get("needs", [])]))

    # 2. code projects, and the packages inside them
    projects = sorted(set(dirs_with("pyproject.toml") + dirs_with("requirements.txt") + dirs_with("package.json")), key=len)
    for d in projects:
        folder = root / d if d != "." else root
        rel = "" if d == "." else d
        is_node = (folder / "package.json").exists()
        runtime = "node" if is_node else "python"
        deps = node_dependencies(folder) if is_node else python_dependencies(folder)
        purpose = readme_purpose(folder)
        if not purpose and is_node:
            try:
                purpose = json.loads((folder / "package.json").read_text(encoding="utf-8")).get("description", "")
            except ValueError:
                purpose = ""
        has_ops = any((folder / n).exists() for n in ("Dockerfile", "docker-compose.yml", "compose.yaml"))
        # a runnable project at the root could start apps; anything deeper is a part to learn from or extract
        kind = "template" if has_ops and not rel else "reference"
        found.append(Candidate(folder.name if rel else label, kind, rel, runtime, purpose or "unknown", [], deps,
                               tags_for(folder.name, purpose, deps=deps) + [runtime]))
        covered.add(rel)
        # packages inside: Python sub-packages of the main package, or folders under src/ in a Node project
        if is_node:
            src = folder / "src"
            subs = [p for p in sorted(src.iterdir()) if p.is_dir()] if src.is_dir() else []
            for sub in subs:
                count = sum(1 for _ in sub.rglob("*") if _.suffix in SOURCE_SUFFIXES)
                if count >= 3:
                    found.append(Candidate(f"{folder.name}/src/{sub.name}", "module", f"{rel}/src/{sub.name}".strip("/"), "node",
                                           readme_purpose(sub) or "unknown", [], [], tags_for(sub.name) + ["node", "frontend"]))
        else:
            packages = [p for p in folder.iterdir() if is_package(p)] if folder.is_dir() else []
            packages += [p for p in (folder / "src").iterdir() if is_package(p)] if (folder / "src").is_dir() else []
            for pkg in packages:
                for sub in sorted(p for p in pkg.iterdir() if is_package(p)):
                    count = sum(1 for _ in sub.rglob("*.py") if _.name != "__init__.py")
                    if count >= 1:
                        sub_rel = sub.relative_to(root).as_posix()
                        found.append(Candidate(f"{pkg.name}.{sub.name}", "module", sub_rel, "python",
                                               readme_purpose(sub) or "unknown", [], [], tags_for(sub.name) + ["python"]))

    # the whole source, when it is several projects together (a reference implementation)
    if len(projects) > 1 and "." not in projects:
        purpose = readme_purpose(root) or "unknown"
        found.insert(0, Candidate(label, "reference", "", "unknown", purpose, [], [], tags_for(label, purpose)))

    # 3. groups of files: design, operational, AI instructions, specifications
    groups = [("design", DESIGN_FILES, "Design guidance and tokens"), ("operational", OPS_FILES, "Container, compose, proxy and backup files"),
              ("ai", AI_FILES, "Instructions for AI assistants"), ("specification", SPEC_FILES, "Machine-readable contracts and specifications")]
    for kind, pattern, what in groups:
        matched = [f for f in files if pattern.match(Path(f).name)]
        if kind == "operational":
            matched += [f for f in files if f.startswith(".github/workflows/") or "/.github/workflows/" in f]
        if kind == "ai":
            matched += [f for f in files if "/prompts/" in f"/{f}" or f.startswith(".claude/")]
        matched = sorted(set(matched))
        if matched:
            found.append(Candidate(f"{label} {kind} files", kind, "", "none", what, matched, [], [kind]))
    return found


# ---------------------------------------------------------------- assess
def assess(root: Path, cand: Candidate) -> list[scan.Finding]:
    """Static checks only (never executes anything)."""
    folder = root / cand.path if cand.path else root
    if cand.files:  # a group of files: check only those (paths relative to the candidate's folder)
        names = [f for f in cand.files if (folder / f).is_file()]
        others = [f for f in scan.scan_scripts(folder) + scan.scan_instructions(folder) if f.where in names]
        found = scan.dedupe(scan.scan_secrets(folder, names, test_files_warn=True) + others)
        prefix = f"{cand.path}/" if cand.path else ""
        return [scan.Finding(f.severity, f.kind, prefix + f.where, f.what) for f in found]
    findings = scan.scan_secrets(folder, test_files_warn=True) + scan.scan_scripts(folder) + scan.scan_instructions(folder)
    prefix = f"{cand.path}/" if cand.path else ""
    return [scan.Finding(f.severity, f.kind, prefix + f.where, f.what) for f in scan.dedupe(findings)]


def licence_for(root: Path, cand: Candidate) -> str:
    name, where = scan.detect_licence(root / cand.path if cand.path else root)
    if where is None:
        name, where = scan.detect_licence(root)
    if where is None:
        return "unknown"
    return f"{name} ({where})"


# ---------------------------------------------------------------- import
def dedupe_dicts(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for item in items:
        key = tuple(sorted(item.items()))
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def wheel_metadata(root: Path) -> dict[str, object] | None:
    """Name, version, summary and dependencies from a wheel's .dist-info/METADATA, if there is one."""
    metas = sorted(root.glob("*.dist-info/METADATA"))
    if not metas:
        return None
    text = metas[0].read_text(encoding="utf-8", errors="replace")
    header = text.split("\n\n", 1)[0]

    def field_value(name: str) -> str:
        match = re.search(rf"(?m)^{name}:\s*(.+)$", header)
        return match.group(1).strip() if match else ""

    deps = []
    for line in re.findall(r"(?m)^Requires-Dist:\s*(.+)$", header):
        if "extra ==" not in line:  # optional extras are not dependencies of the component itself
            deps.append(re.split(r"[\s;<>=!~\[(]", line.strip(), maxsplit=1)[0].lower())
    return {"name": field_value("Name"), "version": field_value("Version"), "summary": field_value("Summary"), "dependencies": sorted(set(deps))}


def component_candidate(root: Path, label: str, ref: str | None) -> Candidate:
    """The whole source as one third-party component to be used as it is (import --component)."""
    meta = wheel_metadata(root)
    if meta:
        name, version = str(meta["name"] or label), str(meta["version"] or ref or "unknown")
        return Candidate(name, "technical", "", "python", str(meta["summary"]) or "unknown", [], list(meta["dependencies"]),
                         tags_for(name, str(meta["summary"]), deps=list(meta["dependencies"])) + ["python", "component"], [], version)
    runtime = next((rt for marker, rt in ROOT_MARKERS if (root / marker).exists()), "unknown")
    if runtime == "python":
        deps = python_dependencies(root)
    elif runtime == "node":
        deps = node_dependencies(root)
    elif runtime == "go" and (root / "go.mod").exists():
        block = re.search(r"(?ms)^require\s*\((.*?)^\)", (root / "go.mod").read_text(encoding="utf-8", errors="replace"))
        deps = sorted({line.split()[0] for line in (block.group(1).splitlines() if block else []) if line.strip() and "// indirect" not in line})
    else:
        deps = []
    purpose = readme_purpose(root) or "unknown"
    version = (ref or "unknown").lstrip("v") if ref and re.match(r"^v?\d", ref) else (ref or "unknown")
    tags = tags_for(label, purpose, deps=deps) + [t for t in (runtime, "component") if t != "unknown"]
    return Candidate(label, "technical", "", runtime, purpose, [], deps, tags, [], version)


def import_source(origin: str, by: str = "owner", root: Path | None = None, ref: str | None = None,
                  component: bool = False) -> tuple[dict, list[dict], str]:
    received = receive(origin, root, ref)
    src_root = received.folder
    label = re.sub(r"(\.git|\.zip|-[0-9][^-]*-py3-none-any\.whl|\.whl)$", "", received.origin.rstrip("/\\").replace("\\", "/").split("/")[-1]) or src_root.name
    candidates = [component_candidate(src_root, label, ref)] if component else find_candidates(src_root, label)
    entries: list[dict] = []
    all_findings: list[dict] = []
    existing = list(load_all(root))
    for cand in candidates:
        cid = next_id("CAT", existing)
        existing.append(cid)
        findings = assess(src_root, cand)
        all_findings += [f.as_dict() for f in findings]
        blockers = [f for f in findings if f.severity == "blocker"]
        warnings = [f for f in findings if f.severity == "warning"]
        risks = [f"{f.severity}: {f.what} in {f.where}" for f in blockers + warnings]
        licence = licence_for(src_root, cand)
        limitations = ["Not validated: nothing from this source has been run"]
        if licence.startswith("unknown"):
            limitations.append("Licence unknown: do not reuse until it is established")
        if re.search(r"(?i)\b(a?gpl|lgpl)", licence):
            limitations.append(f"Copyleft licence ({licence}): check compatibility before reuse")
        entry = {
            "schema_version": 1,
            "id": cid,
            "name": cand.name,
            "purpose": cand.purpose or "unknown",
            "type": cand.type,
            "tags": sorted({t for t in cand.tags if re.fullmatch(r"[a-z0-9][a-z0-9-]*", t)}),
            "version": cand.version,
            "status": "imported",
            "source": {"ref": received.sid, "path": cand.path or "."},
            "runtime": cand.runtime if cand.runtime in RUNTIMES else "unknown",
            "licence": licence,
            "maintainer": "unknown",
            "dependencies": cand.dependencies,
            "compatibility": [],
            "interfaces": cand.interfaces,
            "usage": ("Files: " + ", ".join(cand.files[:40]) + (" ..." if len(cand.files) > 40 else "")) if cand.files else "",
            "evidence": [],
            "risks": risks,
            "limitations": limitations,
            "history": [{"date": lib.today(), "status": "imported", "by": by, "note": f"from {received.origin}"}],
        }
        set_status(entry, "assessed", "factory", f"static checks: {len(blockers)} blocker(s), {len(warnings)} warning(s)")
        save(entry, root)
        entries.append(entry)
    record = {
        "schema_version": 1,
        "id": received.sid,
        "kind": received.kind,
        "origin": received.origin,
        "received": lib.today(),
        "supplied_by": by,
        "checksum": checksum(src_root),
        "licence": licence_for(src_root, Candidate("", "reference", "")),
        "inspected": [f"{sum(1 for _ in walk(src_root))} files: candidate detection, secret patterns, risky scripts, AI instruction markers, licence files"],
        "unverified": ["Behaviour: nothing was executed", "Dependencies were not resolved or scanned for known vulnerabilities"]
        + [f"Skipped: {s}" for s in received.skipped],
        "findings": dedupe_dicts(all_findings + [
            {"severity": "warning", "kind": "secret", "where": s.split(" (")[0], "what": WITHHELD} for s in received.skipped if WITHHELD in s
        ]),
        "candidates": [e["id"] for e in entries],
    }
    if received.revision:
        record["revision"] = received.revision
    problems = lib.validate("source-record", record, root)
    if problems:
        raise CatalogueError("source record invalid: " + "; ".join(problems))
    lib.write_json(sources_dir(root) / received.sid / "source.json", record)
    report = render_report(record, entries)
    (sources_dir(root) / received.sid / "report.md").write_text(report, encoding="utf-8", newline="\n")
    return record, entries, report


def render_report(record: dict, entries: list[dict]) -> str:
    blockers = [f for f in record["findings"] if f["severity"] == "blocker"]
    lines = [
        f"# What can I reuse from {record['id']}?",
        "",
        f"Source: `{record['origin']}` ({record['kind']}), received {record['received']}. Checksum `{record['checksum'][:23]}...`"
        + (f", revision `{record['revision'][:16]}`" if record.get("revision") else "") + ".",
        f"Licence at the root: {record['licence']}.",
        "",
        "Nothing from this source was executed. Each candidate is `assessed`; none is approved. To reuse one: "
        "`catalogue.py validate <id> --yes` (runs its own tests in a container), then the owner's `approve`.",
        "",
        f"## Candidates ({len(entries)})",
        "| ID | Name | Type | Runtime | Purpose | Licence | Findings |",
        "|---|---|---|---|---|---|---|",
    ]
    for e in entries:
        purpose = e["purpose"] if len(e["purpose"]) < 90 else e["purpose"][:87] + "..."
        lines.append(f"| {e['id']} | {e['name']} | {e['type']} | {e['runtime']} | {purpose} | {e['licence']} | {len(e['risks']) or '-'} |")
    lines += ["", f"## Findings ({len(record['findings'])}; {len(blockers)} blocker(s))"]
    if not record["findings"]:
        lines.append("None.")
    order = {"blocker": 0, "warning": 1, "info": 2}
    for f in sorted(record["findings"], key=lambda f: (order[f["severity"]], f["where"])):
        lines.append(f"- **{f['severity']}** {f['kind']}: {f['what']} in `{f['where']}`")
    lines += ["", "## Not verified"] + [f"- {u}" for u in record["unverified"]]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- validate, approve, reject
def source_folder(entry: dict, root: Path | None = None) -> Path:
    ref = entry["source"]["ref"]
    base = sources_dir(root) / ref / "original" if ref.startswith("SRC-") else (root or lib.ROOT) / ref
    path = entry["source"].get("path", ".")
    return base / path if path not in ("", ".") else base


def project_folder(folder: Path, stop: Path) -> Path | None:
    """The nearest folder at or above `folder` (within `stop`) that is a Python or Node project."""
    current = folder
    while True:
        if any((current / n).exists() for n in ("pyproject.toml", "requirements.txt", "package.json")):
            return current
        if current == stop or current.parent == current:
            return None
        current = current.parent


def validation_script(project: Path) -> tuple[str, str, str]:
    """(image, shell script, what it proves) for a code project."""
    if (project / "package.json").exists():
        data = json.loads((project / "package.json").read_text(encoding="utf-8"))
        if "test" not in data.get("scripts", {}):
            raise CatalogueError("the Node project has no test script; validate it by hand and record the evidence")
        install = "npm ci" if (project / "package-lock.json").exists() else "npm install"
        return "node:24", f"{install} 2>&1 | tail -2 && npm test", "npm test"
    text = (project / "pyproject.toml").read_text(encoding="utf-8") if (project / "pyproject.toml").exists() else ""
    if "[project.optional-dependencies]" in text and re.search(r"(?m)^dev\s*=", text):
        install = "pip install -q -e '.[dev]'"
    elif (project / "requirements-dev.txt").exists():
        install = "pip install -q -r requirements-dev.txt"
    elif (project / "requirements.txt").exists():
        install = "pip install -q -r requirements.txt pytest"
    else:
        install = "pip install -q -e . pytest"
    return "python:3.12-slim", f"{install} 2>&1 | tail -2 && python -m pytest -q", "python -m pytest"


def validate(cid: str, root: Path | None = None, runner=None) -> dict:
    """Run a code asset's own tests in a throwaway container, or a static review for other assets."""
    entry = get(cid, root)
    if is_card(entry):
        raise CatalogueError(f"{cid} is a reference card: its maintainer confirms it (confirm), nothing is run")
    if entry["status"] not in ("assessed", "needs-changes", "validated"):
        raise CatalogueError(f"{cid} is {entry['status']}: only an assessed asset can be validated")
    folder = source_folder(entry, root)
    if not folder.exists():
        raise CatalogueError(f"{cid}: its source files are not on this machine ({folder}); import it again")
    if any(r.startswith("blocker") for r in entry["risks"]):
        raise CatalogueError(f"{cid} has blocker findings; resolve them before validating")
    if entry["type"] in ("module", "template", "reference") and entry["runtime"] in ("python", "node"):
        base = sources_dir(root) / entry["source"]["ref"] / "original" if entry["source"]["ref"].startswith("SRC-") else folder
        project = project_folder(folder, base)
        if project is None:
            raise CatalogueError(f"{cid}: no project (pyproject, requirements or package.json) around it to test")
        image, script, what = validation_script(project)
        ok, output = (runner or run_container)(project, image, script)
        covers = "" if project == folder else f" (the tests of {project.name}, which cover more than this asset)"
        tail = " ".join(output.strip().splitlines()[-3:])[:300]
        evidence = {"date": lib.today(), "check": f"{what} in {image}, clean container{covers}", "result": "passed" if ok else "failed", "detail": tail}
    else:
        # Static review: no unreviewed blocker; warnings and reviewed findings are recorded, not fatal.
        # A third-party component used as it is (type technical) is proven by the app's own integration tests later.
        warnings = [r for r in entry["risks"] if r.startswith("warning")]
        reviewed = [r for r in entry["risks"] if r.startswith("reviewed")]
        clean = entry["type"] == "technical" or not warnings
        detail = f"no blocker findings; {len(warnings)} warning(s) and {len(reviewed)} reviewed finding(s) recorded in risks"
        evidence = {"date": lib.today(), "check": "static review: files present, no unreviewed blocker findings", "result": "passed" if clean else "failed",
                    "detail": detail if clean else "; ".join(warnings)[:300]}
    entry["evidence"].append(evidence)
    set_status(entry, "validated" if evidence["result"] == "passed" else "needs-changes", "factory", evidence["check"])
    save(entry, root)
    return entry


def run_container(project: Path, image: str, script: str) -> tuple[bool, str]:
    if shutil.which("docker") is None:
        raise CatalogueError("validation needs Docker (imported code only ever runs in a throwaway container)")
    full = "set -e; mkdir -p /tmp/w && cp -r /src/. /tmp/w && cd /tmp/w && " + script
    done = subprocess.run(
        ["docker", "run", "--rm", "--network", "bridge", "--memory", "2g", "--cpus", "2", "-v", f"{project}:/src:ro", image, "sh", "-c", full],
        capture_output=True, text=True, encoding="utf-8", errors="replace", env={**__import__("os").environ, "MSYS_NO_PATHCONV": "1"},
    )
    return done.returncode == 0, done.stdout + done.stderr


def approve(cid: str, by: str, note: str = "", root: Path | None = None) -> dict:
    entry = get(cid, root)
    if is_card(entry):
        raise CatalogueError(f"{cid} is a reference card: use confirm, not approve")
    if entry["status"] != "validated":
        raise CatalogueError(f"{cid} is {entry['status']}: only a validated asset can be approved")
    if not any(e["result"] == "passed" for e in entry["evidence"]):
        raise CatalogueError(f"{cid} has no passed evidence")
    if any(r.startswith("blocker") for r in entry["risks"]):
        raise CatalogueError(f"{cid} has blocker findings")
    if entry["licence"].startswith("unknown"):
        raise CatalogueError(f"{cid}: the licence is unknown; record it (edit the entry's licence) before approving")
    set_status(entry, "approved", by, note or "approved for reuse")
    save(entry, root)
    return entry


def review(cid: str, by: str, reason: str, root: Path | None = None) -> dict:
    """The owner's decision on an asset's blocker findings: each becomes 'reviewed', with who and why.
    Nothing is hidden: the finding stays in the risks and the source record."""
    entry = get(cid, root)
    blockers = [r for r in entry["risks"] if r.startswith("blocker")]
    if not blockers:
        raise CatalogueError(f"{cid} has no blocker findings to review")
    entry["risks"] = [f"reviewed by {by} ({reason}): {r[len('blocker: '):]}" if r.startswith("blocker") else r for r in entry["risks"]]
    entry["history"].append({"date": lib.today(), "status": entry["status"], "by": by, "note": f"reviewed {len(blockers)} blocker finding(s): {reason}"})
    save(entry, root)
    return entry


def card(kind: str, name: str, link: str, maintainer: str, purpose: str, by: str, scope: str = scopes.GROUP,
         tags: list[str] = (), root: Path | None = None) -> dict:
    """A draft reference card for something that already exists (a system, process or policy)."""
    if kind not in CARD_TYPES:
        raise CatalogueError(f"a card is one of {', '.join(CARD_TYPES)}, not {kind!r}")
    scopes.parse(scope, scopes.registry(root))  # an unknown scope is an error
    entry = {
        "schema_version": 1, "id": next_id("CAT", list(load_all(root))), "name": name, "purpose": purpose,
        "type": kind, "tags": sorted(set(tags) | words(name)), "version": "unknown", "status": "draft", "scope": scope,
        "source": {"ref": link}, "licence": "not applicable (reference card)", "maintainer": maintainer,
        "dependencies": [], "interfaces": [], "evidence": [], "risks": [], "limitations": [],
        "history": [{"date": lib.today(), "status": "draft", "by": by, "note": f"card created, pointing at {link}"}],
    }
    if scope == scopes.GROUP:
        del entry["scope"]
    problems = lib.validate("catalogue-entry", entry, root)
    if problems:
        raise CatalogueError("the card would be invalid: " + "; ".join(problems))
    save(entry, root)
    return entry


def confirm(cid: str, by: str, review_by: str | None = None, root: Path | None = None) -> dict:
    """The maintainer says the card matches its source of truth, until review_by (default a year)."""
    import datetime as dt

    entry = get(cid, root)
    if not is_card(entry):
        raise CatalogueError(f"{cid} is a build asset: validate and approve it instead")
    if entry["status"] == "retired":
        raise CatalogueError(f"{cid} is retired")
    entry["last_reviewed"] = lib.today()
    entry["review_by"] = review_by or (dt.date.today() + dt.timedelta(days=REVIEW_DAYS)).isoformat()
    set_status(entry, "confirmed", by, f"confirmed accurate until {entry['review_by']}")
    save(entry, root)
    return entry


def retire(cid: str, reason: str, by: str, root: Path | None = None) -> dict:
    entry = get(cid, root)
    if not is_card(entry):
        raise CatalogueError(f"{cid} is a build asset: deprecate or reject it instead")
    set_status(entry, "retired", by, reason)
    save(entry, root)
    return entry


def reject(cid: str, reason: str, by: str = "owner", root: Path | None = None) -> dict:
    entry = get(cid, root)
    set_status(entry, "rejected", by, reason)
    save(entry, root)
    return entry


# ---------------------------------------------------------------- command line
def line(entry: dict) -> str:
    status = "stale" if is_stale(entry) else entry["status"]
    where = "" if scopes.entry_scope(entry) == scopes.GROUP else f"  [{entry['scope']}]"
    return f"{entry['id']}  {status:<13} {entry['type']:<13} {entry['name']}  ({entry['version']}){where}"


def main(argv: list[str]) -> int:
    if "-h" in argv[1:] or "--help" in argv[1:]:
        print(__doc__)
        return 0
    args = argv[1:]

    def option(name: str) -> str | None:
        if name in args:
            at = args.index(name)
            value = args[at + 1] if at + 1 < len(args) else None
            del args[at : at + 2]
            return value
        return None

    try:
        if not args:
            print(__doc__)
            return 2
        command = args.pop(0)
        if command == "list":
            status, kind = option("--status"), option("--type")
            for entry in load_all().values():
                if (status is None or entry["status"] == status) and (kind is None or entry["type"] == kind):
                    print(line(entry))
            return 0
        if command == "search" and args:
            include_all = "--all" in args
            scope_arg = option("--scope")
            reg = scopes.registry()
            seen = scopes.visible(scopes.parse(scope_arg, reg), reg) if scope_arg else None
            terms = [a for a in args if a != "--all"]
            results = search(terms, include_all, scope=seen)
            for s, entry in results:
                print(f"{s:>3}  {line(entry)}\n     {entry['purpose'][:110]}")
            if not results:
                print("No matching assets" + ("" if include_all else " (approved assets and confirmed cards only; --all to include the rest)"))
            return 0
        if command == "show" and len(args) == 1:
            print(json.dumps(get(args[0]), indent=2, ensure_ascii=False))
            return 0
        if command == "import" and args:
            by = option("--by") or scopes.who()
            ref = option("--ref")
            component = "--component" in args
            args = [a for a in args if a != "--component"]
            record, entries, report = import_source(args[0], by, ref=ref, component=component)
            print(report)
            print(f"Recorded {record['id']} with {len(entries)} candidate(s) in catalogue/; report: catalogue/sources/{record['id']}/report.md")
            return 0
        if command == "validate" and args:
            if "--yes" not in args:
                print("validate runs the asset's own code in a throwaway container. Add --yes to go ahead.", file=sys.stderr)
                return 2
            entry = validate(args[0])
            print(f"{entry['id']}: {entry['status']} ({entry['evidence'][-1]['result']}: {entry['evidence'][-1]['check']})")
            return 0 if entry["status"] == "validated" else 1
        if command == "approve" and args:
            by = option("--by")
            note = option("--note") or ""
            if not by:
                print("approve needs --by NAME (the person approving)", file=sys.stderr)
                return 2
            print(line(approve(args[0], by, note)))
            return 0
        if command == "review" and args:
            by, reason = option("--by"), option("--reason")
            if not by or not reason:
                print("review needs --by NAME and --reason TEXT (the owner's decision on the blocker findings)", file=sys.stderr)
                return 2
            entry = review(args[0], by, reason)
            print(f"{entry['id']}: {sum(r.startswith('reviewed') for r in entry['risks'])} finding(s) reviewed by {by}")
            return 0
        if command == "reject" and args:
            reason = option("--reason")
            by = option("--by") or scopes.who()
            if not reason:
                print("reject needs --reason TEXT", file=sys.stderr)
                return 2
            print(line(reject(args[0], reason, by)))
            return 0
        if command == "card" and len(args) >= 2:
            link, maintainer, purpose = option("--link"), option("--maintainer"), option("--purpose")
            scope = option("--scope") or scopes.GROUP
            tags = [t for t in (option("--tags") or "").split(",") if t]
            by = option("--by") or scopes.who()
            if not (link and maintainer and purpose):
                print("card needs --link URL (its source of truth), --maintainer WHO and --purpose TEXT", file=sys.stderr)
                return 2
            print(line(card(args[0], " ".join(args[1:]), link, maintainer, purpose, by, scope, tags)))
            return 0
        if command == "confirm" and args:
            by = option("--by") or scopes.who()
            review_by = option("--review-by")
            print(line(confirm(args[0], by, review_by)))
            return 0
        if command == "retire" and args:
            reason = option("--reason")
            by = option("--by") or scopes.who()
            if not reason:
                print("retire needs --reason TEXT", file=sys.stderr)
                return 2
            print(line(retire(args[0], reason, by)))
            return 0
    except (CatalogueError, lib.FactoryError) as exc:
        print(f"catalogue: {exc}", file=sys.stderr)
        return 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
