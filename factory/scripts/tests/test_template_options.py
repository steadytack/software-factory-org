"""Optional template features: markers, choices, and scaffold removing what the owner turned off."""

from __future__ import annotations

import json
import re

import check_factory
import pytest
import scaffold
import template_options as o

ENTRY = {
    "options": [
        {"id": "share", "kind": "feature", "label": "Share", "default": True, "files": ["Share.tsx"]},
        {"id": "guides", "kind": "feature", "label": "Guides", "default": True},
        {"id": "feedback", "kind": "feature", "label": "Feedback", "default": True},
        {"id": "help", "kind": "group", "label": "Help", "on_if_any": ["guides", "feedback"], "files": ["help"]},
        {"id": "route", "kind": "route", "label": "Route", "default": "email:", "env": "ROUTE", "needs": "feedback"},
    ]
}

SOURCE = """import a;
// feature:share:start
import Share;
// feature:share:end
{/* feature:help:start */}
<Help>
  {/* feature:feedback:start */}
  Help &amp; feedback
  {/* feature:feedback:else */}
  {/* Help */}
  {/* feature:feedback:end */}
</Help>
{/* feature:help:end */}
end;
"""


def test_defaults_keep_every_block_and_drop_the_markers():
    out = o.strip_text(SOURCE, o.resolve(ENTRY, {}))
    assert "feature:" not in out
    assert "import Share;" in out and "Help &amp; feedback" in out
    assert "{/* Help */}" not in out and "  Help\n" not in out


def test_an_else_block_is_uncommented_when_its_feature_is_off():
    out = o.strip_text(SOURCE, o.resolve(ENTRY, {"feedback": False}))
    assert "Help &amp; feedback" not in out
    assert "  Help\n" in out


def test_a_group_goes_when_all_its_features_are_off():
    values = o.resolve(ENTRY, {"guides": False, "feedback": False, "share": False})
    assert values["help"] is False and values["route"] is None
    out = o.strip_text(SOURCE, values)
    assert out == "import a;\nend;\n"


@pytest.mark.parametrize(
    "chosen, message",
    [
        ({"nope": True}, "unknown template option"),
        ({"share": "yes"}, "true or false"),
        ({"route": "slack"}, "email:<address>"),
        ({"route": "email:not-an-address"}, "email:<address>"),
    ],
)
def test_bad_choices_are_refused(chosen, message):
    with pytest.raises(o.OptionError, match=re.escape(message)):
        o.resolve(ENTRY, chosen)


def test_routes_take_an_address_store_or_off():
    for value in ("email:team@example.com", "email:", "store", "off"):
        assert o.resolve(ENTRY, {"route": value})["route"] == value


@pytest.mark.parametrize(
    "text, message",
    [
        ("// feature:share:start\nx\n", "never closed"),
        ("// feature:share:end\n", "does not close"),
        ("// feature:share:start\n// feature:help:end\n", "does not close"),
        ("// feature:ghost:start\n// feature:ghost:end\n", "undeclared option 'ghost'"),
    ],
)
def test_broken_markers_are_reported(text, message):
    with pytest.raises(o.OptionError, match=re.escape(message)):
        o.strip_text(text, o.resolve(ENTRY, {}), "f.tsx")


def test_apply_deletes_the_files_of_what_is_off_and_writes_routes(tmp_path):
    (tmp_path / "Share.tsx").write_text("x", encoding="utf-8")
    (tmp_path / "help").mkdir()
    (tmp_path / "help" / "a.tsx").write_text("x", encoding="utf-8")
    (tmp_path / "App.tsx").write_text(SOURCE, encoding="utf-8")
    (tmp_path / ".env.example").write_text("A=1\nROUTE=\n", encoding="utf-8")
    o.apply(tmp_path, ENTRY, {"share": False, "route": "email:team@example.com"})
    assert not (tmp_path / "Share.tsx").exists()
    assert (tmp_path / "help" / "a.tsx").exists()
    assert "import Share" not in (tmp_path / "App.tsx").read_text(encoding="utf-8")
    assert (tmp_path / ".env.example").read_text(encoding="utf-8") == "A=1\nROUTE=email:team@example.com\n"


def test_the_real_templates_options_and_markers_are_consistent():
    registry = json.loads((check_factory.lib.ROOT / "factory" / "templates.json").read_text(encoding="utf-8"))
    errors: list[str] = []
    check_factory.check_options(check_factory.lib.ROOT, registry, errors)
    assert errors == []
    web = next(t for t in registry["templates"] if t["name"] == "web-app")
    assert {"share", "theme", "help.guides", "help.feedback", "feedback.problem"} <= set(o.declared(web))


