"""pipeline.py: capture, develop, knock-outs, the five foundations, RICE ranking, the report, and Gate 1 (Go, Get Ready, Stop)."""

import re

import check_factory
import check_spec
import factory_lib as lib
import pytest
import scaffold
import status
import pipeline
from conftest import run

CHALLENGE = """# Challenge before Gate 1

| # | Where | Challenge | Answer | Outcome |
|---|---|---|---|---|
| 1 | assessment.md, reach | Forty swaps a month is a guess | Lowered confidence to 80 | changed |
"""

CLASSES = """
## Data classes (POL-11)
| Class | Examples | May be used in the factory? | Conditions |
|---|---|---|---|
| Public | The website | yes | none |
| Internal | Process documents | yes | none |
| Confidential | Commercial terms | only by approval | a named approver |
| Personal data | Names | yes | synthetic test data only |
| Special category | Health data | no | none |
"""

BRIEF = """# {name}: idea brief

## The idea
{name}.

## Problem
Rota changes take the manager an hour a week.

## Outcome and success measures
Swaps agreed without the manager; an hour a week back.

## How it's done today
Staff message the manager, who edits the rota.

## Data
The rota, in a shared spreadsheet; Internal.

## Risk
A wrong swap leaves a shift uncovered; the manager approves each one.

## People and process
The rota manager owns it; staff use it.

## Strategic fit
Frees managers for customers.

## Assumptions and unknowns
Staff will use it *(assumed)*.
"""


def rice(reach, impact, confidence, effort) -> dict:
    return {k: {"value": v, "reason": f"{k} reason"} for k, v in
            (("reach", reach), ("impact", impact), ("confidence", confidence), ("effort", effort))}


def foundations(**ratings) -> dict:
    return {k: {"rating": ratings.get(k, "green"), "reason": f"{k} reason"} for k in pipeline.FOUNDATIONS}


def assessment(slug: str, r=(40, 2, 80, 4), classes=("Internal",), recommended="go", fix=(), **ratings) -> dict:
    return {"schema_version": 1, "slug": slug, "version": "0.1", "period": "per month", "data_classes": list(classes),
            "foundations": foundations(**ratings), "rice": rice(*r), "template": "web-app", "assets": [],
            "one_thing": "Check the rota export works", "decision": {"recommended": recommended, "reason": "the ratings", "fix": list(fix)},
            "reassessments": []}


def developed(root, reg: dict, idea: str, **kw) -> str:
    """Capture and develop an idea, then write a full brief, assessment and overview: ready for Gate 1."""
    entry = pipeline.add(reg, idea)
    folder = pipeline.develop(reg, entry["id"], root=root)
    slug = folder.name
    (folder / pipeline.BRIEF).write_text(BRIEF.format(name=entry["title"]), encoding="utf-8")
    pipeline.write_assessment(folder, assessment(slug, **kw))
    text = (folder / pipeline.ASSESSMENT).read_text(encoding="utf-8").replace('<Anything a rating needs that does not fit in its line, or "None".>', "None.")
    text = re.sub(r"<It is a year from now[^>]*>", "Nobody swapped shifts on it (people: allowed for).", text)
    (folder / pipeline.ASSESSMENT).write_text(text, encoding="utf-8")
    (folder / "gates").mkdir(exist_ok=True)
    (folder / "gates" / "challenge-1.md").write_text(CHALLENGE, encoding="utf-8")
    scaffold.new_overview(slug, root=root)
    text = (folder / "overview.md").read_text(encoding="utf-8")
    text = lib.PLACEHOLDER.sub("filled", text)
    (folder / "overview.md").write_text(text, encoding="utf-8")
    lib.write_json(root / pipeline.REGISTER, reg)
    return slug


def edit_assessment(root, slug: str, change) -> None:
    folder = lib.idea_dir(slug, root)
    a, _ = pipeline.read_assessment(folder, root)
    change(a)
    pipeline.write_assessment(folder, a)


def gate_findings(root, slug: str) -> check_spec.Findings:
    f = check_spec.Findings()
    check_spec.check_gate_one(lib.idea_dir(slug, root), f, root)
    f.done()
    return f


def blocked(f, fragment: str) -> bool:
    return any(fragment in b for b in f.blockers)


