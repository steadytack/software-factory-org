"""scaffold.py and status.py: an idea's folder and state, an app from a template, the status table."""

import json
import re
import shutil

import factory_lib as lib
import pipeline
import pytest
import scaffold
import scopes
import status
from conftest import REAL_ROOT, run


def test_a_new_idea_has_its_files_and_a_valid_state(repo):
    idea = scaffold.new_idea("tide-times", "Tide times", root=repo)
    for rel in ("idea.md", "idea-brief.md", "assessment.md", "decisions.md", "changes.md", "state.json"):
        assert (idea / rel).exists(), rel
    for sub in ("gates", "source", "spec"):
        assert (idea / sub).is_dir()
    state = lib.read_json(idea / "state.json")
    assert lib.validate("state", state, repo) == []
    assert (state["stage"], state["status"], state["kind"]) == ("develop", "in-progress", "app")
    assert state["factory_version"] == (repo / "VERSION").read_text(encoding="utf-8").strip()
    assert all(g["status"] == "not-reached" for g in state["gates"].values())
    assert "# Tide times" in (idea / "idea.md").read_text(encoding="utf-8")


@pytest.mark.parametrize("slug", ["Tide", "1tide", "tide_times", ""])
def test_a_bad_slug_is_refused(repo, slug):
    with pytest.raises(lib.FactoryError, match="slug"):
        scaffold.new_idea(slug, "x", root=repo)


def test_an_existing_idea_is_not_overwritten(repo):
    scaffold.new_idea("tide-times", "Tide times", root=repo)
    with pytest.raises(lib.FactoryError, match="already exists"):
        scaffold.new_idea("tide-times", "Again", root=repo)


def test_an_unknown_or_removed_template_is_refused(repo):
    reg = repo / "factory/templates.json"
    data = json.loads(reg.read_text(encoding="utf-8"))
    data["templates"].append({"name": "old-tool", "status": "deprecated", "deprecated": "2026-01-01", "reason": "test"})
    reg.write_text(json.dumps(data), encoding="utf-8")
    scaffold.new_idea("x", "X", root=repo)
    for name in ("nope", "old-tool"):
        with pytest.raises(lib.FactoryError, match="not a ready template"):
            scaffold.new_app("x", name, root=repo)


def test_the_exclusion_rules():
    assert scaffold.excluded("node_modules/a/b.js") and scaffold.excluded("src/__pycache__/x.pyc")
    assert scaffold.excluded("module.json") and not scaffold.excluded("src/module.json")
    assert scaffold.excluded(".env") and not scaffold.excluded(".env.example")
    assert scaffold.excluded("audits/runs/x.md") and not scaffold.excluded("src/audits/runs/x.md")


def test_the_command_line(repo, py):
    script = str(repo / "factory/scripts/scaffold.py")
    assert run([py, script, "new", "my-idea", "--name", "My idea"], repo).returncode == 0
    assert run([py, script, "new", "my-idea", "--name", "Again"], repo).returncode == 1
    assert run([py, script, "app", "my-idea", "web-app"], repo).returncode == 0
    assert (repo / "ideas/my-idea/app/README.md").exists()
    assert run([py, script], repo).returncode == 2


def test_status_lists_ideas_and_flags_broken_state(repo, py):
    scaffold.new_idea("alpha", "Alpha", root=repo)
    (repo / "ideas/broken").mkdir()
    (repo / "ideas/broken/state.json").write_text(json.dumps({"slug": "broken", "stage": "spec"}), encoding="utf-8")
    (repo / "ideas/empty").mkdir()
    rows = {r["slug"]: r for r in status.collect(repo)}
    assert rows["alpha"]["stage"] == "develop" and rows["alpha"]["gates_line"] == "1:- 2:- 3:- 4:-"
    assert rows["broken"]["status"].startswith("invalid state.json")
    assert rows["empty"]["status"] == "no state.json"
    out = run([py, str(repo / "factory/scripts/status.py"), "--write"], repo)
    assert out.returncode == 0 and "| alpha | app | develop |" in out.stdout
    assert re.search(r"\| alpha \|", (repo / "ideas/README.md").read_text(encoding="utf-8"))