def test_check_factory_flags_a_marker_with_no_declared_option(repo):
    page = repo / "templates" / "web-app" / "README.md"
    page.write_text(page.read_text(encoding="utf-8") + "\n<!-- feature:x:start -->\n<!-- feature:x:end -->\n", encoding="utf-8")
    errors, _ = check_factory.run(repo)
    assert any("marker for undeclared option 'x'" in e for e in errors)


def test_check_factory_flags_markers_when_no_options_are_declared(repo):
    path = repo / "factory" / "templates.json"
    registry = json.loads(path.read_text(encoding="utf-8"))
    for t in registry["templates"]:
        t.pop("options", None)
    path.write_text(json.dumps(registry, indent=2), encoding="utf-8")
    errors, _ = check_factory.run(repo)
    assert any("feature markers, but templates.json declares no options" in e for e in errors)


def test_scaffold_reads_the_choices_from_the_spike_card(repo):
    import pipeline

    scaffold.new_idea("card", "Card", spike=True, root=repo)
    idea = scaffold.lib.idea_dir("card", repo)
    data, _ = pipeline.read_assessment(idea, repo)
    data["template_options"] = {"theme": False}
    pipeline.write_assessment(idea, data)
    app = scaffold.new_app("card", "web-app", root=repo)
    assert not (app / "frontend" / "src" / "components" / "ThemeToggle.tsx").exists()
    assert (app / "frontend" / "src" / "components" / "ShareButton.tsx").exists()


def _definition_with_options(repo, slug: str, options: dict, template: str = "web-app") -> None:
    scaffold.new_idea(slug, slug.title(), root=repo)
    path = scaffold.new_definition(slug, root=repo)
    text = path.read_text(encoding="utf-8")
    block = re.match(r"\A```json definition\n(.*?)\n```", text, re.DOTALL)
    data = json.loads(block.group(1))
    data["template"] = {"value": template, "state": "accepted", "options": options}
    path.write_text(text.replace(block.group(1), json.dumps(data, indent=2)), encoding="utf-8")


def test_scaffold_removes_what_the_owner_turned_off(repo):
    _definition_with_options(repo, "lean", {"share": False, "feedback.question": "off", "feedback.problem": "email:me@example.com"})
    app = scaffold.new_app("lean", "web-app", root=repo)
    assert not (app / "frontend" / "src" / "components" / "ShareButton.tsx").exists()
    header = (app / "frontend" / "src" / "layout" / "Header.tsx").read_text(encoding="utf-8")
    assert "ShareButton" not in header and "ThemeToggle" in header and "feature:" not in header
    env = (app / ".env.example").read_text(encoding="utf-8")
    assert "FEEDBACK_QUESTION=off" in env and "FEEDBACK_PROBLEM=email:me@example.com" in env


def test_scaffold_refuses_an_unknown_option_before_copying(repo):
    _definition_with_options(repo, "typo", {"shares": False})
    with pytest.raises(scaffold.lib.FactoryError, match="unknown template option"):
        scaffold.new_app("typo", "web-app", root=repo)
    assert not (scaffold.lib.idea_dir("typo", repo) / "app").exists()


HEARTBEAT_FILES = {
    "web-app": ["backend/app/heartbeat.py", "backend/tests/test_heartbeat.py"],
}


@pytest.mark.parametrize("template", sorted(HEARTBEAT_FILES))
def test_scaffold_with_heartbeat_off_leaves_no_trace_of_it(repo, template):
    slug = f"quiet-{template}"
    _definition_with_options(repo, slug, {"heartbeat": False}, template)
    app = scaffold.new_app(slug, template, root=repo)
    for rel in HEARTBEAT_FILES[template]:
        assert not (app / rel).exists(), rel
    left = [
        p.relative_to(app).as_posix()
        for p in app.rglob("*")
        if p.is_file() and p.suffix in {".py", ".yml", ".md", ".example", ".toml"} or p.name == ".env.example"
        if re.search(r"feature:heartbeat|heartbeat|HEARTBEAT", p.read_text(encoding="utf-8", errors="ignore"))
    ]
    assert left == []


@pytest.mark.parametrize("template", sorted(HEARTBEAT_FILES))
def test_scaffold_keeps_the_heartbeat_by_default(repo, template):
    slug = f"loud-{template}"
    _definition_with_options(repo, slug, {}, template)
    app = scaffold.new_app(slug, template, root=repo)
    for rel in HEARTBEAT_FILES[template]:
        assert (app / rel).exists(), rel
    assert "HEARTBEAT_URL=" in (app / ".env.example").read_text(encoding="utf-8")
    assert "feature:" not in (app / ".env.example").read_text(encoding="utf-8")
