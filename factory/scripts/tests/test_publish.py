"""publish.py: a dry run that blocks on secrets and a missing licence, and creates nothing without typed confirmation."""

import shutil
import subprocess
from pathlib import Path

import publish
import pytest
from conftest import git_commit_all, run

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="needs git")
FIXTURE = Path(__file__).parent / "fixtures" / "brew-ratio"


@pytest.fixture
def app(repo: Path) -> Path:
    """A small committed app inside a copy of the scenario A idea (whose spec pack passes check_spec)."""
    (repo / "factory/context/scopes.json").unlink(missing_ok=True)  # the default publish settings, whatever this factory set
    idea = repo / "ideas" / "demo"
    shutil.copytree(FIXTURE, idea, ignore=shutil.ignore_patterns("traceability.md"))
    for name in ("state.json", "application-definition.md"):
        path = idea / name
        path.write_text(path.read_text(encoding="utf-8").replace('"slug": "brew-ratio"', '"slug": "demo"'), encoding="utf-8")
    folder = idea / "app"
    (folder / ".github" / "workflows").mkdir(parents=True)
    (folder / ".github/workflows/ci.yml").write_text("name: CI\n", encoding="utf-8")
    (folder / ".gitignore").write_text(".env\nnode_modules/\n", encoding="utf-8")
    (folder / "README.md").write_text("# Demo\n\n## Run it\nstart it.\n\n## Tests\nrun the tests.\n", encoding="utf-8")
    (folder / "main.py").write_text("print('hello')\n", encoding="utf-8")
    git_commit_all(folder)
    return folder


def publish_cmd(repo, py, *flags):
    return run([py, str(repo / "factory/scripts/publish.py"), "demo", *flags], repo)


def report(repo) -> str:
    return (repo / "ideas/demo/publish-report.md").read_text(encoding="utf-8")


def test_a_missing_licence_blocks_and_fix_adds_one(repo, py, app):
    first = publish_cmd(repo, py)
    assert first.returncode == 1 and "no LICENSE" in report(repo)
    fixed = publish_cmd(repo, py, "--fix")
    assert (app / "LICENSE").read_text(encoding="utf-8").startswith("MIT License")
    assert fixed.returncode == 0 and "## Blockers (0)" in report(repo)
    assert "LICENSE (MIT) created by --fix" in report(repo)


def test_a_scope_that_publishes_proprietary_gets_a_proprietary_licence(repo, py, app):
    (repo / "factory/context/scopes.json").write_text(
        '{"schema_version": 1, "group": {"name": "G", "publish": {"licence": "proprietary", "copyright": "Group Ltd"}}}', encoding="utf-8")
    assert publish_cmd(repo, py, "--fix").returncode == 0
    assert (app / "LICENSE").read_text(encoding="utf-8").startswith(f"Copyright (c) {__import__('datetime').date.today().year} Group Ltd")
    assert "LICENSE (proprietary) created by --fix" in report(repo)


def test_create_uses_the_scope_owner_instead_of_the_signed_in_user(app, monkeypatch):
    calls = []

    def fake_run(args, **_kw):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, stdout="me\n", stderr="")

    monkeypatch.setattr(publish.subprocess, "run", fake_run)
    monkeypatch.setattr(publish, "record_app", lambda *a, **k: None)
    monkeypatch.setattr(publish, "git", lambda *a, **k: subprocess.CompletedProcess(a, 0, stdout="", stderr=""))
    assert publish.create("demo", app, public=False, ask=lambda _p: "demo", owner="group-org") == 0
    assert any(c[:3] == ["gh", "repo", "create"] and c[3] == "group-org/demo" for c in calls)


def test_the_spec_is_copied_into_the_app_and_nothing_is_pushed(repo, py, app):
    publish_cmd(repo, py, "--fix")
    assert (app / "docs/spec/01-overview.md").exists()
    assert subprocess.run(["git", "remote"], cwd=app, capture_output=True, text=True).stdout.strip() == ""


def test_a_tracked_env_file_blocks(repo, py, app):
    (app / ".env").write_text("SECRET=1\n", encoding="utf-8")
    subprocess.run(["git", "add", "-f", ".env"], cwd=app, check=True, capture_output=True)
    assert publish_cmd(repo, py, "--fix").returncode == 1
    assert "secret-looking files tracked: .env" in report(repo)


def test_a_known_secret_pattern_blocks_and_is_not_printed(repo, py, app):
    (app / "settings.py").write_text('KEY = "AKIAABCDEFGHIJKLMNOP"\n', encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=app, check=True, capture_output=True)
    result = publish_cmd(repo, py, "--fix")
    assert result.returncode == 1 and "secrets in the tree: AWS key in settings.py" in report(repo)
    assert "AKIAABCDEFGHIJKLMNOP" not in report(repo) + result.stdout


def test_a_personal_email_and_a_machine_path_are_warnings_not_blockers(repo, py, app):
    (app / "notes.txt").write_text("mail me at someone@gmail.com, see C:\\Users\\me\\x\n", encoding="utf-8")
    subprocess.run(["git", "add", "-A"], cwd=app, check=True, capture_output=True)
    publish_cmd(repo, py, "--fix")
    text = report(repo)
    assert "personal email addresses in: notes.txt" in text and "machine-specific paths in: notes.txt" in text
    assert "## Blockers (0)" in text


def test_the_spec_check_is_reported_as_not_run_when_there_is_no_checker(repo, py, app):
    (repo / "factory/scripts/check_spec.py").unlink(missing_ok=True)
    publish_cmd(repo, py, "--fix")
    assert "spec check not run" in report(repo)


def test_create_without_a_clean_report_does_nothing(repo, py, app):
    result = publish_cmd(repo, py, "--create")  # no licence yet: blocked before any prompt
    assert result.returncode == 1 and "Not creating" in result.stderr


def test_create_needs_the_name_typed_and_public_needs_the_word(monkeypatch, app):
    calls = []

    def fake_run(args, **kwargs):
        calls.append(args)
        return subprocess.CompletedProcess(args, 0, stdout="owner\n", stderr="")

    monkeypatch.setattr(publish.subprocess, "run", fake_run)
    assert publish.create("demo", app, public=False, ask=lambda _p: "wrong") == 1
    assert not any("repo" in a for a in calls)
    answers = iter(["demo", "yes"])
    assert publish.create("demo", app, public=True, ask=lambda _p: next(answers)) == 1
    assert not any("create" in a for a in calls)
    assert publish.create("demo", app, public=False, ask=lambda _p: "demo") == 0
    created = [a for a in calls if "create" in a]
    assert created and "--private" in created[0]


def test_unknown_flags_print_the_usage(repo, py):
    assert publish_cmd(repo, py, "--push").returncode == 2