@pytest.fixture
def reg() -> dict:
    return {"schema_version": 1, "entries": []}


@pytest.fixture
def isolated(repo):
    """A context with one flat policies.md and no data-classes table: an instance's layered policies and
    scopes.json (which may hold a real, filled-in table) are removed, so only what a test writes counts."""
    context = repo / "factory/context"
    for path in context.rglob("policies.md"):
        path.unlink()
    (context / "scopes.json").unlink(missing_ok=True)
    (context / "policies.md").write_text("# Policies\n\n| ID | Policy |\n|---|---|\n| POL-01 | Nothing outward-facing without approval. |\n", encoding="utf-8")
    return repo


@pytest.fixture
def classes(isolated):
    path = isolated / "factory/context/policies.md"
    path.write_text(path.read_text(encoding="utf-8") + CLASSES, encoding="utf-8")
    return isolated


# ---------------------------------------------------------------- capture and develop
def test_capture_takes_bullets_and_lines_once(reg, repo):
    (repo / "ideas/inbox.md").write_text(
        "# Inbox\n<!-- a comment\nover lines -->\n> a note\n\n- Route planner for site visits\n* Shift swap board\n"
        "1. Invoice matcher: match invoices to orders\nA plain line idea\n- [ ] A checkbox idea\n", encoding="utf-8")
    added = pipeline.capture(reg, repo)
    assert [e["idea"] for e in added] == ["Route planner for site visits", "Shift swap board",
                                          "Invoice matcher: match invoices to orders", "A plain line idea", "A checkbox idea"]
    assert [e["id"] for e in added] == ["IDEA-001", "IDEA-002", "IDEA-003", "IDEA-004", "IDEA-005"]
    assert added[2]["title"] == "Invoice matcher" and all(e["source"] == "inbox" and "slug" not in e for e in added)
    assert pipeline.capture(reg, repo) == []
    assert pipeline.add(reg, "  shift SWAP board ") is None
    assert pipeline.problems(reg, repo) == []


def test_capture_creates_a_missing_inbox(reg, repo):
    (repo / pipeline.INBOX).unlink(missing_ok=True)
    assert pipeline.capture(reg, repo) == []
    assert (repo / pipeline.INBOX).read_text(encoding="utf-8") == pipeline.INBOX_TEXT
    assert pipeline.inbox_lines(repo) == []


def test_develop_makes_the_folder_with_the_brief_and_assessment_stubs(reg, repo):
    entry = pipeline.add(reg, "Shift swap board: staff swap shifts without the rota manager")
    idea = pipeline.develop(reg, entry["id"], root=repo)
    assert idea.name == "shift-swap-board" and entry["slug"] == "shift-swap-board"
    state = lib.load_state("shift-swap-board", repo)
    assert lib.validate("state", state, repo) == []
    assert (state["stage"], state["status"], state["versions"]["assessment"]) == ("develop", "in-progress", "0.1")
    assert "staff swap shifts without the rota manager" in (idea / "idea.md").read_text(encoding="utf-8")
    assert "IDEA-001" in (idea / "idea.md").read_text(encoding="utf-8")
    assert "staff swap shifts without the rota manager" in (idea / pipeline.BRIEF).read_text(encoding="utf-8")
    a, bad = pipeline.read_assessment(idea, repo)
    assert bad == [] and a["slug"] == "shift-swap-board" and a["decision"]["recommended"] == "undecided"
    assert pipeline.problems(reg, repo) == []  # a stub is fine until the idea reaches Gate 1
    with pytest.raises(lib.FactoryError, match="already developed"):
        pipeline.develop(reg, entry["id"], root=repo)
    with pytest.raises(lib.FactoryError, match="not in"):
        pipeline.develop(reg, "IDEA-099", root=repo)


def test_a_developed_idea_whose_folder_is_gone_is_a_problem(reg, repo):
    entry = pipeline.add(reg, "Gone")
    entry["slug"] = "gone"
    assert any("developed as ideas/gone, which does not exist" in p for p in pipeline.problems(reg, repo))


# ---------------------------------------------------------------- scoring and ranking
def test_score_is_reach_times_impact_times_confidence_over_effort():
    assert pipeline.score(rice(40, 2, 80, 4)) == 16.0
    assert pipeline.score(rice(10, 0.25, 50, 2)) == 0.62  # 0.625 rounded to two places


