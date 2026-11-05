"""Gate 1 that develops rather than blocks: a Get Ready idea has an owner and a review date, and Go can be a spike
(tier 1, the light route) that grows to the tier the owner names."""

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


def planned(root, reg, idea: str = "Shift swap board", timebox: float = 2, **kw) -> str:
    """An idea developed as a spike: its one-page card (spike.md) written and filled in, recommended Go."""
    entry = pipeline.add(reg, idea)
    folder = pipeline.develop(reg, entry["id"], root=root, spike=True)
    path = folder / pipeline.CARD
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")), encoding="utf-8")
    edit_assessment(root, folder.name, lambda a: a["decision"].update(timebox=timebox, **kw))
    lib.write_json(root / pipeline.REGISTER, reg)
    return folder.name


def later(days: int) -> str:
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


# ---------------------------------------------------------------- Get Ready: an owner and a review date
def test_get_ready_needs_an_owner_and_defaults_the_review_to_four_weeks(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=(), data="red", recommended="get-ready", fix=["data"])
    with pytest.raises(lib.FactoryError, match="--owner"):
        pipeline.decide(slug, "get-ready", "get ready", by="steadytack", root=isolated)
    state = pipeline.decide(slug, "get-ready", "get ready", by="steadytack", root=isolated, owner="Data team")
    assert state["assessment"]["owner"] == "Data team" and state["assessment"]["review"] == later(28)
    assert f"Data team fixes Data Foundations by {later(28)}" in state["next"]
    assert lib.validate("state", state, isolated) == []
    report = pipeline.render(reg, isolated)
    assert "## Getting ready" in report and f"| Data Foundations | Data team | {later(28)} |  |" in report


@pytest.mark.parametrize(("review", "fragment"), [("2020-01-01", "is in the past"), ("next week", "not YYYY-MM-DD")])
def test_a_review_date_must_be_a_date_to_come(reg, isolated, review, fragment):
    slug = developed(isolated, reg, "Shift swap board", classes=(), data="red", recommended="get-ready", fix=["data"])
    with pytest.raises(lib.FactoryError, match=fragment):
        pipeline.decide(slug, "get-ready", "get ready", by="steadytack", root=isolated, owner="Data team", review=review)


def test_an_idea_past_its_review_date_is_flagged(reg, isolated):
    slug = developed(isolated, reg, "Shift swap board", classes=(), data="red", recommended="get-ready", fix=["data"])
    pipeline.decide(slug, "get-ready", "get ready", by="steadytack", root=isolated, owner="Data team", review=later(7))
    assert "past review" not in pipeline.summary(isolated)
    edit_assessment(isolated, slug, lambda a: a["decision"].update(review="2026-01-01"))
    a, _ = pipeline.read_assessment(lib.idea_dir(slug, isolated), isolated)
    assert pipeline.overdue(a) and not pipeline.overdue(a, today="2025-12-31")
    assert "1 getting ready (1 past review)" in pipeline.summary(isolated)
    assert "**overdue**: back to Gate 1" in pipeline.render(reg, isolated)
    assert "Data team, review 2026-01-01, overdue" in pipeline.decision_text(a)


# ---------------------------------------------------------------- the light route
def test_a_spike_is_one_card(reg, isolated):
    entry = pipeline.add(reg, "Shift swap board")
    folder = pipeline.develop(reg, entry["id"], root=isolated, spike=True)
    assert sorted(p.name for p in folder.iterdir() if p.is_file()) == ["changes.md", "decisions.md", "idea.md", "spike.md", "state.json"]
    assert "spike card" in lib.load_state(folder.name, isolated)["next"]
    f = gate_findings(isolated, folder.name)
    assert blocked(f, "spike.md  placeholder text left") and not blocked(f, "idea-brief.md") and not blocked(f, "overview.md")
    path = folder / pipeline.CARD
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")).replace("## Time box", "## When"), encoding="utf-8")
    assert blocked(gate_findings(isolated, folder.name), "no '## Time box' section")


def test_go_as_a_spike_goes_straight_to_build_at_tier_1(reg, isolated):
    slug = planned(isolated, reg)
    assert gate_findings(isolated, slug).blockers == []
    assert "## Spikes" in pipeline.render(reg, isolated) and "## Being developed" not in pipeline.render(reg, isolated)
    state = pipeline.decide(slug, "go", "approve [meaning: Go as a spike]", by="steadytack", root=isolated)
    assert (state["stage"], state["route"], state["tier"]) == ("build", "light", 1)
    assert state["gates"]["1"]["status"] == state["gates"]["2"]["status"] == "approved"
    assert "Build the spike to spike.md within 2 person-week(s)" in state["next"] and lib.validate("state", state, isolated) == []
    card = (lib.idea_dir(slug, isolated) / pipeline.CARD).read_text(encoding="utf-8")
    assert f'{lib.today()}, steadytack: "approve [meaning: Go as a spike]". Go as a spike' in card
    assert "Not signed off yet" not in card and card.rstrip().endswith(".")
    assert "Go as a spike (" in pipeline.render(reg, isolated)
    assert "| build (light) |" in status.table(status.collect(isolated))


def test_the_light_route_needs_a_card_and_a_card_the_light_route(reg, isolated):
    full = developed(isolated, reg, "Rota planner", classes=())
    with pytest.raises(lib.FactoryError, match="needs its card"):
        pipeline.decide(full, "go", "go as a spike", by="steadytack", root=isolated, route="light")
    edit_assessment(isolated, full, lambda a: a["decision"].update(route="light"))
    assert blocked(gate_findings(isolated, full), "the light route has a spike card")
    spike = planned(isolated, reg, "Tide times", timebox=1)
    with pytest.raises(lib.FactoryError, match="takes the light route"):
        pipeline.decide(spike, "go", "go, the full route", by="steadytack", root=isolated, route="full")
    state = pipeline.decide(spike, "go", "go as a spike", by="steadytack", root=isolated)
    assert (state["route"], state["tier"]) == ("light", 1) and "within 1 person-week(s)" in state["next"]


