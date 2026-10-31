"""check_factory.py: the registry, schemas, context, ideas and catalogue must agree."""

import json
import shutil

from conftest import REAL_ROOT, needs_templates, run


def check(repo, py, *extra):
    return run([py, str(repo / "factory/scripts/check_factory.py"), "--root", str(repo), *extra], repo)


def edit_registry(repo, change):
    path = repo / "factory/templates.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    change(data)
    path.write_text(json.dumps(data), encoding="utf-8")


def entry(**overrides):
    base = {
        "schema_version": 1, "id": "CAT-900", "name": "Demo", "purpose": "A test asset", "type": "module",
        "tags": ["demo"], "version": "1.0.0", "status": "imported", "source": {"ref": "factory/README.md"},
        "licence": "unknown", "dependencies": [], "interfaces": [], "evidence": [], "risks": [], "limitations": [],
        "history": [{"date": "2026-10-19", "status": "imported", "by": "test"}],
    }
    return {**base, **overrides}


def write_entry(repo, data, name=None):
    path = repo / "catalogue/assets" / f"{name or data['id']}.json"
    path.write_text(json.dumps(data), encoding="utf-8")


def test_the_real_factory_is_consistent(py):
    result = run([py, str(REAL_ROOT / "factory/scripts/check_factory.py")], REAL_ROOT)
    assert result.returncode == 0, result.stdout


@needs_templates("single-page-html", "static-site", "streamlit-app")
def test_registry_problems_are_reported(repo, py):
    def change(data):
        ready = [t for t in data["templates"] if t["status"] == "ready"]
        del ready[0]["version"]
        ready[1]["deployment"] = ["cloud"]
        ready[2]["verify"] = []
    edit_registry(repo, change)
    out = check(repo, py).stdout
    assert "missing field 'version'" in out
    assert "deployment ['cloud'] not in" in out
    assert "'verify' must be a non-empty list" in out


def deprecate(repo, name="old-tool"):
    edit_registry(repo, lambda d: d["templates"].append({"name": name, "status": "deprecated", "deprecated": "2026-01-01", "reason": "test"}))


def test_a_deprecated_template_folder_and_an_unlisted_folder_are_reported(repo, py):
    deprecate(repo)
    (repo / "templates/old-tool").mkdir()
    (repo / "templates/stray").mkdir()
    out = check(repo, py).stdout
    assert "templates/old-tool: exists, but template 'old-tool' is deprecated" in out
    assert "templates/stray: not in templates.json" in out


def test_missing_context_files_and_lenses_are_reported(repo, py):
    for rel in ("policies.md", "group/policies.md"):  # flat here, layered in an instance
        (repo / "factory/context" / rel).unlink(missing_ok=True)
    (repo / "factory/context/lenses/security.md").unlink()
    out = check(repo, py).stdout
    assert "factory/context/policies.md or group/policies.md: missing" in out and "lenses/security.md: missing" in out


def test_an_invalid_schema_stops_the_check(repo, py):
    path = repo / "factory/schemas/state.schema.json"
    path.write_text(json.dumps({"type": "nonsense"}), encoding="utf-8")
    assert "state.schema.json: not a valid schema" in check(repo, py).stdout


def test_an_invalid_idea_state_is_reported(repo, py):
    idea = repo / "ideas/demo"
    idea.mkdir()
    (idea / "state.json").write_text(json.dumps({"schema_version": 1, "slug": "other", "stage": "shape"}), encoding="utf-8")
    out = check(repo, py).stdout
    assert "ideas/demo/state.json:" in out and "'shape' is not one of" in out
    assert "does not match the folder" in out


def test_catalogue_entries_are_validated(repo, py):
    write_entry(repo, entry())
    assert check(repo, py).returncode == 0
    write_entry(repo, entry(id="CAT-901", status="approved", history=[{"date": "2026-10-19", "status": "approved", "by": "t"}]))
    write_entry(repo, entry(id="CAT-902"), name="CAT-999")
    write_entry(repo, entry(id="CAT-903", source={"ref": "templates/nowhere"}, parent="CAT-404"))
    write_entry(repo, entry(id="CAT-904", status="validated"))
    write_entry(repo, {"id": "CAT-905"})
    out = check(repo, py).stdout
    assert "CAT-901.json: approved without any passed evidence" in out
    assert "CAT-999.json: id CAT-902 does not match the file name" in out
    assert "source templates/nowhere does not exist" in out
    assert "refers to CAT-404, which is not in the catalogue" in out
    assert "CAT-904.json: status validated differs from the last history entry" in out
    assert "CAT-905.json: (top): 'schema_version' is a required property" in out


def test_a_source_record_must_name_catalogued_candidates(repo, py):
    folder = repo / "catalogue/sources/SRC-900"
    folder.mkdir(parents=True)
    record = {"schema_version": 1, "id": "SRC-900", "kind": "folder", "origin": "x", "received": "2026-10-19",
              "candidates": ["CAT-777"], "inspected": [], "unverified": []}
    (folder / "source.json").write_text(json.dumps(record), encoding="utf-8")
    assert "candidate CAT-777 is not in the catalogue" in check(repo, py).stdout


def test_the_generated_table_is_checked_and_fixed(repo, py):
    edit_registry(repo, lambda d: d["templates"][0].update(readme_for="something else"))
    assert "out of date with templates.json" in check(repo, py).stdout
    assert "regenerated the template table in README.md" in check(repo, py, "--fix").stdout
    assert check(repo, py).returncode == 0
    assert "something else" in (repo / "README.md").read_text(encoding="utf-8")


def test_a_removed_template_name_in_current_docs_is_reported(repo, py):
    deprecate(repo)
    (repo / "factory/standards/extra.md").write_text("Use old-tool for this.", encoding="utf-8")
    assert "factory/standards/extra.md: mentions the removed template 'old-tool'" in check(repo, py).stdout


@needs_templates("agent")
def test_module_manifests_are_checked(repo, py):
    path = repo / "templates/agent/module.json"
    man = json.loads(path.read_text(encoding="utf-8"))
    man["modules"]["tools"]["paths"][0]["from"] = "src/agent_app/nowhere"
    man["modules"]["agent"]["needs"].append("ghost")
    path.write_text(json.dumps(man), encoding="utf-8")
    out = check(repo, py).stdout
    assert "src/agent_app/nowhere does not exist" in out and "needs unknown module ghost" in out


@needs_templates("agent")
def test_a_missing_workflow_and_stack_file_are_reported(repo, py):
    (repo / ".github/workflows/agent.yml").unlink()
    shutil.move(repo / "factory/standards/stacks/agent.md", repo / "factory/standards/agent-stack.md")
    out = check(repo, py).stdout
    assert ".github/workflows/agent.yml: missing" in out and "stacks/agent.md: missing" in out


def test_a_share_path_that_matches_no_file_is_reported(repo, py):
    path = repo / "factory/web/share.json"
    rules = json.loads(path.read_text(encoding="utf-8"))
    rules["factory"].append("docs/nowhere.md")
    path.write_text(json.dumps(rules), encoding="utf-8")
    assert "factory/web/share.json: 'docs/nowhere.md' matches no file" in check(repo, py).stdout
