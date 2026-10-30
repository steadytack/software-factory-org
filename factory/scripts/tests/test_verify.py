"""verify.py: a template's checks, from the registry, in clean containers (the container runs are slow tests)."""

import os
import shutil
from pathlib import Path

import pytest
import verify
from conftest import REAL_ROOT, needs_templates, run

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


@needs_templates("web-app", "static-site")
def test_verify_knows_which_templates_it_can_run():
    assert [p["name"] for p in verify.template_parts("web-app")] == ["backend", "frontend"]
    with pytest.raises(verify.VerifyError, match="not a ready template"):
        verify.template_parts("no-such-template")
    with pytest.raises(verify.VerifyError, match="no verify part named 'zzz'"):
        verify.verify_template("c", "static-site", Path("."), only="zzz")


def test_the_summary_reports_each_part_and_the_total():
    text = verify.summarise([verify.PartResult("a", "p", True, "1 passed"), verify.PartResult("b", "q", False, "2 failed")])
    assert "OK     a: p" in text and "FAILED b: q" in text and "verify: FAILED (1 of 2 parts)" in text


def test_verify_without_arguments_prints_the_usage(py):
    assert run([py, str(REAL_ROOT / "factory/scripts/verify.py")], REAL_ROOT).returncode == 2


@pytest.mark.skipif(
    shutil.which("docker") is None or not os.environ.get("FACTORY_SLOW"),
    reason="set FACTORY_SLOW=1 (and have Docker) to run a template's checks in containers",
)
def test_the_single_page_template_passes_its_own_checks():
    results = verify.verify_template("single-page-html", "single-page-html", REAL_ROOT / "templates/single-page-html")
    assert all(r.ok for r in results), verify.summarise(results)


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