def test_a_scope_that_is_not_an_object_is_a_problem_not_a_crash(repo, py):
    scaffold.new_idea("alpha", "Alpha", root=repo)
    path = repo / "ideas/alpha/state.json"
    path.write_text(json.dumps({**json.loads(path.read_text(encoding="utf-8")), "scope": "group"}), encoding="utf-8")
    assert pipeline.idea_scope({"scope": "group"}, {"entries": []}, "alpha") == "group"
    with pytest.raises(lib.FactoryError, match="an object"):
        scopes.idea_scope({"scope": "group"})
    out = run([py, str(repo / "factory/scripts/status.py")], repo)
    assert out.returncode == 0 and "invalid state.json: scope" in out.stdout
    checked = run([py, str(repo / "factory/scripts/check_factory.py")], repo)
    assert checked.returncode == 1 and "Traceback" not in checked.stderr and "ideas/alpha/state.json: scope" in checked.stdout
    context = run([py, str(repo / "factory/scripts/scopes.py"), "context", "alpha"], repo)
    assert context.returncode == 1 and "an object" in context.stderr


def test_status_with_no_ideas(repo, py):
    for folder in (repo / "ideas").iterdir():
        if folder.is_dir():
            shutil.rmtree(folder)
    assert "(no ideas yet)" in run([py, str(repo / "factory/scripts/status.py")], repo).stdout


def test_saving_an_invalid_state_is_refused(repo):
    scaffold.new_idea("alpha", "Alpha", root=repo)
    state = lib.load_state("alpha", repo)
    state["stage"] = "shape"
    with pytest.raises(lib.FactoryError, match="would be invalid"):
        lib.save_state("alpha", state, repo)


def test_real_ideas_folder_has_status_markers():
    text = (REAL_ROOT / "ideas/README.md").read_text(encoding="utf-8")
    assert status.START in text and status.END in text


def test_cycle_times_come_from_the_dates_already_recorded(repo):
    entries = [{"id": f"IDEA-00{n}", "title": s, "idea": s, "source": "inbox", "added": "2026-10-01", "slug": s}
               for n, s in enumerate(["swap-board", "route-plan", "new-one"], start=1)]
    (repo / "ideas/pipeline.json").write_text(json.dumps({"schema_version": 1, "entries": entries}), encoding="utf-8")
    rows = [
        {"slug": "swap-board", "route": "light", "gates": {"1": {"status": "approved", "date": "2026-10-05"}},
         "light": {"result": "keep", "date": "2026-10-10", "reply": "keep"}},
        {"slug": "route-plan", "gates": {"1": {"status": "approved", "date": "2026-10-11"},
                                         "3": {"status": "approved", "date": "2026-11-10"}}},
        {"slug": "new-one", "gates": {}},
    ]
    times = {t["slug"]: t for t in status.cycle_times(rows, repo)}
    assert (times["swap-board"]["to_gate1"], times["swap-board"]["gate1_to_gate3"]) == (4, 5)
    assert (times["route-plan"]["to_gate1"], times["route-plan"]["gate1_to_gate3"]) == (10, 30)
    assert times["new-one"]["to_gate1"] is None
    times["swap-board"]["timebox_weeks"] = 1
    line = status.cycle_line(list(times.values()))
    assert line == ("Cycle times: capture to Gate 1, median 7 days over 2 idea(s); Gate 1 to Gate 3, median 17.5 days over 2; "
                    "1 of 1 spike(s) within their time box")
    assert status.cycle_line([times["new-one"]]) is None


class FakeGh:
    """Stands in for subprocess.run calling `gh run list`."""

    def __init__(self, stdout: str = "", returncode: int = 0, stderr: str = "", error: Exception | None = None):
        self.out, self.code, self.err, self.error, self.args = stdout, returncode, stderr, error, None

    def __call__(self, args, **kwargs):
        self.args = args
        if self.error:
            raise self.error
        return type("Done", (), {"stdout": self.out, "returncode": self.code, "stderr": self.err})()


RUNS = json.dumps([
    {"workflowName": "Dependency Graph", "conclusion": "success", "headSha": "c5f52f1aa", "createdAt": "2026-11-06T13:00:00Z"},
    {"workflowName": "CI", "conclusion": "failure", "headSha": "2179a9bbb", "createdAt": "2026-11-05T10:00:00Z"},
    {"workflowName": "CI", "conclusion": "success", "headSha": "1111111cc", "createdAt": "2026-10-27T10:00:00Z"},
])