def test_ranking_is_by_score_then_confidence_then_effort_then_slug(reg, isolated):
    for idea, r in [("Low", (10, 1, 50, 5)), ("High", (40, 2, 80, 4)), ("Tie less sure", (20, 2, 50, 1.25)),
                    ("Tie more work", (40, 2, 80, 4)), ("Tie less work", (20, 2, 80, 2))]:
        developed(isolated, reg, idea, r=r, classes=())
    assert pipeline.problems(reg, isolated) == []
    order = [r["slug"] for _, r, _ in pipeline.ranked(pipeline.assessed_ideas(isolated))]
    assert order == ["tie-less-work", "high", "tie-more-work", "tie-less-sure", "low"]


@pytest.mark.parametrize(("factor", "value", "fragment"), [
    ("impact", 1.5, "impact must be one of"),
    ("confidence", 0, "confidence is a percentage"),
    ("confidence", 120, "confidence is a percentage"),
    ("effort", 0, "effort is person-weeks"),
    ("reach", -1, "reach cannot be negative"),
])
def test_bad_rice_factors_block_gate_1(reg, isolated, factor, value, fragment):
    slug = developed(isolated, reg, "An idea", classes=())
    edit_assessment(isolated, slug, lambda a: a["rice"][factor].update(value=value))
    assert blocked(gate_findings(isolated, slug), fragment)


# ---------------------------------------------------------------- the five foundations
def test_a_full_assessment_passes_the_gate_1_check(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=(), people="amber")
    f = gate_findings(isolated, slug)
    assert f.blockers == [] and f.warnings == []


def test_every_foundation_must_be_rated(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=(), data="unrated")
    assert blocked(gate_findings(isolated, slug), "Data Foundations is not rated")
    edit_assessment(isolated, slug, lambda a: a.pop("foundations"))
    assert blocked(gate_findings(isolated, slug), "rate the five foundations")


def test_a_rating_needs_its_reason_and_the_one_thing_is_required(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=())
    edit_assessment(isolated, slug, lambda a: a["foundations"]["risk"].update(reason=""))
    assert any("foundations/risk/reason" in b for b in gate_findings(isolated, slug).blockers)
    edit_assessment(isolated, slug, lambda a: (a["foundations"]["risk"].update(reason="ok"), a.update(one_thing="")))
    assert blocked(gate_findings(isolated, slug), "one_thing")
    edit_assessment(isolated, slug, lambda a: a.update(one_thing="<The one thing to know>"))
    assert blocked(gate_findings(isolated, slug), "placeholder text left in one_thing")


def test_a_rating_must_be_red_amber_or_green():
    a = assessment("x")
    a["foundations"]["value"]["rating"] = "blue"
    assert any("foundations/value/rating" in p for p in lib.validate("assessment", a))


def test_a_go_cannot_have_a_red_foundation(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=(), data="red")
    assert blocked(gate_findings(isolated, slug), "a Go cannot have a red foundation (Data Foundations)")


def test_get_ready_names_what_to_fix_and_not_a_green_one(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=(), data="red", recommended="get-ready")
    assert blocked(gate_findings(isolated, slug), "Get Ready names the foundations to fix")
    edit_assessment(isolated, slug, lambda a: a["decision"].update(fix=["data", "value"]))
    assert blocked(gate_findings(isolated, slug), "Value is green, so there is nothing to fix")
    edit_assessment(isolated, slug, lambda a: a["decision"].update(fix=["data"]))
    assert gate_findings(isolated, slug).blockers == []


def test_the_ratings_suggest_a_decision_and_a_different_one_is_warned(reg, isolated):
    assert pipeline.suggest(assessment("x")) == ("go", [])
    assert pipeline.suggest(assessment("x", data="red", risk="red", value="amber")) == ("get-ready", ["data", "risk"])
    assert pipeline.suggest({**assessment("x"), "knockout": {"rule": "policy", "ref": "POL-01", "reason": "r"}}) == ("stop", [])
    slug = developed(isolated, reg, "An idea", classes=(), people="amber", recommended="get-ready", fix=["people"])
    f = gate_findings(isolated, slug)
    assert f.blockers == [] and any("the ratings point to Go, not Get Ready" in w for w in f.warnings)


