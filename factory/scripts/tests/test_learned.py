"""learned.py: the learned.md table, the Gate 3 outcome record, and the review that turns both into candidate changes."""

import json

import check_factory
import factory_lib as lib
import learned
import pipeline
import pytest
from conftest import run
from test_pipeline import developed, isolated, reg  # noqa: F401 (fixtures)


def entry(root, project, chosen="Tier 3", key="DEF-01", scope="type", recommended="Tier 2"):
    return learned.add(project, key, "Maturity tier", recommended, chosen, "others use it", scope, root)


def built(root, reg, idea: str, **kw) -> str:
    """An idea that was a Go at Gate 1, as it would be at the end of Build and Audit."""
    slug = developed(root, reg, idea, classes=(), **kw)
    pipeline.decide(slug, "go", "approve", root=root)
    return slug


def fill(root, slug: str, held="yes", actual=4.0, lessons=(), **held_by_key) -> None:
    """Fill in the outcome stub: every foundation `held` (or as given per key), the effort and the one thing."""
    path = lib.idea_dir(slug, root) / learned.OUTCOME
    o, _ = learned.read_outcome(path.parent, root)
    for k, v in o["foundations"].items():
        v["held"], v["note"] = held_by_key.get(k, held), "the build showed it"
    o["effort"].update(actual=actual, note="as planned")
    o["one_thing"].update(held="yes", note="it was")
    o["lessons"] = list(lessons)
    text = path.read_text(encoding="utf-8")
    block = "```json outcome\n" + json.dumps(o, indent=2) + "\n```"
    text = block + learned.BLOCK.sub("", text).replace('<Anything the record needs that does not fit in its lines, or "None".>', "None.")
    path.write_text(text, encoding="utf-8")


# ---------------------------------------------------------------- learned.md
def test_entries_are_added_read_and_marked(isolated):
    entry(isolated, "shift-swap", chosen="Tier 3 | shared")
    entry(isolated, "rota-board")
    entries, bad = learned.read(isolated)
    assert bad == [] and [e["project"] for e in entries] == ["shift-swap", "rota-board"]
    assert entries[0]["chosen"] == "Tier 3 | shared" and entries[0]["status"] == "observed" and entries[0]["date"] == lib.today()
    assert learned.mark("DEF-01", "confirmed", chosen="tier 3", root=isolated) == 1
    assert [e["status"] for e in learned.read(isolated)[0]] == ["observed", "confirmed"]
    assert learned.mark("DEF-01", "superseded", root=isolated) == 2
    with pytest.raises(lib.FactoryError, match="no entry for DEF-01"):
        learned.mark("DEF-01", "confirmed", root=isolated)
    with pytest.raises(lib.FactoryError, match="confirmed or superseded"):
        learned.mark("DEF-01", "observed", root=isolated)
    text = (isolated / learned.LEARNED).read_text(encoding="utf-8")
    assert text.startswith("# Learned") and text.rstrip().endswith("| superseded |")


@pytest.mark.parametrize(("change", "fragment"), [
    ({"scope": "everyone"}, "scope 'everyone'"),
    ({"key": "Tier choice"}, "key 'Tier choice'"),
    ({"status": "maybe"}, "status 'maybe'"),
    ({"date": "31/10/2026"}, "is not YYYY-MM-DD"),
    ({"reason": ""}, "reason is empty"),
])
def test_bad_entries_are_reported(change, fragment):
    e = {"date": lib.today(), "project": "p", "key": "DEF-01", "question": "q", "recommended": "a", "chosen": "b",
         "reason": "r", "scope": "project", "status": "observed", **change}
    assert any(fragment in p for p in learned.entry_problems(e))


def test_add_refuses_a_bad_entry_and_check_factory_reports_a_bad_row(isolated):
    with pytest.raises(lib.FactoryError, match="scope 'everyone'"):
        entry(isolated, "p", scope="everyone")
    entry(isolated, "p")
    path = isolated / learned.LEARNED
    path.write_text(path.read_text(encoding="utf-8").replace("| type | observed |", "| everyone | maybe |"), encoding="utf-8")
    errors, _ = check_factory.run(isolated)
    assert any("scope 'everyone'" in e for e in errors) and any("status 'maybe'" in e for e in errors)


def test_a_table_with_the_old_columns_is_a_problem(isolated):
    path = isolated / learned.LEARNED
    path.write_text("# Learned\n\n| Date | Project | Question | Recommended | Chosen | Reason | Scope | Status |\n|---|---|---|---|---|---|---|---|\n", encoding="utf-8")
    assert learned.problems(isolated) == [f"{learned.LEARNED}: needs the table | {' | '.join(learned.COLUMNS)} |"]


