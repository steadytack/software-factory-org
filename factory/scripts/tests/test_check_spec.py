"""check_spec.py: the Application Definition and the spec pack, blockers and warnings, traceability."""

import json
import shutil
from pathlib import Path

import check_spec
import factory_lib as lib
import pytest
import scaffold
from conftest import BREW_RATIO_TEMPLATES, REAL_ROOT, needs_templates, run

FIXTURE = Path(__file__).parent / "fixtures" / "brew-ratio"


@pytest.fixture
def pack(tmp_path) -> Path:
    """A copy of the scenario A pack (a small standalone app), which passes."""
    needs = needs_templates(*BREW_RATIO_TEMPLATES)
    if needs.args[0]:
        pytest.skip(needs.kwargs["reason"])
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


def test_the_definition_alone_is_checked_for_gate_1(pack):
    assert findings(pack, definition_only=True).blockers == []
    edit(pack / "application-definition.md", '"value": 2, "state": "accepted"', '"value": 7, "state": "accepted"')
    assert blocked(findings(pack, definition_only=True), "maturity_tier/value")


def test_a_definition_without_its_json_block_is_a_blocker(pack):
    (pack / "application-definition.md").write_text("# Just prose\n", encoding="utf-8")
    assert blocked(findings(pack, definition_only=True), "must start with a ```json definition block")


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
        ("10-architecture-and-deployment.md", "| CAT-001 1.0.0 | Browser |", "| home-made | Browser |", "must be a catalogue asset (CAT-nnn), custom, or external"),
        ("11-delivery-plan.md", "| FR-001, FR-002, FR-003, FR-004 | US-001, US-002, US-003, US-004 | CMP-001 |", "| - | - | CMP-001 |", "EPIC-001 delivers no FR or story"),
        ("12-component-selection-and-gaps.md", "| CAT-001 1.0.0 | reuse |", "| CAT-001 1.0.0 | borrow |", "decision must be one of"),
        ("12-component-selection-and-gaps.md", "| CAT-001 1.0.0 | reuse |", "| - | reuse |", "reuse needs the selected catalogue asset"),
        ("12-component-selection-and-gaps.md", "| FR-001, FR-002, FR-003, FR-004, NFR-001 |", "| - |", "CAP-001 supports no requirement"),
        ("12-component-selection-and-gaps.md", "| CAT-001 1.0.0 | reuse | Has storage", "| CAT-999 1.0.0 | reuse | Has storage", "refers to CAT-999, which is not in the catalogue"),
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
    real["CAT-001"] = {**real["CAT-001"], "status": "imported"}
    monkeypatch.setattr(check_spec, "load_catalogue", lambda: real)
    assert blocked(findings(pack), "CAT-001 is imported, not approved for reuse")
    real["CAT-001"]["status"] = "deprecated"
    assert blocked(findings(pack), "CAT-001 is deprecated in the catalogue")


# ---------------------------------------------------------------- warnings, not blockers
def test_tier_1_makes_a_missing_verification_a_warning(pack):
    edit(pack / "application-definition.md", '"value": 2, "state": "accepted"', '"value": 1, "state": "accepted"')
    edit(pack / "spec/08-user-stories.md", "| 288 ml is shown | TEST-001 |", "| 288 ml is shown | |")
    edit(pack / "spec/11-delivery-plan.md", "RULE-001, US-001-AC1, US-001-AC2", "RULE-001, US-001-AC2")
    f = findings(pack)
    assert not blocked(f, "US-001-AC1") and warned(f, "US-001-AC1 has no verification")


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
        ("12-component-selection-and-gaps.md", "| CAT-001 1.0.0 | reuse |", "| CAT-001 0.9.0 | reuse |", "version 0.9.0 differs from the catalogue (1.0.0)"),
        ("01-overview.md", "Next: Gate 2.", "Next: <the next gate>.", "placeholder text left"),
        ("02-product-definition.md", "| Two weeks of brews without reaching for a calculator |", "| |", "OBJ-001 has no success measure"),
        ("09-assumptions-risks-decisions.md", "| open | owner | none |", "| open | | none |", "ASM-001 has no owner"),
        ("10-architecture-and-deployment.md", "| CAT-001 1.0.0 | Browser |", "| external (a browser) | Browser |", "external component not yet in the catalogue"),
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
def test_the_overview_is_checked_at_gate_1(pack):
    assert findings(pack, definition_only=True).blockers == []
    edit(pack / "overview.md", "One home brewer.", "<Who benefits>")
    assert blocked(findings(pack, definition_only=True), "overview.md  placeholder text left")
    (pack / "overview.md").unlink()
    assert blocked(findings(pack, definition_only=True), "overview.md  missing")
    assert not blocked(findings(pack), "overview.md")  # the Gate 2 check leaves it to Gate 1


def test_the_overview_warns_about_requirement_ids_and_missing_sections(pack):
    edit(pack / "overview.md", "both sums, saved favourites", "FR-001 and FR-002, saved favourites")
    edit(pack / "overview.md", "## What happens next", "## Later")
    f = findings(pack, definition_only=True)
    assert f.blockers == [], f.blockers
    assert warned(f, "uses requirement IDs (FR-001, FR-002)") and warned(f, "no 'What happens next' section")


def test_a_fresh_overview_is_filled_from_triage_or_left_to_fill(repo):
    scaffold.new_idea("fresh", "Fresh", root=repo)
    scaffold.new_definition("fresh", root=repo)
    text = (repo / "ideas/fresh/overview.md").read_text(encoding="utf-8")
    assert "# Fresh: overview" in text and "<people or processes touched per month>" in text
    assert blocked(findings(repo / "ideas/fresh", definition_only=True), "overview.md  placeholder text left")
    with pytest.raises(lib.FactoryError, match="already exists"):
        scaffold.new_overview("fresh", root=repo)
    scaffold.new_idea("picked", "Picked", root=repo)
    state = lib.load_state("picked", repo)
    state["triage"] = {"id": "TRI-004", "score": 16, "period": "per month", "reach": 40, "impact": 2, "confidence": 80, "effort": 4}
    lib.save_state("picked", state, repo)
    text = (scaffold.new_overview("picked", root=repo)).read_text(encoding="utf-8")
    assert "| 40 per month | 2 (high) | 80% | 4 person-weeks | 16 |" in text and "From triage (TRI-004" in text


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
