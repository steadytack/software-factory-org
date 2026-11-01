"""Fixtures: a throwaway copy of the factory, so tests can break things safely.

The scripts find the repository from their own location, so a test that runs a script as a command
runs the copy's script against the copy's files. Tests that import a module pass `root=` instead.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

REAL_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REAL_ROOT / "factory" / "scripts"))

_SKIP_NAMES = shutil.ignore_patterns(
    "node_modules", "dist", ".astro", "test-results", "playwright-report", ".venv",
    "__pycache__", ".pytest_cache", ".ruff_cache", "backups", ".git",
)
GIT_ENV = {
    "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.org",
    "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.org",
}


def SKIP(directory: str, names: list[str]) -> set[str]:
    """Skip build output everywhere, and the generated app/ inside each idea (but not src/app of a template)."""
    skipped = set(_SKIP_NAMES(directory, names))
    if Path(directory) == REAL_ROOT / "ideas":  # real ideas would leak into tests that expect an empty pipeline
        skipped |= set(names) - {"README.md"}
    if Path(directory).parent.name == "ideas" and "app" in names:
        skipped.add("app")
    if Path(directory).parent.name == "sources":  # imported originals are local-only and large
        skipped |= {"original", "clone"} & set(names)
    return skipped


def run(args: list[str], cwd: Path, **kwargs) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, env={**os.environ, **GIT_ENV}, **kwargs)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A copy of the parts of the repository the scripts read."""
    root = tmp_path / "repo"
    root.mkdir()
    for name in ("factory", "templates", "catalogue", "ideas", ".github", "docs"):
        if (REAL_ROOT / name).exists():
            shutil.copytree(REAL_ROOT / name, root / name, ignore=SKIP)
    for name in ("README.md", "CLAUDE.md", "VERSION", "CHANGELOG.md"):
        shutil.copy(REAL_ROOT / name, root / name)
    learned = root / "factory" / "context" / "learned.md"  # the real ideas' entries go with them
    lines = learned.read_text(encoding="utf-8").splitlines(keepends=True)
    learned.write_text("".join(line for line in lines if not line.startswith("| 2")), encoding="utf-8")
    return root


@pytest.fixture
def py() -> str:
    return sys.executable


def git_commit_all(folder: Path) -> None:
    for cmd in (["git", "init", "-q"], ["git", "add", "-A"], ["git", "commit", "-q", "-m", "init"]):
        subprocess.run(cmd, cwd=folder, check=True, capture_output=True, env={**os.environ, **GIT_ENV})
