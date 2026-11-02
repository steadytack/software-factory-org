"""Who decides: Develop and Assess is the idea owner's, and going further is signed off by a gate approver other than them.
A project or programme is built out over time on its roadmap, its spikes among the epics, each epic an idea of its own."""

import factory_lib as lib
import pipeline
import pytest
import scaffold
import status
from conftest import run
from test_pipeline import blocked, developed, edit_assessment, gate_findings, isolated, reg  # noqa: F401 (fixtures)

EPICS = """| Epic | Name | Kind | Answers or delivers | Tier | Depends on | Decision after |
|---|---|---|---|---|---|---|
| E1 | Prove the routing | spike | Can the engine route a day's jobs from the export? | 1 | - | grow: E2; stop: rethink |
| E2 | Planner for one depot | build | A planner for one depot's schedulers | 3 | E1 | roll out or not |
| E3 | Live job feed | project | A live feed from the job system | 4 | E2 | - |
"""


def approvers(root, *names: str) -> None:
    (root / "factory/context/scopes.json").write_text(
        '{"schema_version": 1, "group": {"name": "Org", "approvers": {"gates": [' + ", ".join(f'"{n}"' for n in names)
        + '], "catalogue": ["steadytack"]}}, "businesses": {}, "brands": {}}', encoding="utf-8")


def owned(root, reg, owner: str, idea: str = "Shift swap board", **kw) -> str:
    slug = developed(root, reg, idea, classes=(), **kw)
    state = lib.load_state(slug, root)
    state["owner"] = owner
    lib.save_state(slug, state, root)
    return slug


def programme(root, reg, epics: str = EPICS, **kw) -> str:
    """A programme recommended Go on its roadmap, with the roadmap written and filled in."""
    slug = developed(root, reg, "Field scheduling programme", classes=(), **kw)
    edit_assessment(root, slug, lambda a: a.update(scale="programme"))
    path = scaffold.new_roadmap(slug, root)
    text = path.read_text(encoding="utf-8")
    head, _, rest = text.partition("| Epic | Name |")
    rest = rest[rest.index("\n## Starts now"):]
    path.write_text(lib.PLACEHOLDER.sub("filled", head + epics + rest), encoding="utf-8")
    return slug


# ---------------------------------------------------------------- sign-off
def test_a_gate_decision_is_signed_off_by_a_named_approver(reg, isolated):
    approvers(isolated, "approver", "steadytack")
    slug = owned(isolated, reg, "maker")
    with pytest.raises(lib.FactoryError, match="signed off by name"):
        pipeline.decide(slug, "go", "go", root=isolated)
    with pytest.raises(lib.FactoryError, match="someone is not a gate approver"):
        pipeline.decide(slug, "go", "go", by="someone", root=isolated)
    state = pipeline.decide(slug, "go", "go", by="approver", root=isolated)
    assert state["gates"]["1"]["by"] == "approver" and "note" not in state["gates"]["1"]
    a, _ = pipeline.read_assessment(lib.idea_dir(slug, isolated), isolated)
    assert a["decision"]["by"] == "approver" and lib.validate("state", state, isolated) == []


def test_the_owner_cannot_sign_off_their_own_idea_but_may_withdraw_it(reg, isolated):
    approvers(isolated, "approver", "maker")
    slug = owned(isolated, reg, "maker")
    with pytest.raises(lib.FactoryError, match="maker owns this idea, so cannot sign it off; ask approver"):
        pipeline.decide(slug, "go", "go", by="maker", root=isolated)
    other = owned(isolated, reg, "outsider", idea="Rota planner")
    with pytest.raises(lib.FactoryError, match="its owner may only stop"):
        pipeline.decide(other, "go", "go", by="outsider", root=isolated)
    state = pipeline.decide(other, "stop", "withdrawn", reason="the rota system will do it", by="outsider", root=isolated)
    assert state["status"] == "stopped" and state["gates"]["1"]["by"] == "outsider"


def test_an_owner_who_is_the_only_approver_signs_off_with_a_note(reg, isolated):
    approvers(isolated, "maker")
    slug = owned(isolated, reg, "maker")
    state = pipeline.decide(slug, "go", "go", by="maker", root=isolated)
    assert "only approver" in state["gates"]["1"]["note"]


def test_develop_records_the_owner(reg, isolated):
    entry = pipeline.add(reg, "Shift swap board")
    folder = pipeline.develop(reg, entry["id"], root=isolated, owner="maker")
    assert lib.load_state(folder.name, isolated)["owner"] == "maker"


# ---------------------------------------------------------------- the roadmap
def test_a_programme_needs_its_roadmap_at_gate_1(reg, isolated):
    slug = developed(isolated, reg, "Field scheduling programme", classes=())
    edit_assessment(isolated, slug, lambda a: a.update(scale="programme"))
    assert blocked(gate_findings(isolated, slug), "roadmap.md  missing: a programme needs its roadmap")
    scaffold.new_roadmap(slug, isolated)
    assert blocked(gate_findings(isolated, slug), "roadmap.md  placeholder text left")