def test_ci_shows_each_workflows_latest_run_and_flags_a_red_one():
    """An app's CI can fail on every push while GitHub's own workflow stays green."""
    gh = FakeGh(RUNS)
    line = status.ci_line("app", "owner/app", gh)
    assert gh.args[:5] == ["gh", "run", "list", "-R", "owner/app"]
    assert "CI failure on 2179a9b (2026-11-05)" in line and "Dependency Graph success on c5f52f1" in line
    assert line.endswith("<-- not green")
    green = json.dumps([{"workflowName": "CI", "conclusion": "success", "headSha": "abc1234", "createdAt": "2026-11-06"}])
    assert not status.ci_line("app", "owner/app", FakeGh(green)).endswith("<-- not green")


def test_ci_says_when_it_could_not_be_read():
    assert "CI not read (FileNotFoundError" in status.ci_line("app", "o/r", FakeGh(error=FileNotFoundError()))
    assert "CI not read (gh: HTTP 404" in status.ci_line("app", "o/r", FakeGh(returncode=1, stderr="HTTP 404: Not Found\n"))
    assert status.ci_line("app", "o/r", FakeGh("[]")) == "app: no CI runs on o/r"
    assert status.ci_lines([{"slug": "a"}, {"slug": "b", "app": {"repo": "o/b"}}], FakeGh("[]")) == ["b: no CI runs on o/b"]


class FakeDocker:
    """Stands in for subprocess.run calling `docker compose` and `git ls-files` for `status.py --stack`."""

    def __init__(self, services: dict, running: list[dict], created: dict[str, str], files: list[str]):
        self.services, self.running, self.created, self.files = services, running, created, files

    def __call__(self, args, **kwargs):
        out, code = "", 0
        if args[:3] == ["docker", "compose", "config"]:
            out = json.dumps({"services": self.services})
        elif args[:3] == ["docker", "compose", "ps"]:
            out = "\n".join(json.dumps(c) for c in self.running)
        elif args[:3] == ["docker", "image", "inspect"]:
            out, code = (self.created[args[-1]], 0) if args[-1] in self.created else ("", 1)
        elif args[:2] == ["git", "ls-files"]:
            out = "\n".join(self.files)
        return type("Done", (), {"stdout": out, "returncode": code, "stderr": ""})()


def _stack(tmp_path, built: str, running_image: str = "app-backend"):
    import os
    app = tmp_path / "app"
    (app / "backend").mkdir(parents=True)
    (app / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
    source = app / "backend" / "main.py"
    source.write_text("x = 1\n", encoding="utf-8")
    changed = 1_793_000_000  # 2026-10-26 07:33 UTC
    os.utime(source, (changed, changed))
    docker = FakeDocker(
        {"backend": {"build": {"context": str(app / "backend")}}, "db": {"image": "postgres:17"}},
        [{"Service": "backend", "Image": running_image, "State": "running"}, {"Service": "db", "Image": "postgres:17", "State": "running"}],
        {"app-backend": built}, ["main.py"])
    return app, docker


def test_stack_flags_an_image_built_before_its_sources_changed(tmp_path):
    """Passing tests do not change what the running build shows: a change looked at on the old build looks undone."""
    app, docker = _stack(tmp_path, "2026-10-26T07:00:00.123456789Z")
    line = status.stack_line("demo", app, docker)
    assert "old build" in line and "backend built 2026-10-26 07:00, main.py changed 2026-10-26 07:33" in line
    app, docker = _stack(tmp_path / "later", "2026-10-26T08:00:00Z")
    assert status.stack_line("demo", app, docker) == "demo: stack current (backend)"  # the pulled db is not judged


def test_stack_flags_a_container_whose_image_tag_moved_on(tmp_path):
    app, docker = _stack(tmp_path, "2026-10-26T08:00:00Z", running_image="sha256:0123abcd")
    assert "backend runs an image its tag no longer points to" in status.stack_line("demo", app, docker)


def test_stack_says_when_it_could_not_be_read(tmp_path):
    app, _ = _stack(tmp_path, "2026-10-26T08:00:00Z")
    assert "stack not read (FileNotFoundError" in status.stack_line("demo", app, FakeGh(error=FileNotFoundError()))
    assert status.stack_line("demo", app, FakeDocker({}, [], {}, [])) == "demo: stack not running"
    assert "no compose file" in status.stack_line("demo", tmp_path / "missing", FakeGh())