def test_the_brief_and_the_overview_are_checked(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=())
    folder = lib.idea_dir(slug, isolated)
    brief = (folder / pipeline.BRIEF).read_text(encoding="utf-8")
    (folder / pipeline.BRIEF).write_text(brief.replace("## Strategic fit", "## Fit").replace("an hour a week back", "<the outcome>"), encoding="utf-8")
    f = gate_findings(isolated, slug)
    assert blocked(f, "no '## Strategic fit' section") and blocked(f, "idea-brief.md  placeholder text left")
    (folder / "overview.md").unlink()
    assert blocked(gate_findings(isolated, slug), "overview.md  missing")
    (folder / pipeline.BRIEF).unlink()
    assert blocked(gate_findings(isolated, slug), "idea-brief.md  missing")


def test_the_overview_is_filled_from_the_assessment(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=(), people="amber")
    (lib.idea_dir(slug, isolated) / "overview.md").unlink()
    text = scaffold.new_overview(slug, root=isolated).read_text(encoding="utf-8")
    assert "| 40 per month | 2 (high) | 80% | 4 person-weeks | 16 |" in text
    assert "| People & Process | Amber | people reason |" in text and "| Data Foundations | Green | data reason |" in text
    assert "Check the rota export works" in text and "Recommended: **Go**. the ratings" in text
    with pytest.raises(lib.FactoryError, match="already exists"):
        scaffold.new_overview(slug, root=isolated)


def test_a_fresh_overview_is_left_to_fill(repo):
    scaffold.new_idea("fresh", "Fresh", root=repo)
    text = scaffold.new_overview("fresh", root=repo).read_text(encoding="utf-8")
    assert "# Fresh: overview" in text and "<people or processes touched per month>" in text and "<green, amber or red>" in text
    f = gate_findings(repo, "fresh")
    assert blocked(f, "overview.md  placeholder text left") and blocked(f, "no recommendation")


# ---------------------------------------------------------------- knock-outs
def test_a_barred_data_class_must_be_knocked_out(reg, classes):
    slug = developed(classes, reg, "Read health records", classes=("Special category",))
    assert any("Special category, which POL-11 does not allow" in p for p in pipeline.problems(reg, classes))
    edit_assessment(classes, slug, lambda a: (a.update(knockout={"rule": "data-class", "ref": "POL-11", "reason": "needs health data"}),
                                              a["decision"].update(recommended="stop", reason="knocked out")))
    assert pipeline.problems(reg, classes) == []
    assert gate_findings(classes, slug).blockers == []


def test_a_knocked_out_idea_can_only_be_stopped(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=())
    edit_assessment(isolated, slug, lambda a: a.update(knockout={"rule": "paid-service", "ref": "DEF-11", "reason": "needs a paid map API"}))
    assert blocked(gate_findings(isolated, slug), "a knocked-out idea can only be stopped")
    with pytest.raises(lib.FactoryError, match="Gate 1 check has blockers"):
        pipeline.decide(slug, "go", "go", root=isolated)


def test_an_unknown_data_class_is_a_problem(reg, classes):
    developed(classes, reg, "An idea", classes=("Secret",))
    assert any("data class Secret is not in the data-classes table" in p for p in pipeline.problems(reg, classes))


def test_a_conditional_class_is_not_a_knock_out_but_is_shown(reg, classes):
    developed(classes, reg, "Price list tool", classes=("Personal data", "Internal"))
    assert pipeline.problems(reg, classes) == []
    report = pipeline.render(reg, classes)
    assert "Personal data: yes; synthetic test data only" in report
    assert "factory/context/policies.md" in report


