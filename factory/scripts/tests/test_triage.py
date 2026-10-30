"""triage.py: intake, knock-outs, RICE scoring and ranking, the report, and Gate 0 (pick and park)."""

import check_factory
import factory_lib as lib
import pytest
import scaffold
import status
import triage
from conftest import run

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


def rice(reach, impact, confidence, effort) -> dict:
    return {k: {"value": v, "reason": f"{k} reason"} for k, v in
            (("reach", reach), ("impact", impact), ("confidence", confidence), ("effort", effort))}


def scored(reg: dict, idea: str, r: tuple, classes=("Internal",)) -> dict:
    entry = triage.add(reg, idea)
    entry.update(status="scored", data_classes=list(classes), rice=rice(*r))
    return entry


@pytest.fixture
def reg() -> dict:
    return {"schema_version": 1, "period": "per month", "entries": []}


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


# ---------------------------------------------------------------- scoring and ranking
def test_score_is_reach_times_impact_times_confidence_over_effort():
    assert triage.score(rice(40, 2, 80, 4)) == 16.0
    assert triage.score(rice(10, 0.25, 50, 2)) == 0.62  # 0.625 rounded to two places


def test_ranking_is_by_score_then_confidence_then_effort_then_id(reg, repo):
    scored(reg, "Low", (10, 1, 50, 5))                 # 1.0
    scored(reg, "High", (40, 2, 80, 4))                # 16.0
    scored(reg, "Tie, less sure", (20, 2, 50, 1.25))   # 16.0, confidence 50
    scored(reg, "Tie, more work", (40, 2, 80, 4))      # 16.0, same as High; ID decides
    scored(reg, "Tie, less work", (20, 2, 80, 2))      # 16.0, confidence 80, effort 2
    assert triage.problems(reg, repo) == []
    order = [e["title"] for _, e, _ in triage.ranked(reg)]
    assert order == ["Tie, less work", "High", "Tie, more work", "Tie, less sure", "Low"]


@pytest.mark.parametrize(("factor", "value", "fragment"), [
    ("impact", 1.5, "impact must be one of"),
    ("confidence", 0, "confidence is a percentage"),
    ("confidence", 120, "confidence is a percentage"),
    ("effort", 0, "effort is person-weeks"),
    ("reach", -1, "reach cannot be negative"),
])
def test_bad_rice_factors_are_problems(reg, repo, factor, value, fragment):
    entry = scored(reg, "An idea", (10, 1, 80, 1))
    entry["rice"][factor]["value"] = value
    assert any(fragment in p for p in triage.problems(reg, repo))


def test_a_factor_needs_its_reason(reg, repo):
    entry = scored(reg, "An idea", (10, 1, 80, 1))
    entry["rice"]["reach"]["reason"] = ""
    assert any("reach/reason" in p for p in triage.problems(reg, repo))


def test_a_scored_idea_needs_rice_and_data_classes(reg, repo):
    entry = triage.add(reg, "An idea")
    entry["status"] = "scored"
    found = triage.problems(reg, repo)
    assert any("needs the four RICE factors" in p for p in found)
    assert any("record the data classes" in p for p in found)


def test_new_ideas_need_nothing_yet(reg, repo):
    triage.add(reg, "Just arrived")
    assert triage.problems(reg, repo) == []


# ---------------------------------------------------------------- knock-outs
def test_a_barred_data_class_must_be_knocked_out(reg, classes):
    entry = scored(reg, "Read health records", (50, 3, 80, 2), classes=("Special category",))
    assert any("Special category, which POL-11 does not allow" in p for p in triage.problems(reg, classes))
    entry.update(status="knocked-out", knockout={"rule": "data-class", "ref": "POL-11", "reason": "needs health data"})
    assert triage.problems(reg, classes) == []


def test_an_unknown_data_class_is_a_problem(reg, classes):
    scored(reg, "An idea", (10, 1, 80, 1), classes=("Secret",))
    assert any("data class Secret is not in the data-classes table" in p for p in triage.problems(reg, classes))


def test_a_conditional_class_is_not_a_knock_out_but_is_shown(reg, classes):
    scored(reg, "Price list tool", (10, 1, 80, 1), classes=("Confidential", "Internal"))
    assert triage.problems(reg, classes) == []
    report = triage.render(reg, classes)
    assert "Confidential: only by approval; a named approver" in report
    assert "factory/context/policies.md" in report


def test_the_strictest_layer_wins(reg, classes):
    group = classes / "factory/context/group"
    group.mkdir(parents=True, exist_ok=True)
    (group / "policies.md").write_text(CLASSES.replace("| Internal | Process documents | yes |", "| Internal | Process documents | no |"), encoding="utf-8")
    rules, files = triage.class_rules("group", classes)
    assert rules["internal"][0] == "no" and len(files) == 2


