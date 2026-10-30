"""instance.py: create an organisation's factory from the engine, check it, fill it in, update it."""

import json
import re
import shutil

import instance
import pytest
from conftest import REAL_ROOT, needs_templates, run

# Instances are made from the engine repo, which holds the starter set; an instance itself does not.
pytestmark = pytest.mark.skipif(not (REAL_ROOT / instance.STARTER).is_dir(), reason="no starter set: this is an instance")


def check(dest, py):
    return run([py, str(dest / "factory/scripts/check_factory.py")], dest)


def fill_in(dest):
    policies = dest / "factory/context/group/policies.md"
    text = re.sub(r"\{\{yes or no\}\}", "yes", policies.read_text(encoding="utf-8"))
    policies.write_text(re.sub(r"\{\{[^}]*\}\}", "none", text), encoding="utf-8")
    path = dest / "factory/context/scopes.json"
    reg = json.loads(path.read_text(encoding="utf-8"))
    reg["group"]["approvers"] = {"gates": ["A. Person"], "catalogue": ["A. Person"]}
    reg["group"]["publish"].update(owner="example-group", copyright="Example Group Ltd")
    path.write_text(json.dumps(reg, indent=2), encoding="utf-8")


def engine_copy(tmp_path):
    """A second engine to update from: the engine files, the registry, the starter set and the catalogue."""
    src = tmp_path / "engine"
    man = instance.manifest(REAL_ROOT)
    for rel, path in instance.engine_files(REAL_ROOT, man).items():
        (src / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(path, src / rel)
    for rel in ("factory/templates.json", "factory/engine.json"):
        shutil.copy(REAL_ROOT / rel, src / rel)
    shutil.copytree(REAL_ROOT / "catalogue" / "assets", src / "catalogue" / "assets")
    return src


def snapshot(dest):
    """Every content file (not engine) in the instance and its bytes."""
    engine = set(json.loads((dest / "factory/instance.json").read_text(encoding="utf-8"))["files"])
    return {p.relative_to(dest).as_posix(): p.read_bytes() for p in dest.rglob("*")
            if p.is_file() and ".git" not in p.relative_to(dest).parts
            and p.relative_to(dest).as_posix() not in engine and p.name != "instance.json"}


def test_create_reports_placeholders_until_filled(tmp_path, py):
    dest = tmp_path / "org"
    record = instance.create(REAL_ROOT, dest, "Example Group", [], who="A. Person")
    assert record["engine"]["version"] == (REAL_ROOT / "VERSION").read_text(encoding="utf-8").strip()
    assert (dest / ".git").is_dir() and (dest / "SETUP.md").exists()
    assert not (dest / "factory/context/about-me.md").exists() and (dest / "factory/context/group/team.md").exists()
    assert "Example Group" in (dest / "README.md").read_text(encoding="utf-8")
    assert not list((dest / "catalogue/assets").glob("*.json")) and not (dest / "templates").exists()
    assert not list((dest / "ideas").glob("*/state.json"))
    assert "factory/context/environment.md" in (dest / ".gitignore").read_text(encoding="utf-8")
    policies = (dest / "factory/context/group/policies.md").read_text(encoding="utf-8")
    assert all(f"| POL-{n:02d} |" in policies for n in range(1, 12))

    done = check(dest, py)
    assert done.returncode == 1
    assert "factory/context/scopes.json: group/publish/owner: fill in {{GitHub organisation}}" in done.stdout
    assert "factory/context/group/policies.md:24: fill in {{yes or no}}" in done.stdout
    assert "missing" not in done.stdout  # the layered context files stand in for the flat ones

    fill_in(dest)
    done = check(dest, py)
    assert done.returncode == 0, done.stdout
    assert "check_factory: OK" in done.stdout


@needs_templates("streamlit-app")
def test_create_with_templates_brings_their_entries(tmp_path, py):
    dest = tmp_path / "org"
    instance.create(REAL_ROOT, dest, "Example Group", ["streamlit-app"], who="A. Person")
    reg = json.loads((dest / "factory/templates.json").read_text(encoding="utf-8"))
    assert [t["name"] for t in reg["templates"]] == ["streamlit-app"]
    assert (dest / "templates/streamlit-app/README.md").exists()
    assert [p.name for p in (dest / "factory/standards/stacks").iterdir()] == ["streamlit-app.md"]
    assert (dest / ".github/workflows/streamlit-app.yml").exists() and not (dest / ".github/workflows/web-app.yml").exists()
    entries = [json.loads(p.read_text(encoding="utf-8")) for p in (dest / "catalogue/assets").glob("*.json")]
    assert {e["type"] for e in entries} == {"template", "module"}
    for e in entries:
        assert e["licence"].startswith("MIT, contributed to Example Group by A. Person")
        assert e["history"][-1]["by"] == "A. Person" and "MIT" in e["history"][-1]["note"]
    assert "`streamlit-app`" in (dest / "factory/stages/analyse.md").read_text(encoding="utf-8")
    assert "`web-app`" not in (dest / "README.md").read_text(encoding="utf-8")
    fill_in(dest)
    done = check(dest, py)
    assert done.returncode == 0, done.stdout


def test_create_refuses_a_non_empty_folder_or_unknown_template(tmp_path):
    (tmp_path / "full").mkdir()
    (tmp_path / "full" / "x.txt").write_text("x", encoding="utf-8")
    for dest, templates in ((tmp_path / "full", []), (tmp_path / "new", ["no-such-template"])):
        try:
            instance.create(REAL_ROOT, dest, "Example Group", templates)
        except instance.lib.FactoryError:
            continue
        raise AssertionError(f"create {dest} {templates} should have been refused")


@needs_templates("single-page-html")
def test_update_copies_the_engine_and_leaves_content(tmp_path, py, capsys):
    dest = tmp_path / "org"
    instance.create(REAL_ROOT, dest, "Example Group", ["single-page-html"], who="A. Person")
    fill_in(dest)
    (dest / "factory/context/group/business-context.md").write_text("# Our context\n", encoding="utf-8")
    before = snapshot(dest)

    src = engine_copy(tmp_path)
    (src / "factory/stages/build.md").write_text("# Build (newer engine)\n", encoding="utf-8")
    (src / "factory/scripts/new_tool.py").write_text("print('new')\n", encoding="utf-8")
    (src / "factory/audits/ui-polish.md").unlink()

    assert instance.update(src, dest, ask=lambda _: "no") == 1
    assert (dest / "factory/audits/ui-polish.md").exists() and not (dest / "factory/scripts/new_tool.py").exists()
    out = capsys.readouterr().out
    for line in ("changed  factory/stages/build.md", "added    factory/scripts/new_tool.py", "removed  factory/audits/ui-polish.md"):
        assert line in out
    assert "factory/context" not in out and "catalogue/assets" not in out

    assert instance.update(src, dest, ask=lambda _: "update") == 0
    assert (dest / "factory/stages/build.md").read_text(encoding="utf-8") == "# Build (newer engine)\n"
    assert (dest / "factory/scripts/new_tool.py").exists() and not (dest / "factory/audits/ui-polish.md").exists()
    assert snapshot(dest) == before
    assert "check_factory: OK" in capsys.readouterr().out
    _files, found = instance.changes(src, dest)
    assert found == []
