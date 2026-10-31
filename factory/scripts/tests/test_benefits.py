"""The benefits review after Publish (learned.py benefits), the reviews due in the pipeline, and the WIP limit (DEF-23)."""

import json

import factory_lib as lib
import learned
import pipeline
import pytest
from conftest import run
from test_learned import built
from test_pipeline import isolated, reg  # noqa: F401 (fixtures)


def published(root, reg, idea: str) -> str:
    slug = built(root, reg, idea)
    state = lib.read_json(lib.idea_dir(slug, root) / "state.json")
    state.update(stage="done", status="done")
    lib.write_json(lib.idea_dir(slug, root) / "state.json", state)
    return slug


def review(root, slug: str, day: int, reach: float, impact="yes", met="yes", lessons=()) -> None:
    """Fill in one review as done."""
    idea = lib.idea_dir(slug, root)
    b, _ = learned.read_benefits(idea, root)
    rv = next(r for r in b["reviews"] if r["day"] == day)
    rv.update(done="2026-12-01", lessons=list(lessons))
    rv["measures"] = [{"measure": "Swaps arranged without a manager", "target": "8 in 10", "actual": "7 in 10, from the board", "met": met}]
    rv["reach"] = {"actual": reach, "note": "counted from the board's log"}
    rv["impact"] = {"held": impact, "note": "the managers said so"}
    rv["in_use"] = {"held": "yes", "note": "used every week"}
    path = idea / learned.BENEFITS
    text = path.read_text(encoding="utf-8")
    path.write_text("```json benefits\n" + json.dumps(b, indent=2) + "\n```" + learned.BENEFITS_BLOCK.sub("", text), encoding="utf-8")


def test_the_review_is_written_only_after_publish(reg, isolated):
    slug = built(isolated, reg, "Shift swap board")
    with pytest.raises(lib.FactoryError, match="not published yet"):
        learned.new_benefits(slug, root=isolated)
    slug = published(isolated, reg, "Rota planner")
    learned.new_benefits(slug, "2026-11-01", isolated)
    b, bad = learned.read_benefits(lib.idea_dir(slug, isolated), isolated)
    assert bad == [] and b["estimated"] == {"reach": 40, "period": "per month", "impact": 2}
    assert [(r["day"], r["due"], r["done"]) for r in b["reviews"]] == [(30, "2026-12-01", None), (90, "2027-01-30", None)]
    with pytest.raises(lib.FactoryError, match="already exists"):
        learned.new_benefits(slug, root=isolated)
    assert learned.problems(isolated) == []  # a fresh stub is valid; the review check wants it filled


def test_a_review_counts_only_when_filled_in(reg, isolated):
    slug = published(isolated, reg, "Shift swap board")
    learned.new_benefits(slug, "2026-11-01", isolated)
    found = learned.benefits_check(slug, 30, isolated)
    assert any("done is not set" in p for p in found) and any("reach actual is not measured" in p for p in found)
    assert any("placeholder left" in p for p in found)
    review(isolated, slug, 30, reach=0)  # nobody used it is a real answer
    assert learned.benefits_check(slug, 30, isolated) == []
    assert learned.benefits_check(slug, 60, isolated) == ["--review must be 30 or 90"]


def test_reviews_due_are_listed_and_flagged_overdue(reg, isolated):
    slug = published(isolated, reg, "Shift swap board")
    learned.new_benefits(slug, "2026-01-01", isolated)
    due = learned.reviews_due(isolated, today="2026-03-01")
    assert [(d["day"], d["overdue"]) for d in due] == [(30, True), (90, False)]
    report = pipeline.render(pipeline.load(isolated), isolated)
    assert "## Benefits reviews due" in report and "| 30 days | 2026-01-31 | **overdue** |" in report
    assert "benefits review(s) overdue" in pipeline.line(pipeline.counts(pipeline.load(isolated), pipeline.assessed_ideas(isolated), isolated))
    review(isolated, slug, 30, reach=40)
    assert [d["day"] for d in learned.reviews_due(isolated, today="2026-03-01")] == [90]


def test_reviews_turn_into_candidates_across_ideas(reg, isolated):
    lesson = {"kind": "rice", "ref": "reach", "lesson": "count the people who would really switch"}
    for idea in ("Shift swap board", "Rota planner"):
        slug = published(isolated, reg, idea)
        learned.new_benefits(slug, "2026-11-01", isolated)
        review(isolated, slug, 30, reach=30)
        review(isolated, slug, 90, reach=10, impact="no", met="no", lessons=[lesson])
    found = learned.review(isolated)
    assert "Re-calibrate RICE reach? Reach in use was 0.25x the Gate 1 estimate (median of 2 published ideas)" in found
    assert "Re-calibrate RICE impact? Impact did not hold in 2 published ideas (rota-planner, shift-swap-board)" in found
    assert any(c.startswith("Review the business-value screening questions? Success measures were missed in 2") for c in found)
    assert "Change the rice reach? The same lesson came up in 2 builds (rota-planner, shift-swap-board)" in found


def test_the_command_line(reg, isolated, py):
    script = str(isolated / "factory/scripts/learned.py")
    slug = published(isolated, reg, "Shift swap board")
    out = run([py, script, "benefits", slug, "--published", "2026-11-01"], isolated)
    assert out.returncode == 0 and f"ideas/{slug}/benefits.md" in out.stdout
    out = run([py, script, "check", slug, "--review", "30"], isolated)
    assert out.returncode == 1 and "done is not set" in out.stdout
    review(isolated, slug, 30, reach=40)
    assert run([py, script, "check", slug, "--review", "30"], isolated).stdout.strip() == "learned: OK"


# ---------------------------------------------------------------- the work-in-progress limit (DEF-23)
def test_ideas_in_flight_are_counted_against_the_limit(reg, isolated):
    assert pipeline.wip_limit(isolated) == 3
    for idea in ("Shift swap board", "Rota planner", "Leave tracker", "Desk booking"):
        slug = built(isolated, reg, idea)
        assert lib.read_json(lib.idea_dir(slug, isolated) / "state.json")["stage"] == "spec"
    report = pipeline.render(pipeline.load(isolated), isolated)
    assert "In flight (past Gate 1, not yet published): 4 of 3 (DEF-23). **Over the limit**" in report


def test_no_limit_when_the_default_is_not_set(isolated):
    for rel in pipeline.DEFAULTS:
        path = isolated / rel
        if path.exists():
            path.write_text("\n".join(r for r in path.read_text(encoding="utf-8").splitlines() if not r.startswith("| DEF-23")), encoding="utf-8")
    assert pipeline.wip_limit(isolated) is None
    assert "In flight" not in pipeline.render(pipeline.load(isolated), isolated)


def test_the_limit_is_per_operator(isolated):
    assert pipeline.wip_limit(isolated) == 3  # no scopes.json: one operator is assumed
    scopes_file = isolated / "factory/context/scopes.json"
    scopes_file.write_text(json.dumps({"schema_version": 1, "group": {"name": "Org", "operators": ["a", "b", "c"]}}), encoding="utf-8")
    assert pipeline.wip_limit(isolated) == 9