def test_a_spike_card_is_go_or_stop(reg, isolated):
    slug = planned(isolated, reg, recommended="get-ready")
    assert blocked(gate_findings(isolated, slug), "a spike card is Go or Stop")
    edit_assessment(isolated, slug, lambda a: a["decision"].update(recommended="stop"))
    state = pipeline.decide(slug, "stop", "stop", reason="no one to rank the plans", by="steadytack", root=isolated)
    assert state["status"] == "stopped" and "## Being developed" not in pipeline.render(reg, isolated)


def built_light(root, reg, names):
    slugs = [planned(root, reg, name) for name in names]
    for slug in slugs:
        pipeline.decide(slug, "go", "approve", by="steadytack", root=root)
        learned.new_outcome(slug, root)
        fill(root, slug, actual=2.0)
    return slugs


def test_the_light_route_ends_with_grow_keep_or_stop_after_its_outcome(reg, isolated):
    slug = planned(isolated, reg)
    pipeline.decide(slug, "go", "approve", by="steadytack", root=isolated)
    with pytest.raises(lib.FactoryError, match="outcome.md is missing"):
        pipeline.end_light(slug, "grow", "grow", by="steadytack", root=isolated)
    learned.new_outcome(slug, isolated)
    o, _ = learned.read_outcome(lib.idea_dir(slug, isolated), isolated)
    assert o["effort"]["estimated"] == 2  # the time box, not the RICE effort
    to2, grow4, keep, stop = built_light(isolated, reg, ("To tier two", "To tier four", "Kept", "Stopped"))
    with pytest.raises(lib.FactoryError, match="grow names the tier"):
        pipeline.end_light(to2, "grow", "grow it", by="steadytack", root=isolated)
    with pytest.raises(lib.FactoryError, match="grow names the tier"):
        pipeline.end_light(to2, "grow", "grow it", by="steadytack", root=isolated, tier=1)
    grow = pipeline.end_light(to2, "grow", "make it a prototype", by="steadytack", root=isolated, tier=2)
    assert (grow["stage"], grow["status"], grow["tier"]) == ("spec", "in-progress", 2) and "route" not in grow
    assert grow["light"] == {"result": "grow", "to_tier": 2, "date": lib.today(), "reply": "make it a prototype", "by": "steadytack"}
    assert grow["gates"]["2"] == grow["gates"]["3"] == {"status": "not-reached"}
    to4 = pipeline.end_light(grow4, "grow", "to production", by="steadytack", root=isolated, tier=3)
    assert (to4["stage"], to4["tier"]) == ("spec", 3)
    scaffold.new_definition(grow4, isolated)
    assert '"maturity_tier": {"value": 3, "state": "recommended",' in (lib.idea_dir(grow4, isolated) / "application-definition.md").read_text(encoding="utf-8")
    kept = pipeline.end_light(keep, "keep", "keep", by="steadytack", root=isolated)
    assert (kept["stage"], kept["gates"]["3"]["status"]) == ("publish", "approved") and "publish the spike" in kept["next"]
    with pytest.raises(lib.FactoryError, match="needs its reason"):
        pipeline.end_light(stop, "stop", "stop", by="steadytack", root=isolated)
    stopped = pipeline.end_light(stop, "stop", "stop", reason="nobody used it", by="steadytack", root=isolated)
    assert (stopped["status"], stopped["gates"]["3"]["status"]) == ("stopped", "stopped") and "nobody used it" in stopped["next"]
    for state in (grow, to4, kept, stopped):
        assert lib.validate("state", state, isolated) == []
    with pytest.raises(lib.FactoryError, match="not on the light route in Build"):
        pipeline.end_light(to2, "keep", "keep", by="steadytack", root=isolated)


def test_the_command_line(reg, isolated, py):
    script = str(isolated / "factory/scripts/pipeline.py")
    assert run([py, script, "add", "Shift swap board"], isolated).returncode == 0
    out = run([py, script, "develop", "IDEA-001", "--spike"], isolated)
    assert out.returncode == 0 and "(write spike.md)" in out.stdout
    slug = "shift-swap-board"
    path = lib.idea_dir(slug, isolated) / pipeline.CARD
    path.write_text(lib.PLACEHOLDER.sub("filled", path.read_text(encoding="utf-8")), encoding="utf-8")
    out = run([py, script, "decide", slug, "go", "--route", "light", "--timebox", "0.5", "--by", "steadytack", "--reply", "spike"], isolated)
    assert out.returncode == 0 and "the spike to spike.md within 0.5 person-week(s)" in out.stdout
    learned.new_outcome(slug, isolated)
    fill(isolated, slug, actual=0.5)
    out = run([py, script, "light", slug, "grow", "--tier", "3", "--by", "steadytack", "--reply", "grow"], isolated)
    assert out.returncode == 0 and "light route: Grow; Grow to tier 3" in out.stdout
    other = developed(isolated, reg, "Rota planner", classes=(), data="red", recommended="get-ready", fix=["data"])
    out = run([py, script, "decide", other, "get-ready", "--by", "steadytack", "--reply", "get ready", "--owner", "Data team", "--review", later(14)], isolated)
    assert out.returncode == 0 and f"Data team fixes Data Foundations by {later(14)}" in out.stdout