# ---------------------------------------------------------------- outcome.md
def test_an_outcome_is_written_only_after_a_go(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=())
    with pytest.raises(lib.FactoryError, match="was not a Go"):
        learned.new_outcome(slug, isolated)
    pipeline.decide(slug, "go", "approve", root=isolated)
    learned.new_outcome(slug, isolated)
    o, bad = learned.read_outcome(lib.idea_dir(slug, isolated), isolated)
    assert bad == [] and o["assessment_version"] == "0.1" and o["effort"]["estimated"] == 4
    assert o["foundations"]["people"] == {"rated": "green", "held": "unchecked", "note": "<what the build showed>"}
    assert o["one_thing"]["text"] == "Check the rota export works"
    with pytest.raises(lib.FactoryError, match="already exists"):
        learned.new_outcome(slug, isolated)
    assert learned.problems(isolated) == []  # a fresh stub is valid; it is the Gate 3 check that wants it filled


def test_the_gate_3_check_wants_the_outcome_filled_in(reg, isolated):
    slug = built(isolated, reg, "Shift swap board")
    assert "is missing" in learned.gate_check(slug, isolated)[0]
    learned.new_outcome(slug, isolated)
    bad = learned.gate_check(slug, isolated)
    assert any("foundations/data: held is unchecked" in p for p in bad)
    assert any("one_thing: held is unchecked" in p for p in bad)
    assert any("actual is 0" in p for p in bad)
    assert any("placeholder left" in p for p in bad)
    fill(isolated, slug)
    assert learned.gate_check(slug, isolated) == []


@pytest.mark.parametrize(("lesson", "fragment"), [
    ({"kind": "lens", "ref": "no-such-lens", "lesson": "x"}, "no lens 'no-such-lens'"),
    ({"kind": "knockout", "ref": "cost", "lesson": "x"}, "knock-out rule 'cost'"),
    ({"kind": "rice", "ref": "value", "lesson": "x"}, "RICE factor 'value'"),
    ({"kind": "default", "ref": "tier", "lesson": "x"}, "default 'tier'"),
])
def test_a_lesson_must_name_what_it_would_change(reg, isolated, lesson, fragment):
    slug = built(isolated, reg, "Shift swap board")
    learned.new_outcome(slug, isolated)
    fill(isolated, slug, lessons=[lesson])
    assert any(fragment in p for p in learned.problems(isolated))
    assert any(fragment in p for p in learned.gate_check(slug, isolated))


# ---------------------------------------------------------------- review
def test_the_same_override_in_two_projects_is_a_candidate(isolated):
    entry(isolated, "shift-swap")
    entry(isolated, "shift-swap")
    assert learned.review(isolated) == []  # twice in one project is that project's exception
    entry(isolated, "rota-board")
    entry(isolated, "invoices", chosen="Tier 1")
    found = learned.review(isolated)
    assert found == ["Promote to a default? DEF-01 (type): recommended 'Tier 2', chosen 'Tier 3' in 2 projects (rota-board, shift-swap)"]
    assert learned.review(isolated, threshold=3) == []
    learned.mark("DEF-01", "confirmed", chosen="Tier 3", root=isolated)
    assert learned.review(isolated) == []  # answered: no longer a candidate


# ---------------------------------------------------------------- clarifications
def clarified(root, project, scope, topic="users", answer="Field staff on shared tablets"):
    return learned.clarify(project, topic, "Who uses it", answer, "said mid-build", scope, root=root)


def test_a_clarification_beyond_its_project_is_a_candidate_at_once(isolated):
    e = clarified(isolated, "shift-swap", "business:retail")
    assert (e["key"], e["recommended"], e["chosen"], e["status"]) == ("clarify-users", "none", "Field staff on shared tablets", "observed")
    clarified(isolated, "rota-board", "project", topic="colours", answer="Green")  # only that idea's: never a candidate
    clarified(isolated, "rota-board", "type:field-app", topic="offline", answer="Must work offline")
    assert learned.review(isolated) == [
        "Write into factory/context/group/defaults.md (field-app apps)? clarify-offline (type:field-app): Who uses it: "
        "'Must work offline' (said in rota-board)",
        "Write into factory/context/businesses/retail/? clarify-users (business:retail): Who uses it: "
        "'Field staff on shared tablets' (said in shift-swap)",
    ]
    learned.mark("clarify-users", "confirmed", root=isolated)
    assert len(learned.review(isolated)) == 1  # answered: no longer a candidate
    with pytest.raises(lib.FactoryError, match="scope 'type:Field'"):
        clarified(isolated, "p", "type:Field")


