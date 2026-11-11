"""check_spec.py: Gate 1 (brief, assessment, overview) and Gate 2 (the definition and the spec pack), traceability."""

import json
import shutil
from pathlib import Path

import check_spec
import factory_lib as lib
import pytest
import scaffold
from conftest import REAL_ROOT, run

FIXTURE = Path(__file__).parent / "fixtures" / "brew-ratio"


@pytest.fixture
def pack(tmp_path) -> Path:
    """A copy of the scenario A pack (a small standalone app), which passes."""
    dest = tmp_path / "brew-ratio"
    shutil.copytree(FIXTURE, dest, ignore=shutil.ignore_patterns("traceability.md"))
    return dest


@pytest.fixture
def idea(tmp_path) -> Path:
    """The same idea for the Gate 1 checks, which need no template or catalogue entry."""
    dest = tmp_path / "brew-ratio"
    shutil.copytree(FIXTURE, dest, ignore=shutil.ignore_patterns("traceability.md"))
    return dest


def edit(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    assert old in text, f"{old!r} not in {path.name}"
    path.write_text(text.replace(old, new), encoding="utf-8")


def findings(path: Path, **kw) -> check_spec.Findings:
    return check_spec.run(str(path), **kw)[0]


def blocked(f, fragment: str) -> bool:
    return any(fragment in b for b in f.blockers)


def warned(f, fragment: str) -> bool:
    return any(fragment in w for w in f.warnings)


# ---------------------------------------------------------------- the passing pack
def test_scenario_a_pack_passes_and_writes_traceability(pack, py):
    out = run([py, str(REAL_ROOT / "factory/scripts/check_spec.py"), str(pack)], pack)
    assert out.returncode == 0, out.stdout
    assert "0 blocker(s), 0 warning(s)" in out.stdout
    trace = (pack / "spec/traceability.md").read_text(encoding="utf-8")
    assert "| FR-001 | Must | JRN-001 | US-001 | US-001-AC1, US-001-AC2 | RULE-001 | SCR-001 |" in trace
    assert "Counts: OBJ 1, JRN 2, FR 4" in trace


def test_a_pack_copied_outside_the_factory_still_passes(pack, tmp_path):
    """Scenario F: the spec folder alone, with no definition, state or factory files beside it."""
    alone = tmp_path / "elsewhere" / "spec"
    shutil.copytree(pack / "spec", alone)
    f = findings(alone)
    assert f.blockers == [], f.blockers


def test_the_definition_is_checked_with_the_pack_at_gate_2(pack):
    edit(pack / "application-definition.md", '"value": 3, "state": "accepted"', '"value": 7, "state": "accepted"')
    assert blocked(findings(pack), "maturity_tier/value")


def test_the_definition_is_not_a_gate_1_document(idea):
    (idea / "application-definition.md").unlink()
    assert findings(idea, assessment_only=True).blockers == []


def test_a_definition_without_its_json_block_is_a_blocker(pack):
    (pack / "application-definition.md").write_text("# Just prose\n", encoding="utf-8")
    assert blocked(findings(pack), "must start with a ```json definition block")


def test_an_idea_without_a_definition_is_a_blocker(pack):
    (pack / "application-definition.md").unlink()
    assert blocked(findings(pack), "application-definition.md  missing")


# ---------------------------------------------------------------- blockers
@pytest.mark.parametrize(
    ("doc", "old", "new", "fragment"),
    [
        ("03-functional-requirements.md", "| JRN-001 | Must | TEST-001 | idea.md |\n| FR-002", "| JRN-001 | Soon | TEST-001 | idea.md |\n| FR-002", "FR-001 needs a priority"),
        ("03-functional-requirements.md", "| FR-001 | Given grams of coffee and a ratio, show the millilitres of water | JRN-001 |", "| FR-001 | Given grams of coffee and a ratio, show the millilitres of water | none |", "FR-001 names no journey (JRN) or objective (OBJ)"),
        ("08-user-stories.md", "| US-002 | Brewer | Enter water and a ratio and see the coffee | I can brew to the size of my cup | FR-002 |", "| US-002 | Brewer | Enter water and a ratio and see the coffee | I can brew to the size of my cup | - |", "FR-002 has no user story"),
        ("08-user-stories.md", "| US-002-AC1 | 250 ml of water | I choose 1:15 | 16.7 g is shown | TEST-001 |\n", "", "US-002 has no acceptance criterion"),
        ("06-data-model.md", "| Recipe | A saved favourite | FR-003, FR-004 |", "| Recipe | A saved favourite | - |", "DATA-001 names no FR"),
        ("04-user-experience.md", "| Work out a brew and keep recipes | FR-001, FR-002, FR-003, FR-004 |", "| Work out a brew and keep recipes | all |", "SCR-001 names no FR"),
        ("01-overview.md", "(FR-003)", "(FR-099)", "mentions FR-099, which is not defined"),
        ("02-product-definition.md", "| JRN-002 | Keep", "| JRN-001 | Keep", "duplicate ID JRN-001"),
        ("README.md", "[01-overview.md](01-overview.md)", "[01-overview.md](01-overwiew.md)", "broken link to 01-overwiew.md"),
        ("10-architecture-and-deployment.md", "| CAT-006 1.3.0 | Browser |", "| home-made | Browser |", "must be a catalogue asset (CAT-nnn), custom, or external"),
        ("11-delivery-plan.md", "| FR-001, FR-002, FR-003, FR-004 | US-001, US-002, US-003, US-004 | CMP-001 |", "| - | - | CMP-001 |", "EPIC-001 delivers no FR or story"),
        ("12-component-selection-and-gaps.md", "| CAT-006 1.3.0 | reuse |", "| CAT-006 1.3.0 | borrow |", "decision must be one of"),
        ("12-component-selection-and-gaps.md", "| CAT-006 1.3.0 | reuse |", "| - | reuse |", "reuse needs the selected catalogue asset"),
        ("12-component-selection-and-gaps.md", "| FR-001, FR-002, FR-003, FR-004, NFR-001 |", "| - |", "CAP-001 supports no requirement"),
        ("12-component-selection-and-gaps.md", "| CAT-006 1.3.0 | reuse | Has storage", "| CAT-999 1.0.0 | reuse | Has storage", "refers to CAT-999, which is not in the catalogue"),
    ],
)
def test_each_blocker(pack, doc, old, new, fragment):
    edit(pack / "spec" / doc, old, new)
    f = findings(pack)
    assert blocked(f, fragment), f.blockers


def test_an_acceptance_criterion_with_no_verification_is_a_blocker_at_tier_2(pack):
    edit(pack / "spec/08-user-stories.md", "| 288 ml is shown | TEST-001 |", "| 288 ml is shown | |")
    assert not blocked(findings(pack), "US-001-AC1")  # TEST-001 in the plan still verifies it
    edit(pack / "spec/11-delivery-plan.md", "RULE-001, US-001-AC1, US-001-AC2", "RULE-001, US-001-AC2")
    assert blocked(findings(pack), "US-001-AC1 has no verification")


def test_a_missing_document_is_a_blocker(pack):
    (pack / "spec/07-security-and-permissions.md").unlink()
    f = findings(pack)
    assert blocked(f, "spec/07-security-and-permissions.md  missing")


def test_a_pack_with_no_requirements_is_blocked(pack):
    path = pack / "spec/03-functional-requirements.md"
    lines = [ln for ln in path.read_text(encoding="utf-8").splitlines() if not ln.startswith("| FR-")]
    path.write_text("\n".join(lines), encoding="utf-8")
    assert blocked(findings(pack), "no functional requirements (FR)")


def test_an_open_question_that_blocks_the_spec_stops_gate_2(pack):
    edit(pack / "spec/09-assumptions-risks-decisions.md", "## Open questions\nNone.",
         "## Open questions\n| Q | Question | Recommended answer | Status | Owner | Blocks |\n|---|---|---|---|---|---|\n| Q-001 | Grams or ounces? | Grams | open | owner | spec |")
    assert blocked(findings(pack), "Q-001 is open and blocks the spec")
    edit(pack / "spec/09-assumptions-risks-decisions.md", "| Grams | open | owner | spec |", "| Grams | accepted | owner | spec |")
    assert not blocked(findings(pack), "Q-001")


def test_a_selected_asset_that_is_not_approved_is_blocked(pack, monkeypatch):
    real = check_spec.load_catalogue()
    real["CAT-006"] = {**real["CAT-006"], "status": "imported"}
    monkeypatch.setattr(check_spec, "load_catalogue", lambda: real)
    assert blocked(findings(pack), "CAT-006 is imported, not approved for reuse")
    real["CAT-006"]["status"] = "deprecated"
    assert blocked(findings(pack), "CAT-006 is deprecated in the catalogue")


# ---------------------------------------------------------------- warnings, not blockers
def test_tier_1_makes_a_missing_verification_a_warning(pack):
    edit(pack / "application-definition.md", '"value": 3, "state": "accepted"', '"value": 1, "state": "accepted"')
    edit(pack / "spec/08-user-stories.md", "| 288 ml is shown | TEST-001 |", "| 288 ml is shown | |")
    edit(pack / "spec/11-delivery-plan.md", "RULE-001, US-001-AC1, US-001-AC2", "RULE-001, US-001-AC2")
    f = findings(pack)
    assert not blocked(f, "US-001-AC1") and warned(f, "US-001-AC1 has no verification")


def test_tier_1_on_the_full_route_and_a_missing_data_or_protection_decision_are_warned(idea):
    assert not warned(findings(idea), "takes the light route") and not warned(findings(idea), "decision")
    edit(idea / "application-definition.md", '"value": 3, "state": "accepted"', '"value": 2, "state": "accepted"')
    assert not warned(findings(idea), "takes the light route")  # tier 2 has a spec pack
    edit(idea / "application-definition.md", '"value": 2, "state": "accepted"', '"value": 1, "state": "accepted"')
    assert warned(findings(idea), "tier 1 is a spike, which takes the light route")
    edit(idea / "application-definition.md", '  "protection": {"value": "A", "state": "accepted", "reason": "one user, nothing beyond the browser"},\n', "")
    assert warned(findings(idea), "no protection decision")


def test_a_could_requirement_without_a_story_is_only_a_warning(pack):
    edit(pack / "spec/08-user-stories.md", "| US-004 | Brewer | Export and import my recipes | I keep them if the browser is cleared | FR-004 |",
         "| US-004 | Brewer | Export and import my recipes | I keep them if the browser is cleared | FR-003 |")
    f = findings(pack)
    assert not blocked(f, "FR-004 has no user story") and warned(f, "FR-004 has no user story")


@pytest.mark.parametrize(
    ("doc", "old", "new", "fragment"),
    [
        ("05-non-functional-requirements.md", "| Every FR with the network off | TEST-004 |", "| | |", "NFR-001 has no threshold"),
        ("10-architecture-and-deployment.md", "Deployment category: simple", "Deployment category: hosted", "differs from the Application Definition (simple)"),
        ("12-component-selection-and-gaps.md", "| CAT-006 1.3.0 | reuse |", "| CAT-006 0.9.0 | reuse |", "version 0.9.0 differs from the catalogue (1.3.0)"),
        ("01-overview.md", "Next: Gate 2.", "Next: <the next gate>.", "placeholder text left"),
        ("02-product-definition.md", "| Two weeks of brews without reaching for a calculator |", "| |", "OBJ-001 has no success measure"),
        ("09-assumptions-risks-decisions.md", "| open | owner | none |", "| open | | none |", "ASM-001 has no owner"),
        ("10-architecture-and-deployment.md", "| CAT-006 1.3.0 | Browser |", "| external (a browser) | Browser |", "external component not yet in the catalogue"),
    ],
)
def test_each_warning(pack, doc, old, new, fragment):
    edit(pack / "spec" / doc, old, new)
    f = findings(pack)
    assert warned(f, fragment), f.warnings
    assert f.blockers == [], f.blockers


def test_a_withdrawn_requirement_needs_no_story_and_references_to_it_warn(pack):
    edit(pack / "spec/03-functional-requirements.md", "| JRN-002 | Could | TEST-003 | idea.md |", "| JRN-002 | Could | TEST-003 | withdrawn |")
    f = findings(pack)
    assert not blocked(f, "FR-004") and warned(f, "refers to FR-004, which is withdrawn")


# ---------------------------------------------------------------- import mode, impact, stubs
def test_an_imported_source_must_be_mapped(pack):
    source = pack / "source" / "v0.1"
    source.mkdir(parents=True)
    (pack / "source/INDEX.md").write_text("current: v0.1\n", encoding="utf-8")
    (source / "ids.json").write_text(json.dumps(["A1", "A2", "A3"]), encoding="utf-8")
    assert blocked(findings(pack), "source-map.md  missing")
    (pack / "spec/source-map.md").write_text(
        "| Source ID | Maps to | Status | Note |\n|---|---|---|---|\n| A1 | FR-001 | Mapped | |\n| A2 | FR-404 | Mapped | |\n| A3 | | Deferred | |\n",
        encoding="utf-8",
    )
    f = findings(pack)
    assert blocked(f, "A2 is Mapped but names no defined spec ID") and blocked(f, "A3 is Deferred but gives no reason")


def test_impact_lists_what_a_change_touches(pack):
    code, text = check_spec.impact(pack, pack / "spec", ["FR-003"])
    assert code == 0
    assert "US: US-003" in text and "AC: US-003-AC1, US-003-AC2" in text and "DATA: DATA-001" in text and "EPIC: EPIC-001" in text
    assert check_spec.impact(pack, pack / "spec", ["FR-404"])[0] == 1


def test_fresh_stubs_are_checked_without_crashing(repo):
    scaffold.new_idea("fresh", "Fresh", root=repo)
    scaffold.new_definition("fresh", root=repo)
    scaffold.new_spec("fresh", root=repo)
    f = findings(repo / "ideas/fresh")
    assert blocked(f, "no functional requirements (FR)")
    assert warned(f, "placeholder text left")
    assert not blocked(f, "missing")


def test_the_command_line_usage(py):
    script = str(REAL_ROOT / "factory/scripts/check_spec.py")
    assert run([py, script], REAL_ROOT).returncode == 2
    assert run([py, script, "x", "--impact"], REAL_ROOT).returncode == 2


@pytest.mark.parametrize("idea", sorted(p.name for p in (REAL_ROOT / "ideas").iterdir() if (p / "spec" / "README.md").exists()))
def test_every_real_idea_pack_has_no_blockers(idea, tmp_path):
    copy = tmp_path / idea
    shutil.copytree(REAL_ROOT / "ideas" / idea, copy, ignore=shutil.ignore_patterns("app", "traceability.md"))
    f = findings(copy)
    assert f.blockers == [], f.blockers


def test_placeholders_inside_code_are_not_reported(pack):
    edit(pack / "spec/01-overview.md", "Next: Gate 2.", "Files go to `published/<dataset_id>/<version>/`. Next: Gate 2.")
    assert not warned(findings(pack), "placeholder text left")


# ---------------------------------------------------------------- the overview (Gate 1)
def test_the_fixture_passes_gate_1(idea, py):
    out = run([py, str(REAL_ROOT / "factory/scripts/check_spec.py"), str(idea), "--assessment"], idea)
    assert out.returncode == 0, out.stdout
    assert "Gate 1: brief, assessment and overview: 0 blocker(s), 0 warning(s)" in out.stdout


def test_the_overview_is_checked_at_gate_1(idea):
    assert findings(idea, assessment_only=True).blockers == []
    edit(idea / "overview.md", "One home brewer.", "<Who benefits>")
    assert blocked(findings(idea, assessment_only=True), "overview.md  placeholder text left")
    (idea / "overview.md").unlink()
    assert blocked(findings(idea, assessment_only=True), "overview.md  missing")


def test_the_overview_is_left_to_gate_1(pack):
    (pack / "overview.md").unlink()
    assert not blocked(findings(pack), "overview.md")  # the Gate 2 check leaves it to Gate 1


def test_the_overview_warns_about_requirement_ids_and_missing_sections(idea):
    edit(idea / "overview.md", "both sums, saved favourites", "FR-001 and FR-002, saved favourites")
    edit(idea / "overview.md", "## What happens next", "## Later")
    f = findings(idea, assessment_only=True)
    assert f.blockers == [], f.blockers
    assert warned(f, "uses requirement IDs (FR-001, FR-002)") and warned(f, "no 'What happens next' section")


# ---------------------------------------------------------------- doc 13, the business process
def test_the_business_process_doc_is_required(pack):
    (pack / "spec/13-business-process.md").unlink()
    assert blocked(findings(pack), "spec/13-business-process.md  missing")


def test_an_idea_started_before_doc_13_is_only_warned(pack):
    (pack / "spec/13-business-process.md").unlink()
    edit(pack / "spec/README.md", "| [13-business-process.md](13-business-process.md) | Brewing today and with the app |\n", "")
    edit(pack / "state.json", '"factory_version": "0.2.0"', '"factory_version": "0.1.0"')
    f = findings(pack)
    assert not blocked(f, "13-business-process") and warned(f, "required from factory 0.2.0; this idea started on 0.1.0")


@pytest.mark.parametrize(
    ("old", "new", "fragment"),
    [
        ("## As-is\n", "## Today\n", "no '## As-is' section"),
        ("## To-be\n", "## Tomorrow\n", "no '## To-be' section"),
        ("## As-is\nThe brewer weighs the coffee, works out the water on a phone calculator, and writes favourite ratios on a sticky note.\n\n```mermaid",
         "## As-is\nThe brewer weighs the coffee, works out the water on a phone calculator, and writes favourite ratios on a sticky note.\n\n```text", "the as-is section needs a ```mermaid flowchart"),
        ("the app shows the water and keeps favourites.\n\n```mermaid", "the app shows the water and keeps favourites.\n\n```", "the to-be section needs a ```mermaid flowchart"),
        ("| Saves a favourite recipe, still there tomorrow | FR-003 |", "| Saves a favourite recipe, still there tomorrow | FR-099 |", "mentions FR-099, which is not defined"),
    ],
)
def test_each_business_process_blocker(pack, old, new, fragment):
    edit(pack / "spec/13-business-process.md", old, new)
    assert blocked(findings(pack), fragment)


@pytest.mark.parametrize(
    ("old", "new", "fragment"),
    [
        ("| Saves a favourite recipe, still there tomorrow | FR-003 |", "| Saves a favourite recipe, still there tomorrow | manual |", "to-be step 3 names no FR"),
        ("| Step | Who | What happens | Relies on |\n|---|---|---|---|\n| 1 |", "| Who | What happens | Relies on |\n|---|---|---|\n| 1 |", "no steps table"),
        ("## What changes\n", "## Afterwards\n", "no '## What changes' section"),
    ],
)
def test_each_business_process_warning(pack, old, new, fragment):
    edit(pack / "spec/13-business-process.md", old, new)
    f = findings(pack)
    assert warned(f, fragment), f.warnings
    assert f.blockers == [], f.blockers


def test_fresh_stubs_include_the_business_process(repo):
    scaffold.new_idea("fresh", "Fresh", root=repo)
    scaffold.new_definition("fresh", root=repo)
    scaffold.new_spec("fresh", root=repo)
    assert (repo / "ideas/fresh/spec/13-business-process.md").exists()
    assert not blocked(findings(repo / "ideas/fresh"), "13-business-process")


# ---------------------------------------------------------------- the pre-mortem and the challenge
def started(idea: Path, version: str) -> None:
    state = json.loads((idea / "state.json").read_text(encoding="utf-8"))
    state["factory_version"] = version
    (idea / "state.json").write_text(json.dumps(state), encoding="utf-8")


def test_the_pre_mortem_is_required_at_gate_1_from_0_9_0(idea):
    started(idea, "0.9.0")
    assert findings(idea, assessment_only=True).blockers == []
    edit(idea / "assessment.md", "## Pre-mortem", "## Afterthoughts")
    assert blocked(findings(idea, assessment_only=True), "no '## Pre-mortem' section")
    edit(idea / "assessment.md", "## Afterthoughts", "## Pre-mortem\n<The likeliest reasons>\n\n## Was")
    assert blocked(findings(idea, assessment_only=True), "the pre-mortem is not written")
    started(idea, "0.8.0")
    f = findings(idea, assessment_only=True)
    assert f.blockers == [] and warned(f, "required from factory 0.9.0; this idea started on 0.8.0")


def test_an_unchallenged_gate_is_a_warning(idea):
    (idea / "gates/challenge-1.md").unlink()
    f = findings(idea, assessment_only=True)
    assert f.blockers == [] and warned(f, "gates/challenge-1.md  missing")
    f = check_spec.Findings()
    check_spec.check_challenge(idea, 2, f)
    assert f.blockers == [] and f.warnings == []
    (idea / "gates/challenge-2.md").unlink()
    check_spec.check_challenge(idea, 2, f)
    assert warned(f, "gates/challenge-2.md  missing")


def test_the_spec_check_reads_the_gate_2_challenge(pack):
    edit(pack / "gates/challenge-2.md", "| kept |", "| |")
    assert blocked(findings(pack), "challenge 1: outcome must be changed or kept")


def test_every_challenge_is_answered(idea):
    path = idea / "gates/challenge-1.md"
    edit(path, "| The brewer asked for it; 80 stands | kept |", "|  | maybe |")
    f = findings(idea, assessment_only=True)
    assert blocked(f, "challenge 1 has no answer") and blocked(f, "outcome must be changed or kept")
    edit(path, "| # | Where | Challenge | Answer | Outcome |", "| # | Challenge | Outcome |")
    assert blocked(findings(idea, assessment_only=True), "columns must be # | Where | Challenge | Answer | Outcome")


def test_a_challenge_with_nothing_found_is_a_warning(idea):
    path = idea / "gates/challenge-1.md"
    text = path.read_text(encoding="utf-8")
    path.write_text(text.split("| 1 |")[0], encoding="utf-8")
    assert warned(findings(idea, assessment_only=True), "no challenges recorded")


def test_tier_2_may_leave_out_the_production_documents(idea):
    pack = idea  # only the missing-document findings are asserted, which need no template or catalogue
    (pack / "spec/05-non-functional-requirements.md").unlink()
    (pack / "spec/10-architecture-and-deployment.md").unlink()
    assert blocked(findings(pack), "spec/10-architecture-and-deployment.md  missing")  # the fixture is tier 3
    edit(pack / "application-definition.md", '"value": 3, "state": "accepted"', '"value": 2, "state": "accepted"')
    f = findings(pack)
    assert not blocked(f, ".md  missing") and warned(f, "spec/05-non-functional-requirements.md  missing (optional at tier 2")
    (pack / "spec/07-security-and-permissions.md").unlink()
    assert blocked(findings(pack), "spec/07-security-and-permissions.md  missing")


# ---------------------------------------------------------------- the record agrees with itself
def record(tmp_path: Path, state: dict, gates: dict[str, str], changes: str = "") -> check_spec.Findings:
    idea = tmp_path / "idea"
    (idea / "gates").mkdir(parents=True)
    (idea / "state.json").write_text(json.dumps(state), encoding="utf-8")
    for name, status_line in gates.items():
        (idea / "gates" / name).write_text(f"# Gate\n\n{status_line}\n", encoding="utf-8")
    if changes:
        (idea / "changes.md").write_text(changes, encoding="utf-8")
    f = check_spec.Findings()
    check_spec.check_records(idea, f)
    return f


def test_a_closed_idea_with_an_open_gate_change_or_current_is_warned(tmp_path):
    state = {"stage": "done", "status": "done", "gates": {"3": {"status": "approved"}},
             "current": {"epic": None, "story": None, "milestone": "all epics approved; audit and final Gate 3 next"}}
    changes = "| CR | Date | What | Outcome |\n|---|---|---|---|\n| CR-002 | 2026-10-25 | Tables | Built; verified; awaiting commit |\n"
    f = record(tmp_path, state, {"gate-3.md": "Status: **approved 2026-10-23**", "gate-3-cr-001.md": "Status: awaiting approval. Date: 2026-10-25."}, changes)
    assert warned(f, "gates/gate-3-cr-001.md  says awaiting approval, but state.json status is done")
    assert warned(f, "CR-002 outcome says \"Built; verified; awaiting commit\", but the idea is done")
    assert warned(f, "status is done but current still says \"all epics approved")
    assert len(f.warnings) == 3


def test_a_main_gate_file_must_match_its_state_and_an_open_gate_is_fine(tmp_path):
    f = record(tmp_path, {"status": "awaiting-approval", "gates": {"1": {"status": "approved"}, "3": {"status": "awaiting-approval"}}},
               {"gate-1.md": "**Status:** awaiting approval.", "gate-3.md": "Status: awaiting-approval. Date: 2026-11-01."})
    assert f.warnings == ["gates/gate-1.md  says awaiting-approval, but state.json gate 1 is approved: correct one of them"]
    f = record(tmp_path / "b", {"status": "in-progress", "gates": {"1": {"status": "get-ready"}}}, {"gate-1.md": "Status: Get Ready"})
    assert f.warnings == []


def test_check_factory_reports_a_record_that_disagrees_as_a_warning(repo):
    import check_factory
    idea = scaffold.new_idea("tide-times", "Tide times", root=repo)
    (idea / "gates" / "gate-1.md").write_text("Status: changes requested\n", encoding="utf-8")
    warnings: list[str] = []
    check_factory.check_ideas(repo, [], warnings)
    assert warnings == ["ideas/tide-times/gates/gate-1.md  says changes-requested, but state.json gate 1 is not-reached: "
                        "correct one of them"]