def test_without_a_classes_table_data_classes_are_not_checked(reg, isolated):
    scored(reg, "An idea", (10, 1, 80, 1), classes=("Anything",))
    assert triage.problems(reg, isolated) == []
    assert "no data-classes table (POL-11) found" in triage.render(reg, isolated)


@pytest.mark.parametrize(("knockout", "fragment"), [
    ({"rule": "policy", "reason": "would publish without approval"}, "names the policy it breaks"),
    ({"rule": "duplicate", "ref": "ideas/no-such-idea", "reason": "same"}, "duplicates ideas/no-such-idea, which does not exist"),
    ({"rule": "duplicate", "ref": "CAT-999", "reason": "same"}, "duplicates CAT-999, which does not exist"),
    ({"rule": "duplicate", "ref": "TRI-001", "reason": "itself"}, "duplicates TRI-001, which does not exist"),
    ({"rule": "duplicate", "ref": "something", "reason": "same"}, "names what it duplicates"),
])
def test_knock_outs_need_a_valid_ref(reg, repo, knockout, fragment):
    entry = triage.add(reg, "An idea")
    entry.update(status="knocked-out", data_classes=[], knockout=knockout)
    assert any(fragment in p for p in triage.problems(reg, repo)), triage.problems(reg, repo)


def test_knock_outs_that_resolve(reg, repo):
    scaffold.new_idea("tide-times", "Tide times", root=repo)
    first = triage.add(reg, "First")
    first.update(status="knocked-out", data_classes=[], knockout={"rule": "paid-service", "ref": "DEF-11", "reason": "needs a paid map API"})
    cats = sorted(p.stem for p in (repo / "catalogue/assets").glob("CAT-*.json"))
    for n, ref in enumerate(["ideas/tide-times", *cats[:1], "TRI-001", None]):
        entry = triage.add(reg, f"Duplicate {n}")
        ko = {"rule": "duplicate" if ref else "policy", "ref": ref or "POL-07", "reason": "r"}
        entry.update(status="knocked-out", data_classes=[], knockout=ko)
    assert triage.problems(reg, repo) == []
    report = triage.render(reg, repo)
    assert "## Knocked out" in report and "| paid-service | DEF-11 | needs a paid map API |" in report


def test_a_knocked_out_idea_needs_its_record(reg, repo):
    entry = triage.add(reg, "An idea")
    entry.update(status="knocked-out", data_classes=[])
    assert any("without a knock-out record" in p for p in triage.problems(reg, repo))


# ---------------------------------------------------------------- intake
def test_intake_takes_bullets_and_lines_once(reg, repo):
    (repo / "ideas/inbox.md").write_text(
        "# Inbox\n<!-- a comment\nover lines -->\n> a note\n\n- Route planner for site visits\n* Shift swap board\n"
        "1. Invoice matcher: match invoices to orders\nA plain line idea\n- [ ] A checkbox idea\n", encoding="utf-8")
    added = triage.intake(reg, repo)
    assert [e["idea"] for e in added] == ["Route planner for site visits", "Shift swap board",
                                          "Invoice matcher: match invoices to orders", "A plain line idea", "A checkbox idea"]
    assert [e["id"] for e in added] == ["TRI-001", "TRI-002", "TRI-003", "TRI-004", "TRI-005"]
    assert added[2]["title"] == "Invoice matcher" and all(e["source"] == "inbox" and e["status"] == "new" for e in added)
    assert triage.intake(reg, repo) == []
    assert triage.add(reg, "  shift SWAP board ") is None
    assert triage.problems(reg, repo) == []


def test_intake_creates_a_missing_inbox(reg, repo):
    (repo / triage.INBOX).unlink(missing_ok=True)
    assert triage.intake(reg, repo) == []
    assert (repo / triage.INBOX).read_text(encoding="utf-8") == triage.INBOX_TEXT
    assert triage.inbox_lines(repo) == []


def test_the_command_line(isolated, py):
    repo = isolated
    script = str(repo / "factory/scripts/triage.py")
    (repo / "ideas/inbox.md").write_text("- Shift swap board\n- Route planner\n", encoding="utf-8")
    assert "2 idea(s) taken in" in run([py, script, "intake"], repo).stdout
    assert run([py, script, "add", "Tide times widget"], repo).returncode == 0
    assert run([py, script, "add", "Tide times widget"], repo).returncode == 1
    reg = triage.load(repo)
    reg["entries"][0].update(status="scored", data_classes=[], rice=rice(40, 2, 80, 4))
    lib.write_json(repo / triage.REGISTER, reg)
    out = run([py, script, "render"], repo)
    assert out.returncode == 0 and "1 ranked" in out.stdout and "1. TRI-001 Shift swap board (16)" in out.stdout
    report = (repo / triage.REPORT).read_text(encoding="utf-8")
    assert "| 1 | TRI-001 | Shift swap board | 16 | 40 | 2 | 80% | 4 |" in report
    assert "- TRI-002 Route planner" in report
    reg["entries"][1].update(status="scored")
    lib.write_json(repo / triage.REGISTER, reg)
    out = run([py, script, "check"], repo)
    assert out.returncode == 1 and "TRI-002: scored needs the four RICE factors" in out.stdout
    assert run([py, script], repo).returncode == 2


