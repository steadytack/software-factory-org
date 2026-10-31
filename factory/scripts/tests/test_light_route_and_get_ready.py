"""Gate 1 that develops rather than blocks: a Get Ready idea has an owner and a review date, and Go can take the light
route (tier 1, a spike, or tier 2, an exploration prototype)."""

import datetime as dt

import factory_lib as lib
import learned
import pipeline
import pytest
import scaffold
import status
from conftest import run
from test_learned import fill
from test_pipeline import blocked, developed, edit_assessment, gate_findings, isolated, reg  # noqa: F401 (fixtures)


def planned(root, reg, idea: str = "Shift swap board", tier: int = 1, **kw) -> str:
    """An idea recommended for the light route at `tier`, with its plan written and filled in."""
    slug = developed(root, reg, idea, classes=(), **kw)
    edit_assessment(root, slug, lambda a: a["decision"].update(route="light", tier=tier, timebox=2))
    path = scaffold.new_plan(slug, root)
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")), encoding="utf-8")
    return slug


def later(days: int) -> str:
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


# ---------------------------------------------------------------- Get Ready: an owner and a review date
def test_get_ready_needs_an_owner_and_defaults_the_review_to_four_weeks(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=(), data="red", recommended="get-ready", fix=["data"])
    with pytest.raises(lib.FactoryError, match="--owner"):
        pipeline.decide(slug, "get-ready", "get ready", root=isolated)
    state = pipeline.decide(slug, "get-ready", "get ready", root=isolated, owner="Data team")
    assert state["assessment"]["owner"] == "Data team" and state["assessment"]["review"] == later(28)
    assert f"Data team fixes Data Foundations by {later(28)}" in state["next"]
    assert lib.validate("state", state, isolated) == []
    report = pipeline.render(reg, isolated)
    assert "## Getting ready" in report and f"| Data Foundations | Data team | {later(28)} |  |" in report


@pytest.mark.parametrize(("review", "fragment"), [("2020-01-01", "is in the past"), ("next week", "not YYYY-MM-DD")])
def test_a_review_date_must_be_a_date_to_come(reg, isolated, review, fragment):
    slug = developed(isolated, reg, "Shift swap board", classes=(), data="red", recommended="get-ready", fix=["data"])
    with pytest.raises(lib.FactoryError, match=fragment):
        pipeline.decide(slug, "get-ready", "get ready", root=isolated, owner="Data team", review=review)


def test_an_idea_past_its_review_date_is_flagged(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=(), data="red", recommended="get-ready", fix=["data"])
    pipeline.decide(slug, "get-ready", "get ready", root=isolated, owner="Data team", review=later(7))
    assert "past review" not in pipeline.summary(isolated)
    edit_assessment(isolated, slug, lambda a: a["decision"].update(review="2026-01-01"))
    a, _ = pipeline.read_assessment(lib.idea_dir(slug, isolated), isolated)
    assert pipeline.overdue(a) and not pipeline.overdue(a, today="2025-12-31")
    assert "1 getting ready (1 past review)" in pipeline.summary(isolated)
    assert "**overdue**: back to Gate 1" in pipeline.render(reg, isolated)
    assert "Data team, review 2026-01-01, overdue" in pipeline.decision_text(a)


# ---------------------------------------------------------------- the light route
def test_the_light_route_needs_its_plan_and_no_overview(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=())
    edit_assessment(isolated, slug, lambda a: a["decision"].update(route="light", tier=2, timebox=2))
    (lib.idea_dir(slug, isolated) / "overview.md").unlink()
    assert blocked(gate_findings(isolated, slug), "plan.md  missing")
    scaffold.new_plan(slug, isolated)
    f = gate_findings(isolated, slug)
    assert blocked(f, "plan.md  placeholder text left")
    assert not blocked(f, "overview.md")
    path = lib.idea_dir(slug, isolated) / "plan.md"
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")).replace("## Time box", "## When"), encoding="utf-8")
    assert blocked(gate_findings(isolated, slug), "no '## Time box' section")
    with pytest.raises(lib.FactoryError, match="already exists"):
        scaffold.new_plan(slug, isolated)


def test_go_as_a_spike_goes_straight_to_build_at_tier_1(reg, isolated):
    slug = planned(isolated, reg, people="amber")
    assert gate_findings(isolated, slug).blockers == []
    assert "recommended Go as a spike" in pipeline.render(reg, isolated)
    state = pipeline.decide(slug, "go", "approve", root=isolated)
    assert (state["stage"], state["route"], state["tier"]) == ("build", "light", 1)
    assert state["gates"]["1"]["status"] == state["gates"]["2"]["status"] == "approved"
    assert "Build a spike to plan.md within 2 person-week(s)" in state["next"] and lib.validate("state", state, isolated) == []
    assert "Go as a spike (" in pipeline.render(reg, isolated)
    assert "| build (light) |" in status.table(status.collect(isolated))