def test_a_class_allowed_only_by_approval_needs_it_before_a_go(reg, classes):
    slug = developed(classes, reg, "Quote tracker for house builders", classes=("Confidential", "Internal"))
    assert pipeline.class_rules("group", classes)[0]["confidential"][0] == "approval"
    assert pipeline.problems(reg, classes) == []  # not a knock-out
    assert "Confidential: needs approval (POL-11)" in pipeline.render(reg, classes)
    f = gate_findings(classes, slug)
    assert f.blockers == [] and any("allows only by approval" in w for w in f.warnings)
    with pytest.raises(lib.FactoryError, match="needs the approval POL-11 asks for Confidential"):
        pipeline.decide(slug, "go", "go", root=classes)
    with pytest.raises(lib.FactoryError, match="does not ask for approval for Internal"):
        pipeline.approve_data(slug, "Internal", "steadytack", "yes", root=classes)
    with pytest.raises(lib.FactoryError, match="not a class this idea needs"):
        pipeline.approve_data(slug, "Special category", "steadytack", "yes", root=classes)
    a = pipeline.approve_data(slug, "confidential", "steadytack", "yes: the builders' quotes only, for the prototype", root=classes)
    assert a["data_approvals"] == [{"class": "Confidential", "by": "steadytack", "date": lib.today(),
                                    "reply": "yes: the builders' quotes only, for the prototype"}]
    assert f"Confidential: approved by steadytack ({lib.today()})" in pipeline.render(reg, classes)
    assert not any("allows only by approval" in w for w in gate_findings(classes, slug).warnings)
    assert pipeline.decide(slug, "go", "go", root=classes)["stage"] == "spec"


def test_only_an_approver_for_the_scope_may_approve_data(reg, classes):
    (classes / "factory/context/scopes.json").write_text(
        '{"schema_version": 1, "group": {"name": "Org", "approvers": {"gates": ["steadytack"], "catalogue": ["steadytack"]}}, '
        '"businesses": {}, "brands": {}}', encoding="utf-8")
    slug = developed(classes, reg, "Quote tracker", classes=("Confidential",))
    with pytest.raises(lib.FactoryError, match="someone is not an approver for group"):
        pipeline.approve_data(slug, "Confidential", "someone", "yes", root=classes)
    assert pipeline.approve_data(slug, "Confidential", "steadytack", "yes", root=classes)["data_approvals"][0]["by"] == "steadytack"


def test_the_strictest_layer_wins(classes):
    group = classes / "factory/context/group"
    group.mkdir(parents=True, exist_ok=True)
    (group / "policies.md").write_text(CLASSES.replace("| Internal | Process documents | yes |", "| Internal | Process documents | no |"), encoding="utf-8")
    rules, files = pipeline.class_rules("group", classes)
    assert rules["internal"][0] == "no" and len(files) == 2


def test_without_a_classes_table_data_classes_are_not_checked(reg, isolated):
    developed(isolated, reg, "An idea", classes=("Anything",))
    assert pipeline.problems(reg, isolated) == []
    assert "no data-classes table (POL-11) found" in pipeline.render(reg, isolated)


@pytest.mark.parametrize(("knockout", "fragment"), [
    ({"rule": "policy", "reason": "would publish without approval"}, "names the policy it breaks"),
    ({"rule": "duplicate", "ref": "ideas/no-such-idea", "reason": "same"}, "duplicates ideas/no-such-idea, which does not exist"),
    ({"rule": "duplicate", "ref": "CAT-999", "reason": "same"}, "duplicates CAT-999, which does not exist"),
    ({"rule": "duplicate", "ref": "IDEA-001", "reason": "itself"}, "duplicates IDEA-001, which does not exist"),
    ({"rule": "duplicate", "ref": "ideas/an-idea", "reason": "itself"}, "duplicates ideas/an-idea, which does not exist"),
    ({"rule": "duplicate", "ref": "something", "reason": "same"}, "names what it duplicates"),
])
def test_knock_outs_need_a_valid_ref(reg, isolated, knockout, fragment):
    slug = developed(isolated, reg, "An idea", classes=())
    edit_assessment(isolated, slug, lambda a: a.update(knockout=knockout))
    assert any(fragment in p for p in pipeline.problems(reg, isolated)), pipeline.problems(reg, isolated)


def test_knock_outs_that_resolve(reg, isolated):
    scaffold.new_idea("tide-times", "Tide times", root=isolated)
    other = pipeline.add(reg, "Something else")
    cats = sorted(p.stem for p in (isolated / "catalogue/assets").glob("CAT-*.json"))
    for n, ref in enumerate(["ideas/tide-times", *cats[:1], other["id"], None]):
        slug = developed(isolated, reg, f"Duplicate {n}", classes=())
        ko = {"rule": "duplicate" if ref else "policy", "ref": ref or "POL-07", "reason": f"reason {n}"}
        edit_assessment(isolated, slug, lambda a, ko=ko: a.update(knockout=ko))
    assert pipeline.problems(reg, isolated) == []
    report = pipeline.render(reg, isolated)
    assert "## Knocked out" in report and "| Duplicate 3 | policy | POL-07 | reason 3 |" in report