def test_recall_gives_an_idea_only_what_its_scope_allows(isolated):
    from test_scopes import REGISTRY
    (isolated / "factory/context/scopes.json").write_text(json.dumps(REGISTRY), encoding="utf-8")
    clarified(isolated, "shift-swap", "business:retail")
    clarified(isolated, "trade-quotes", "business:trade", topic="pricing", answer="Net of VAT")
    clarified(isolated, "pro-site", "brand:pro", topic="tone", answer="Plain")
    clarified(isolated, "shop-site", "brand:shopfront", topic="tone", answer="Friendly")
    clarified(isolated, "rota-board", "type:field-app", topic="offline", answer="Must work offline")
    clarified(isolated, "rota-board", "project", topic="colours", answer="Green")
    entry(isolated, "invoices", scope="global")
    retail = {"business": "retail", "brands": ["shopfront"]}
    keys = lambda found: [(e["project"], e["key"]) for e in found]  # noqa: E731
    assert keys(learned.recall(retail, "new-idea", isolated)) == [
        ("shift-swap", "clarify-users"), ("shop-site", "clarify-tone"), ("rota-board", "clarify-offline"), ("invoices", "DEF-01")]
    assert ("rota-board", "clarify-colours") in keys(learned.recall(retail, "rota-board", isolated))  # its own
    trade = keys(learned.recall({"business": "trade", "brands": []}, None, isolated))
    assert ("trade-quotes", "clarify-pricing") in trade and ("pro-site", "clarify-tone") in trade
    assert ("shift-swap", "clarify-users") not in trade and ("shop-site", "clarify-tone") not in trade
    learned.mark("clarify-offline", "superseded", root=isolated)
    assert ("rota-board", "clarify-offline") not in keys(learned.recall(retail, None, isolated))


def test_clarify_and_recall_on_the_command_line(isolated, py):
    script = str(isolated / "factory/scripts/learned.py")
    args = ["--project", "shift-swap", "--topic", "users", "--question", "Who uses it", "--answer", "Field staff",
            "--reason", "said at Gate 2", "--scope", "global"]
    out = run([py, script, "clarify", *args], isolated)
    assert out.returncode == 0 and "clarification clarify-users for shift-swap (global)" in out.stdout
    assert run([py, script, "clarify", "--project", "p"], isolated).returncode == 1
    out = run([py, script, "recall", "--scope", "group"], isolated)
    assert out.returncode == 0 and "1 entry to consider" in out.stdout and "clarify-users (global, observed): Who uses it: 'Field staff'" in out.stdout
    assert "Write into factory/context/group/?" in run([py, script, "review"], isolated).stdout


def test_outcomes_turn_into_candidates_across_builds(reg, isolated):
    lesson = {"kind": "lens", "ref": "data-and-integrations", "lesson": "ask whether the export is complete"}
    for idea, actual in (("Shift swap board", 8.0), ("Rota planner", 10.0)):
        slug = built(isolated, reg, idea)
        learned.new_outcome(slug, isolated)
        fill(isolated, slug, actual=actual, lessons=[lesson], data="no", risk="partly")
    found = learned.review(isolated)
    assert "Review the data-and-integrations screening questions? Data Foundations was rated wrongly in 2 builds (rota-planner, shift-swap-board)" in found
    assert "Re-calibrate RICE effort? Builds took 2.25x the estimate (median of 2)" in found
    assert "Change the lens data-and-integrations? The same lesson came up in 2 builds (rota-planner, shift-swap-board)" in found
    assert not any("security" in c for c in found)  # partly is not a miss
    assert len(found) == 3


def test_one_build_is_not_enough_and_good_estimates_are_quiet(reg, isolated):
    slug = built(isolated, reg, "Shift swap board")
    learned.new_outcome(slug, isolated)
    fill(isolated, slug, data="no")
    other = built(isolated, reg, "Rota planner")
    learned.new_outcome(other, isolated)
    fill(isolated, other, actual=5.0)
    assert learned.review(isolated) == []  # data missed once; effort 1x and 1.25x


def test_the_command_line(reg, isolated, py):
    script = str(isolated / "factory/scripts/learned.py")
    args = ["--key", "DEF-03", "--question", "Authentication", "--recommended", "single login", "--chosen", "roles", "--reason", "a team uses it"]
    for project in ("shift-swap", "rota-board"):
        out = run([py, script, "add", "--project", project, *args], isolated)
        assert out.returncode == 0 and f"observed DEF-03 for {project} (project)" in out.stdout
    assert run([py, script, "add", "--project", "p"], isolated).returncode == 1
    out = run([py, script, "review"], isolated)
    assert out.returncode == 0 and "1 candidate change(s)" in out.stdout and "Promote to a default? DEF-03 (project)" in out.stdout
    out = run([py, script, "mark", "DEF-03", "confirmed"], isolated)
    assert out.returncode == 0 and "2 entries for DEF-03 marked confirmed; now edit defaults.md" in out.stdout
    slug = built(isolated, reg, "Shift swap board")
    assert run([py, script, "outcome", slug], isolated).returncode == 0
    out = run([py, script, "check", slug], isolated)
    assert out.returncode == 1 and "held is unchecked" in out.stdout
    fill(isolated, slug)
    assert run([py, script, "check", slug], isolated).stdout.strip() == "learned: OK"
    assert run([py, script], isolated).returncode == 2


def test_check_factory_reads_learned_and_outcomes(reg, isolated):
    slug = built(isolated, reg, "Shift swap board")
    learned.new_outcome(slug, isolated)
    path = lib.idea_dir(slug, isolated) / learned.OUTCOME
    path.write_text(path.read_text(encoding="utf-8").replace('"held": "unchecked"', '"held": "maybe"', 1), encoding="utf-8")
    errors, _ = check_factory.run(isolated)
    assert any(e.startswith(f"ideas/{slug}/outcome.md: foundations/problem/held") for e in errors)