def test_go_as_a_prototype_is_tier_2_and_the_route_can_be_chosen_at_the_gate(reg, isolated):
    slug = planned(isolated, reg, tier=2)
    assert "recommended Go as a prototype" in pipeline.render(reg, isolated)
    state = pipeline.decide(slug, "go", "approve", root=isolated)
    assert state["tier"] == 2 and "Build an exploration prototype" in state["next"]
    other = developed(isolated, reg, "Rota planner", classes=())
    with pytest.raises(lib.FactoryError, match="needs its plan"):
        pipeline.decide(other, "go", "go as a spike", root=isolated, route="light")
    scaffold.new_plan(other, isolated)
    path = lib.idea_dir(other, isolated) / "plan.md"
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")), encoding="utf-8")
    with pytest.raises(lib.FactoryError, match="tier 1 .a spike. or 2"):
        pipeline.decide(other, "go", "go", root=isolated, route="light", tier=3)
    state = pipeline.decide(other, "go", "go as a spike", root=isolated, route="light")
    assert (state["route"], state["tier"]) == ("light", 1) and "within 1 person-week(s)" in state["next"]  # the default time box
    third = planned(isolated, reg, "Tide times")
    state = pipeline.decide(third, "go", "go, the full route", root=isolated, route="full")
    assert state["stage"] == "spec" and "route" not in state


def test_the_light_route_is_refused_with_a_red_foundation(reg, isolated):
    slug = planned(isolated, reg, data="red", recommended="get-ready", fix=["data"])
    with pytest.raises(lib.FactoryError, match="cannot have a red foundation"):
        pipeline.decide(slug, "go", "spike it", root=isolated, route="light")


def built_light(root, reg, names, tier=1):
    slugs = [planned(root, reg, name, tier=tier) for name in names]
    for slug in slugs:
        pipeline.decide(slug, "go", "approve", root=root)
        learned.new_outcome(slug, root)
        fill(root, slug, actual=2.0)
    return slugs


def test_the_light_route_ends_with_grow_keep_or_stop_after_its_outcome(reg, isolated):
    slug = planned(isolated, reg)
    pipeline.decide(slug, "go", "approve", root=isolated)
    with pytest.raises(lib.FactoryError, match="outcome.md is missing"):
        pipeline.end_light(slug, "grow", "grow", root=isolated)
    learned.new_outcome(slug, isolated)
    o, _ = learned.read_outcome(lib.idea_dir(slug, isolated), isolated)
    assert o["effort"]["estimated"] == 2  # the time box, not the RICE effort
    spike, grow3, keep, stop = built_light(isolated, reg, ("A spike", "To tier three", "Kept", "Stopped"))

    to2 = pipeline.end_light(spike, "grow", "make it a prototype", root=isolated, tier=2)
    assert (to2["stage"], to2["route"], to2["tier"]) == ("build", "light", 2)
    assert to2["light"] == {"result": "grow", "tier": 1, "to_tier": 2, "date": lib.today(), "reply": "make it a prototype"}
    assert to2["gates"]["3"] == {"status": "not-reached"} and "revise plan.md" in to2["next"]
    with pytest.raises(lib.FactoryError, match="grows to a higher tier"):
        pipeline.end_light(spike, "grow", "again", root=isolated, tier=2)
    to4 = pipeline.end_light(spike, "grow", "to production", root=isolated, tier=4)
    assert (to4["stage"], to4["tier"]) == ("spec", 4) and "route" not in to4

    grow = pipeline.end_light(grow3, "grow", "grow it", root=isolated)
    assert (grow["stage"], grow["status"], grow["tier"]) == ("spec", "in-progress", 3) and "route" not in grow
    assert grow["gates"]["2"] == grow["gates"]["3"] == {"status": "not-reached"}
    kept = pipeline.end_light(keep, "keep", "keep", root=isolated)
    assert (kept["stage"], kept["gates"]["3"]["status"]) == ("publish", "approved") and "synthetic data only" in kept["next"]
    with pytest.raises(lib.FactoryError, match="needs its reason"):
        pipeline.end_light(stop, "stop", "stop", root=isolated)
    stopped = pipeline.end_light(stop, "stop", "stop", reason="nobody used it", root=isolated)
    assert (stopped["status"], stopped["gates"]["3"]["status"]) == ("stopped", "stopped") and "nobody used it" in stopped["next"]
    for state in (to2, to4, grow, kept, stopped):
        assert lib.validate("state", state, isolated) == []
    with pytest.raises(lib.FactoryError, match="not on the light route in Build"):
        pipeline.end_light(grow3, "keep", "keep", root=isolated)


def test_the_command_line(reg, isolated, py):
    script = str(isolated / "factory/scripts/pipeline.py")
    slug = developed(isolated, reg, "Shift swap board", classes=())
    assert run([py, str(isolated / "factory/scripts/scaffold.py"), "plan", slug], isolated).returncode == 0
    path = lib.idea_dir(slug, isolated) / "plan.md"
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")), encoding="utf-8")
    out = run([py, script, "decide", slug, "go", "--route", "light", "--tier", "2", "--timebox", "0.5", "--reply", "prototype"], isolated)
    assert out.returncode == 0 and "an exploration prototype to plan.md within 0.5 person-week(s)" in out.stdout
    learned.new_outcome(slug, isolated)
    fill(isolated, slug, actual=0.5)
    out = run([py, script, "light", slug, "grow", "--tier", "4", "--reply", "grow"], isolated)
    assert out.returncode == 0 and "light route: Grow; Grow to tier 4" in out.stdout
    other = developed(isolated, reg, "Rota planner", classes=(), data="red", recommended="get-ready", fix=["data"])
    out = run([py, script, "decide", other, "get-ready", "--reply", "get ready", "--owner", "Data team", "--review", later(14)], isolated)
    assert out.returncode == 0 and f"Data team fixes Data Foundations by {later(14)}" in out.stdout
