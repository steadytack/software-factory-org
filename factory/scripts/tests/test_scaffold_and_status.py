"""scaffold.py and status.py: an idea's folder and state, an app from a template, the status table."""

import json
import re
import shutil

import factory_lib as lib
import pytest
import scaffold
import status
from conftest import REAL_ROOT, needs_templates, run


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


@needs_templates("static-site")
def test_an_app_is_copied_without_build_output_or_factory_files(repo):
    (repo / "templates/static-site/node_modules/x").mkdir(parents=True)
    (repo / "templates/static-site/node_modules/x/a.js").write_text("1", encoding="utf-8")
    (repo / "templates/static-site/.env").write_text("SECRET=1", encoding="utf-8")
    scaffold.new_idea("notes", "Notes", root=repo)
    app = scaffold.new_app("notes", "static-site", root=repo)
    assert (app / "package.json").exists() and (app / ".env.example").exists()
    assert not (app / "node_modules").exists() and not (app / ".env").exists()
    assert (app / "NOTES.md").exists() and (app / "standards/PRINCIPLES.md").exists()
    assert (app / "standards/ai-features.md").exists()
    assert (app / "STANDARDS.md").read_text(encoding="utf-8") == (repo / "factory/standards/stacks/static-site.md").read_text(encoding="utf-8")
    assert (app / ".git").exists() or shutil.which("git") is None
    assert lib.load_state("notes", repo)["template"] == "static-site"
    with pytest.raises(lib.FactoryError, match="not empty"):
        scaffold.new_app("notes", "static-site", root=repo)


@needs_templates("etl-pipeline")
def test_an_app_leaves_out_the_module_manifest(repo):
    scaffold.new_idea("pipe", "Pipe", root=repo)
    app = scaffold.new_app("pipe", "etl-pipeline", root=repo)
    assert not (app / "module.json").exists() and (app / "pyproject.toml").exists()


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
    ready = lib.ready_templates(repo)  # an instance has only the templates it chose
    template = "single-page-html" if "single-page-html" in ready else sorted(ready)[0]
    assert run([py, script, "app", "my-idea", template], repo).returncode == 0
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
