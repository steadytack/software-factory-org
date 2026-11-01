"""-h and --help print a script's usage and change nothing, wherever they appear (not taken as data)."""

import pytest
from conftest import run

SCRIPTS = ["catalogue", "check_factory", "check_spec", "dashboard", "import_source", "learned",
           "pipeline", "publish", "scaffold", "scopes", "status", "verify"]


def snapshot(root):
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()}


@pytest.mark.parametrize("script", SCRIPTS)
def test_help_prints_the_usage_and_exits(repo, py, script):
    path = repo / "factory" / "scripts" / f"{script}.py"
    result = run([py, str(path), "--help"], repo, timeout=60)
    assert result.returncode == 0
    assert result.stdout.strip().splitlines()[0] in path.read_text(encoding="utf-8")


def test_help_after_a_command_writes_nothing(repo, py):
    before = snapshot(repo / "ideas")
    for args in (["add", "-h"], ["add", "--help"], ["capture", "-h"]):
        result = run([py, str(repo / "factory" / "scripts" / "pipeline.py"), *args], repo, timeout=60)
        assert result.returncode == 0
        assert "Stage 1, Develop and Assess" in result.stdout
    run([py, str(repo / "factory" / "scripts" / "scaffold.py"), "new", "-h"], repo, timeout=60)
    assert snapshot(repo / "ideas") == before