# ---------------------------------------------------------------- Gate 1: Go, Get Ready, Stop
def test_go_moves_the_idea_to_spec(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=(), people="amber")
    state = pipeline.decide(slug, "go", "approve", root=isolated)
    assert (state["stage"], state["status"]) == ("spec", "in-progress")
    assert state["gates"]["1"]["status"] == "approved" and state["gates"]["1"]["reply"] == "approve"
    assert state["assessment"] == {"decision": "go", "score": 16.0, "period": "per month",
                                   "foundations": {"problem": "green", "value": "green", "data": "green", "risk": "green", "people": "amber"}}
    a, _ = pipeline.read_assessment(lib.idea_dir(slug, isolated), isolated)
    assert a["decision"]["decided"] == "go" and a["decision"]["reply"] == "approve"
    assert lib.validate("state", state, isolated) == []
    assert "Go (" in pipeline.render(reg, isolated)
    rows = {r["slug"]: r for r in status.collect(isolated)}
    assert rows[slug]["gates_line"] == "1:A 2:- 3:- 4:-"
    with pytest.raises(lib.FactoryError, match="not waiting for its investment decision"):
        pipeline.decide(slug, "stop", "stop", reason="changed our minds", root=isolated)


def test_go_is_refused_with_a_red_foundation(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=(), data="red", recommended="get-ready", fix=["data"])
    with pytest.raises(lib.FactoryError, match="cannot have a red foundation"):
        pipeline.decide(slug, "go", "go", root=isolated)


def test_stop_closes_the_idea_with_its_reason(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=())
    with pytest.raises(lib.FactoryError, match="needs its reason"):
        pipeline.decide(slug, "stop", "stop", root=isolated)
    state = pipeline.decide(slug, "stop", "stop", reason="the rota system will do this next year", root=isolated)
    assert state["status"] == "stopped" and state["gates"]["1"]["status"] == "stopped"
    assert state["next"] == "Stopped at Gate 1: the rota system will do this next year"
    report = pipeline.render(reg, isolated)
    assert "## Stopped at Gate 1" in report and "the rota system will do this next year" in report
    assert "## Ranked\n\nNothing assessed yet." in report
    assert status.collect(isolated)[0]["gates_line"] == "1:S 2:- 3:- 4:-"


def test_get_ready_then_a_light_reassessment_then_go(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=(), data="red", people="amber", recommended="get-ready", fix=["data"])
    folder = lib.idea_dir(slug, isolated)
    brief = (folder / pipeline.BRIEF).read_text(encoding="utf-8")
    with pytest.raises(lib.FactoryError, match="nothing to fix"):
        pipeline.decide(slug, "get-ready", "get ready", fix=["problem"], root=isolated)
    state = pipeline.decide(slug, "get-ready", "get ready", fix=["data", "people"], root=isolated, owner="Data team")
    assert (state["stage"], state["status"], state["gates"]["1"]["status"]) == ("develop", "paused", "get-ready")
    assert state["assessment"]["fix"] == ["data", "people"] and "Data team fixes Data Foundations, People & Process by " in state["next"]
    assert status.collect(isolated)[0]["gates_line"] == "1:R 2:- 3:- 4:-"
    assert "Get Ready (" in pipeline.render(reg, isolated)

    a = pipeline.reassess(slug, root=isolated)
    assert a["version"] == "0.2" and a["decision"]["recommended"] == "undecided"
    assert a["reassessments"][0]["fix"] == ["data", "people"]
    assert a["reassessments"][0]["before"]["data"] == {"rating": "red", "reason": "data reason"}
    assert a["reassessments"][0]["previous"]["reply"] == "get ready"
    assert a["foundations"]["problem"] == {"rating": "green", "reason": "problem reason"}  # kept: not a restart
    assert (folder / pipeline.BRIEF).read_text(encoding="utf-8") == brief and (folder / "overview.md").exists()
    state = lib.load_state(slug, isolated)
    assert (state["status"], state["gates"]["1"]["status"], state["versions"]["assessment"]) == ("in-progress", "changes-requested", "0.2")
    assert lib.validate("state", state, isolated) == []

    def rerate(a, people_reason):
        a["foundations"]["data"] = {"rating": "green", "reason": "the rota export was cleaned and checked"}
        a["foundations"]["people"] = {"rating": "green", "reason": people_reason}
        a["decision"].update(recommended="go", reason="the data is ready now", fix=[])

    edit_assessment(isolated, slug, lambda a: rerate(a, "people reason"))
    assert blocked(gate_findings(isolated, slug), "People & Process was to be fixed but has not been re-assessed")
    edit_assessment(isolated, slug, lambda a: rerate(a, "the rota manager agreed to own it"))
    assert gate_findings(isolated, slug).blockers == []
    state = pipeline.decide(slug, "go", "go", root=isolated)
    assert state["stage"] == "spec" and state["gates"]["1"]["version"] == "0.2"