# ---------------------------------------------------------------- Gate 0
def test_pick_scaffolds_the_idea_with_its_triage_record(reg, repo):
    entry = scored(reg, "Shift swap board: staff swap shifts without the rota manager", (40, 2, 80, 4))
    idea = triage.pick(reg, entry["id"], None, "approve", repo)
    assert idea.name == "shift-swap-board"
    state = lib.load_state("shift-swap-board", repo)
    assert lib.validate("state", state, repo) == []
    assert state["gates"]["0"]["status"] == "approved" and state["gates"]["0"]["reply"] == "approve"
    assert state["triage"] == {"id": "TRI-001", "score": 16.0, "period": "per month", "reach": 40, "impact": 2, "confidence": 80, "effort": 4}
    text = (idea / "idea.md").read_text(encoding="utf-8")
    assert "staff swap shifts without the rota manager" in text and "<In the owner's words" not in text
    assert "| Reach | 40 | reach reason |" in text and "RICE score 16" in text
    assert entry["status"] == "picked" and entry["picked"]["slug"] == "shift-swap-board"
    assert triage.problems(reg, repo) == []
    assert "## Picked at Gate 0" in triage.render(reg, repo)
    rows = {r["slug"]: r for r in status.collect(repo)}
    assert rows["shift-swap-board"]["gates_line"] == "0:A 1:- 2:- 3:- 4:-"


def test_only_a_scored_idea_can_be_picked(reg, repo):
    entry = triage.add(reg, "Not assessed")
    with pytest.raises(lib.FactoryError, match="only a scored"):
        triage.pick(reg, entry["id"], "x", "approve", repo)
    with pytest.raises(lib.FactoryError, match="not in"):
        triage.pick(reg, "TRI-099", "x", "approve", repo)


def test_a_picked_idea_whose_folder_is_gone_is_a_problem(reg, repo):
    entry = scored(reg, "Gone", (1, 1, 50, 1))
    entry.update(status="picked", picked={"date": "2026-10-30", "slug": "gone", "reply": "approve"})
    assert any("picked as ideas/gone, which does not exist" in p for p in triage.problems(reg, repo))


def test_park_keeps_the_score_and_can_be_picked_later(reg, repo):
    entry = scored(reg, "Later", (10, 1, 80, 1))
    triage.park(reg, entry["id"], "after the rota project")
    assert triage.problems(reg, repo) == []
    assert "| TRI-001 | Later | 8 | after the rota project |" in triage.render(reg, repo)
    triage.pick(reg, entry["id"], "later-idea", "pick TRI-001", repo)
    assert entry["status"] == "picked"
    with pytest.raises(lib.FactoryError, match="only a new or scored"):
        triage.park(reg, entry["id"], "again")


# ---------------------------------------------------------------- the rest of the factory
def test_status_and_check_factory_read_the_register(repo):
    reg = triage.load(repo)
    scored(reg, "An idea", (10, 1, 80, 1))
    triage.add(reg, "Another")
    lib.write_json(repo / triage.REGISTER, reg)
    assert triage.summary(repo).startswith("Triage: 1 ranked, 0 picked, 0 parked, 0 knocked out, 1 not yet triaged")
    errors, _ = check_factory.run(repo)
    assert not [e for e in errors if e.startswith(triage.REGISTER)]
    reg["entries"][0]["rice"]["impact"]["value"] = 7
    lib.write_json(repo / triage.REGISTER, reg)
    errors, _ = check_factory.run(repo)
    assert any(e.startswith(f"{triage.REGISTER}: TRI-001: impact must be one of") for e in errors)


def test_state_accepts_gate_zero_and_a_triage_record():
    state = {
        "schema_version": 1, "slug": "x", "name": "X", "kind": "app", "stage": "analyse", "status": "in-progress",
        "factory_version": "0.2.0", "updated": "2026-10-30", "gates": {"0": {"status": "approved"}}, "next": "",
        "triage": {"id": "TRI-001", "score": 16, "reach": 40, "impact": 2, "confidence": 80, "effort": 4},
    }
    assert lib.validate("state", state) == []
    state["triage"]["id"] = "T1"
    assert lib.validate("state", state)