@pytest.mark.parametrize(("epics", "fragment"), [
    ("| Epic | Name | Kind | A | T | D | After |\n|---|---|---|---|---|---|---|\n| E1 | One | spike | q | 1 | - | x |\n", "at least two epics"),
    (EPICS.replace("| build |", "| phase |"), "E2: kind is spike, build, project, not phase"),
    (EPICS.replace("| 3 | E1 |", "| 3 | E3 |"), "E2 depends on E3, which is not an earlier epic"),
    (EPICS.replace("| 1 | - |", "| 1 | E2 |"), "no epic can start"),
])
def test_the_epics_table_must_hold_together(reg, isolated, epics, fragment):
    slug = programme(isolated, reg, epics)
    assert blocked(gate_findings(isolated, slug), fragment)


def test_ambers_without_a_spike_epic_are_warned(reg, isolated):
    slug = programme(isolated, reg, EPICS.replace("| spike |", "| build |").replace("| 1 | - |", "| 2 | - |"), data="amber")
    f = gate_findings(isolated, slug)
    assert not f.blockers and any("no spike epic" in w for w in f.warnings)


def test_a_programme_goes_ahead_on_its_roadmap_not_as_one_build(reg, isolated):
    slug = programme(isolated, reg)
    assert gate_findings(isolated, slug).blockers == []
    with pytest.raises(lib.FactoryError, match="goes ahead on its roadmap"):
        pipeline.decide(slug, "go", "go", by="steadytack", root=isolated, route="full")
    state = pipeline.decide(slug, "go", "approve the roadmap", by="steadytack", root=isolated)
    assert (state["stage"], state["route"]) == ("roadmap", "roadmap") and "start E1" in state["next"]
    assert lib.validate("state", state, isolated) == [] and pipeline.in_flight(pipeline.assessed_ideas(isolated)) == []
    app = developed(isolated, reg, "Rota planner", classes=())
    with pytest.raises(lib.FactoryError, match="for a project or programme"):
        pipeline.decide(app, "go", "go", by="steadytack", root=isolated, route="roadmap")


def test_each_epic_is_an_idea_of_its_own_started_in_order(reg, isolated):
    slug = programme(isolated, reg)
    state = lib.load_state(slug, isolated)
    state["owner"] = "maker"
    lib.save_state(slug, state, isolated)
    with pytest.raises(lib.FactoryError, match="no approved roadmap"):
        pipeline.start_epic(reg, slug, "E1", root=isolated)
    pipeline.decide(slug, "go", "approve the roadmap", by="steadytack", root=isolated)
    with pytest.raises(lib.FactoryError, match="E2 depends on E1, which has not finished"):
        pipeline.start_epic(reg, slug, "E2", root=isolated)
    with pytest.raises(lib.FactoryError, match="outside the factory"):
        pipeline.start_epic(reg, slug, "E3", root=isolated)
    with pytest.raises(lib.FactoryError, match="E9 is not an epic"):
        pipeline.start_epic(reg, slug, "E9", root=isolated)
    folder = pipeline.start_epic(reg, slug, "E1", root=isolated)
    child = lib.load_state(folder.name, isolated)
    assert (folder.name, child["parent"], child["epic"], child["owner"]) == (f"{slug}-e1", slug, "E1", "maker")
    assert "Epic E1 of the roadmap" in (folder / "idea.md").read_text(encoding="utf-8")
    assert lib.validate("pipeline", reg, isolated) == []
    with pytest.raises(lib.FactoryError, match="already started"):
        pipeline.start_epic(reg, slug, "E1", root=isolated)
    report = pipeline.render(reg, isolated)
    assert "## Roadmaps" in report and f"`ideas/{slug}-e1/` | develop, in-progress |" in report
    assert "| E3 Live job feed | project | E2 | - | outside the factory |" in report
    assert f"(E1 of {slug})" in status.table(status.collect(isolated))
    child.update(status="stopped")
    lib.save_state(folder.name, child, isolated)
    with pytest.raises(lib.FactoryError, match="E1, which stopped: revise the roadmap"):
        pipeline.start_epic(reg, slug, "E2", root=isolated)


def test_the_command_line(reg, isolated, py):
    script = str(isolated / "factory/scripts/pipeline.py")
    slug = programme(isolated, reg)
    out = run([py, script, "decide", slug, "go", "--reply", "approve"], isolated)
    assert out.returncode == 1 and "signed off by name (--by <approver>)" in out.stderr
    out = run([py, script, "decide", slug, "go", "--by", "steadytack", "--reply", "approve"], isolated)
    assert out.returncode == 0 and "signed off by steadytack" in out.stdout
    out = run([py, script, "epic", slug, "E1", "--owner", "maker"], isolated)
    assert out.returncode == 0 and f"E1 of {slug} developing in ideas/{slug}-e1/" in out.stdout
