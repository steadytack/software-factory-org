"""verify.py: a template's checks, from the registry, in clean containers."""

import pytest
import verify
from conftest import REAL_ROOT, run

PART = {
    "name": "backend", "runtime": "python", "image": "python:3.12-slim", "cwd": "backend",
    "env": {"DATABASE_URL": "postgresql://app:verify@db:5432/app_test"},
    "services": [{"name": "db", "image": "postgis/postgis:17-3.5", "ready": "pg_isready -U app"}],
    "setup": ["pip install -r requirements-dev.txt"], "steps": ["python -m pytest -q"],
}


def test_a_part_runs_in_a_copy_of_the_project_with_setup_before_steps():
    lines = verify.container_script(PART).splitlines()
    assert lines[0] == "set -e" and "cd /tmp/w/backend" in lines
    assert lines.index("pip install -r requirements-dev.txt 2>&1 | tail -2") < lines.index("python -m pytest -q")
    assert any("--exclude=node_modules" in line for line in lines)


def test_the_summary_reports_each_part_and_the_total():
    text = verify.summarise([verify.PartResult("a", "p", True, "1 passed"), verify.PartResult("b", "q", False, "2 failed")])
    assert "OK     a: p" in text and "FAILED b: q" in text and "verify: FAILED (1 of 2 parts)" in text


def test_the_summary_prints_on_a_console_that_cannot_show_every_character(monkeypatch):
    # a Windows console (cp1252) crashed on a tool's ✓ or →
    import io

    out = io.TextIOWrapper(io.BytesIO(), encoding="cp1252")
    monkeypatch.setattr(verify.sys, "stdout", out)
    monkeypatch.setattr(verify, "verify_parts_file", lambda path, only=None: [
        verify.PartResult("app", "tests", True, "12 passed ✓ → done")])
    assert verify.main(["verify.py", "--parts", "verify.json"]) == 0
    out.flush()
    assert "12 passed ? ? done" in out.buffer.getvalue().decode("cp1252")


def test_each_test_runs_pass_fail_line_shows_above_the_tail():
    backend = "== python -m pytest -q\n........\n8 passed, 1 warning in 2.31s"
    frontend = ("== npx vitest run\n \x1b[32m✓\x1b[39m src/a.test.ts (3 tests)\n Test Files  2 passed (2)\n      Tests  \x1b[32m5 passed\x1b[39m (5)\n"
                "== npm run build\n" + "\n".join(f"dist/asset-{n}.js" for n in range(40)))
    text = verify.summarise([verify.PartResult("web", "backend", True, backend), verify.PartResult("web", "frontend", True, frontend)])
    assert "tests: 8 passed, 1 warning in 2.31s" in text
    assert "tests: Tests  5 passed (5)" in text and "tests: Test Files  2 passed (2)" in text
    assert "dist/asset-0.js" not in text  # the tail stays short


def test_verify_without_arguments_prints_the_usage(py):
    assert run([py, str(REAL_ROOT / "factory/scripts/verify.py")], REAL_ROOT).returncode == 2


def test_an_apps_parts_file_selects_by_part_or_component(tmp_path, monkeypatch):
    import json

    parts = {"parts": [
        {"component": "web", "name": "backend", "runtime": "python", "image": "i", "cwd": "web/backend", "setup": [], "steps": ["a"]},
        {"component": "web", "name": "frontend", "runtime": "node", "image": "i", "cwd": "web/frontend", "setup": [], "steps": ["b"]},
        {"component": "core", "name": "core", "runtime": "python", "image": "i", "cwd": "core", "setup": [], "steps": ["c"]},
    ]}
    path = tmp_path / "verify.json"
    path.write_text(json.dumps(parts), encoding="utf-8")
    ran = []
    monkeypatch.setattr(verify, "run_part", lambda comp, part, where: ran.append((comp, part["name"], where)) or verify.PartResult(comp, part["name"], True, ""))
    assert len(verify.verify_parts_file(path)) == 3
    ran.clear()
    verify.verify_parts_file(path, "web")
    assert ran == [("web", "backend", tmp_path), ("web", "frontend", tmp_path)]
    with pytest.raises(verify.VerifyError, match="no part or component named 'zzz'"):
        verify.verify_parts_file(path, "zzz")


def test_secrets_are_never_copied_into_a_check():
    assert ".env" in verify.COPY_EXCLUDES and "backups" in verify.COPY_EXCLUDES
