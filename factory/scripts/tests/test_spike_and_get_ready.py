"""Gate 1 that develops rather than blocks: a Get Ready idea has an owner and a review date, and Go can be a spike."""

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


def spiked(root, reg, idea: str = "Shift swap board", **kw) -> str:
    """An idea recommended as a spike, with its plan written and filled in."""
    slug = developed(root, reg, idea, classes=(), **kw)
    edit_assessment(root, slug, lambda a: a["decision"].update(route="spike", timebox=2))
    path = scaffold.new_spike(slug, root)
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


# ---------------------------------------------------------------- Go as a spike
def test_a_spike_needs_its_plan_and_no_overview(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=())
    edit_assessment(isolated, slug, lambda a: a["decision"].update(route="spike", timebox=2))
    (lib.idea_dir(slug, isolated) / "overview.md").unlink()
    assert blocked(gate_findings(isolated, slug), "spike.md  missing")
    scaffold.new_spike(slug, isolated)
    f = gate_findings(isolated, slug)
    assert blocked(f, "spike.md  placeholder text left")
    assert not blocked(f, "overview.md")
    path = lib.idea_dir(slug, isolated) / "spike.md"
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")).replace("## Time box", "## When"), encoding="utf-8")
    assert blocked(gate_findings(isolated, slug), "no '## Time box' section")
    with pytest.raises(lib.FactoryError, match="already exists"):
        scaffold.new_spike(slug, isolated)


def test_go_as_a_spike_goes_straight_to_build_at_tier_1(reg, isolated):
    slug = spiked(isolated, reg, people="amber")
    assert gate_findings(isolated, slug).blockers == []
    assert "recommended Go as a spike" in pipeline.render(reg, isolated)
    state = pipeline.decide(slug, "go", "approve", root=isolated)
    assert (state["stage"], state["route"], state["tier"]) == ("build", "spike", 1)
    assert state["gates"]["1"]["status"] == state["gates"]["2"]["status"] == "approved"
    assert "within 2 person-week(s)" in state["next"] and lib.validate("state", state, isolated) == []
    assert "Go as a spike (" in pipeline.render(reg, isolated)
    assert "| build (spike) |" in status.table(status.collect(isolated))


def test_go_can_be_a_spike_when_asked_and_full_when_asked(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=())
    with pytest.raises(lib.FactoryError, match="a spike needs its plan"):
        pipeline.decide(slug, "go", "go as a spike", root=isolated, route="spike")
    scaffold.new_spike(slug, isolated)
    path = lib.idea_dir(slug, isolated) / "spike.md"
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")), encoding="utf-8")
    state = pipeline.decide(slug, "go", "go as a spike", root=isolated, route="spike")
    assert state["route"] == "spike" and "within 1 person-week(s)" in state["next"]  # the default time box
    other = spiked(isolated, reg, "Rota planner")
    state = pipeline.decide(other, "go", "go, the full route", root=isolated, route="full")
    assert state["stage"] == "spec" and "route" not in state


def test_a_spike_is_refused_with_a_red_foundation(reg, isolated):
    slug = spiked(isolated, reg, data="red", recommended="get-ready", fix=["data"])
    with pytest.raises(lib.FactoryError, match="cannot have a red foundation"):
        pipeline.decide(slug, "go", "spike it", root=isolated, route="spike")


def test_a_spike_ends_with_grow_keep_or_stop_after_its_outcome(reg, isolated):
    slugs = [spiked(isolated, reg, name) for name in ("Shift swap board", "Rota planner", "Tide times")]
    for slug in slugs:
        pipeline.decide(slug, "go", "approve", root=isolated)
    with pytest.raises(lib.FactoryError, match="outcome.md is missing"):
        pipeline.end_spike(slugs[0], "grow", "grow", root=isolated)
    for slug in slugs:
        learned.new_outcome(slug, isolated)
        o, _ = learned.read_outcome(lib.idea_dir(slug, isolated), isolated)
        assert o["effort"]["estimated"] == 2  # the time box, not the RICE effort
        fill(isolated, slug, actual=2.0)

    grow = pipeline.end_spike(slugs[0], "grow", "grow it", root=isolated)
    assert (grow["stage"], grow["status"], grow["tier"]) == ("spec", "in-progress", None) and "route" not in grow
    assert grow["gates"]["2"] == grow["gates"]["3"] == {"status": "not-reached"} and grow["spike"]["result"] == "grow"
    keep = pipeline.end_spike(slugs[1], "keep", "keep", root=isolated)
    assert (keep["stage"], keep["gates"]["3"]["status"]) == ("publish", "approved")
    with pytest.raises(lib.FactoryError, match="needs its reason"):
        pipeline.end_spike(slugs[2], "stop", "stop", root=isolated)
    stop = pipeline.end_spike(slugs[2], "stop", "stop", reason="nobody used it", root=isolated)
    assert (stop["status"], stop["gates"]["3"]["status"]) == ("stopped", "stopped") and "nobody used it" in stop["next"]
    for state in (grow, keep, stop):
        assert lib.validate("state", state, isolated) == []
    with pytest.raises(lib.FactoryError, match="not a spike in Build"):
        pipeline.end_spike(slugs[0], "keep", "keep", root=isolated)


def test_the_command_line(reg, isolated, py):
    script = str(isolated / "factory/scripts/pipeline.py")
    slug = developed(isolated, reg, "Shift swap board", classes=())
    assert run([py, str(isolated / "factory/scripts/scaffold.py"), "spike", slug], isolated).returncode == 0
    path = lib.idea_dir(slug, isolated) / "spike.md"
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")), encoding="utf-8")
    out = run([py, script, "decide", slug, "go", "--route", "spike", "--timebox", "0.5", "--reply", "spike"], isolated)
    assert out.returncode == 0 and "within 0.5 person-week(s)" in out.stdout
    learned.new_outcome(slug, isolated)
    fill(isolated, slug, actual=0.5)
    out = run([py, script, "spike", slug, "grow", "--reply", "grow"], isolated)
    assert out.returncode == 0 and "spike ended: Grow" in out.stdout
    other = developed(isolated, reg, "Rota planner", classes=(), data="red", recommended="get-ready", fix=["data"])
    out = run([py, script, "decide", other, "get-ready", "--reply", "get ready", "--owner", "Data team", "--review", later(14)], isolated)
    assert out.returncode == 0 and f"Data team fixes Data Foundations by {later(14)}" in out.stdout