def test_only_a_get_ready_idea_is_reassessed(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=())
    with pytest.raises(lib.FactoryError, match="only a Get Ready idea"):
        pipeline.reassess(slug, root=isolated)


def test_state_accepts_the_gate_1_outcomes_and_no_gate_0():
    state = {
        "schema_version": 1, "slug": "x", "name": "X", "kind": "app", "stage": "develop", "status": "paused",
        "factory_version": "0.3.0", "updated": "2026-10-30", "gates": {"1": {"status": "get-ready"}}, "next": "",
        "assessment": {"decision": "get-ready", "score": 16, "foundations": {"data": "red"}, "fix": ["data"]},
    }
    assert lib.validate("state", state) == []
    state["assessment"]["foundations"]["data"] = "unrated"
    assert lib.validate("state", state)
    state["assessment"]["foundations"]["data"] = "red"
    state["gates"]["0"] = {"status": "approved"}
    assert lib.validate("state", state)


# ---------------------------------------------------------------- the command line and the rest of the factory
def test_the_command_line(isolated, py):
    repo = isolated
    script = str(repo / "factory/scripts/pipeline.py")
    (repo / "ideas/inbox.md").write_text("- Shift swap board\n- Route planner\n", encoding="utf-8")
    assert "2 idea(s) captured" in run([py, script, "capture"], repo).stdout
    assert run([py, script, "add", "Tide times widget", "--source", "document"], repo).returncode == 0
    assert run([py, script, "add", "Tide times widget"], repo).returncode == 1
    assert pipeline.load(repo)["entries"][2]["source"] == "document"
    assert run([py, script, "develop", "IDEA-001"], repo).returncode == 0
    a = assessment("shift-swap-board", classes=())
    pipeline.write_assessment(repo / "ideas/shift-swap-board", a)
    out = run([py, script, "render"], repo)
    assert out.returncode == 0 and "1 ranked" in out.stdout and "1. shift-swap-board (16) recommended Go" in out.stdout
    report = (repo / pipeline.REPORT).read_text(encoding="utf-8")
    assert "| 1 | [Shift swap board](shift-swap-board/assessment.md) | 16 | 40 per month | 2 | 80% | 4 |" in report
    assert "Problem G Value G Data G Risk G People G" in report
    assert "- IDEA-002 Route planner" in report
    out = run([py, script, "decide", "shift-swap-board", "go", "--reply", "go"], repo)
    assert out.returncode == 1 and "Gate 1 check has blockers" in out.stderr
    assert run([py, script, "reassess", "shift-swap-board"], repo).returncode == 1
    assert run([py, script], repo).returncode == 2


def test_status_and_check_factory_read_the_pipeline(reg, isolated):
    slug = developed(isolated, reg, "An idea", classes=())
    pipeline.add(reg, "Another")
    lib.write_json(isolated / pipeline.REGISTER, reg)
    assert pipeline.summary(isolated).startswith("Pipeline: 1 ranked, 0 go, 0 getting ready, 0 stopped, 0 knocked out, 0 being developed, 1 captured")
    errors, _ = check_factory.run(isolated)
    assert not [e for e in errors if "pipeline" in e or "assessment" in e]
    pipeline.decide(slug, "go", "go", root=isolated)
    edit_assessment(isolated, slug, lambda a: a["rice"]["impact"].update(value=7))
    errors, _ = check_factory.run(isolated)
    assert any(e.startswith(f"ideas/{slug}/assessment.md: impact must be one of") for e in errors)
