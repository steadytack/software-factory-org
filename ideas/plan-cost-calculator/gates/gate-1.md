# Gate 1: Plan cost calculator for field service scheduling

The investment decision, for the owner (steadytack). Status: **awaiting approval**, 2026-11-01. The factory's first pilot idea.

## Done
- [Idea brief](../idea-brief.md), [assessment](../assessment.md), [overview](../overview.md) (for sponsors) and [spike plan](../plan.md). Source: your scheduling spec v0.5, §2, §3, §4, §5.0, §17.3-§17.4 and open question 6 only. It is not imported into the repo, because §22-§23 are Confidential (decisions D-001, D-002).
- Checks, exactly as run on 2026-11-01:
  - `check_spec.py plan-cost-calculator --assessment`: OK, 0 blockers, 0 warnings.
  - `check_factory.py`: OK.
  - `pipeline.py render`: OK. Ranked 1 of 1 in [`ideas/pipeline.md`](../../pipeline.md), score 0.67.
  - `learned.py review`: 0 candidate changes.
  - Factory tests (`pytest`): not run, because nothing in the factory changed.
- **Challenge:** a fresh subagent raised 10 challenges, and 9 changed the work ([challenge-1.md](challenge-1.md)). The main changes:
  - The group ranks the plans blind and the result is scored on held-out comparisons, so the success test can now fail.
  - The kill rule is judged by the group.
  - Participants get no accounts.
  - The sessions are booked before anything is built.
  - Impact went from 1 to 0.5, Confidence from 50 to 40, and Effort from 1 to 1.5 person-weeks. The score fell from 2.5 to 0.67.
  - One challenge was kept: Risk stays green (decision 3).

## Recommended
**Go as a spike** (tier 1, the light route), 1.5 person-weeks within four calendar weeks.
- **Foundations:** Problem amber, Value amber, Data amber, Risk green, People amber. None is red.
- **RICE:** 5 x 0.5 x 40% / 1.5 = 0.67.
- **The one thing:** will two or three planners and one finance person give two sessions? The plan settles it first. Week 1 books the sessions, and the spike stops if they are not booked.
- **The question:** does one £ cost model reflect how planners and finance trade off overtime, weekend work, subcontractors, stay-away and GSOS, and can they agree a set of weights?
- **Success:** they agree a weight set, and the calculator picks their blind-ranked best plan in at least 2 of 3 held-out comparisons. The implied trade-offs must also fall in their stated ranges for at least 3 of 4.
- **Stop:** any one of these:
  - they name two or more rules they would not break for any money;
  - they agree no weight set, or the set matches 1 or 0 of 3;
  - the sessions are not booked in week 1, or not held in the time box.
- **Data:** synthetic only. Internal data, plus made-up engineers identified by codes. No real rates, no integrations.
- **Protection and template:** protection B, one login (yours), run locally in Docker on `web-app` (CAT-006).

## Decisions for you
1. **The investment decision.**
   - A. Go as a spike, as planned (recommended: no red foundation, and the ambers are answered faster by a build checked against blind rankings).
   - B. Get Ready: book the sessions first, then come back.
   - C. Stop.
2. **Is a scheduler decision (build or buy) actually pending and dependent on this?** This sets Impact.
   - A. Yes, confirm it, and Impact goes to 1 (score 1.33) (recommended if true: the brief says the calculator is useful either way).
   - B. Not yet; keep 0.5.
3. **Kept challenge 10: Risk stays green, not amber.** Builder bias and unchecked plan feasibility are limited by the blind rankings, the held-out sets, a planner's feasibility check and finance confirming the result.
   - A. Keep green (recommended: no real data, it decides nothing, and anything carried forward goes through its own gate).
   - B. Make it amber.

## Answered from your defaults
- Tier chosen for this idea (DEF-01).
- Docker, locally (DEF-02).
- A login at protection B (DEF-03).
- PostgreSQL for `web-app` (DEF-04).
- UK locale and GBP (DEF-07).
- Accessibility baseline (DEF-08).
- Unbranded (DEF-09).
- No third-party services (DEF-11).
- No question round; assumptions stated (DEF-17, D-004).
- Stand-ins only, with no integrations at all (DEF-24).
- Work in progress: this is 1 of 3 ideas in flight (DEF-23).

## Risks
- The ambers on Problem, Value, Data and People.
- Confidence is low (40%).
- Participation has not been asked yet.
- Weights set on made-up rates may not carry over. The spike also records trade-offs that do not depend on rates, and real rates would need a Confidential approval (POL-11) before they are used.
- Personal data is synthetic only.
- `web-app` is heavier than the question needs.

## Next
Reply `go as a spike`, `approve`, `get ready`, `stop` or `change 2 to A`. On a Go, the factory records it with `pipeline.py decide plan-cost-calculator go --route light --timebox 1.5 --reply "..."`. Then booking the sessions starts in its own session: `/factory resume plan-cost-calculator`.

## Reply
2026-11-01, steadytack: "for the decisions 1.a, 2,b,3a". 1A Go as a spike, 2B Impact stays 0.5, 3A Risk stays green. Recorded with `pipeline.py decide plan-cost-calculator go --route light --timebox 1.5`; decisions.md D-007 to D-009; 2B in learned.md (`rice-impact`, scope project).
