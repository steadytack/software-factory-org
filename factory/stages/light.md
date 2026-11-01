# The light route: a spike (tier 1)

The fast way through the factory for an idea whose value looks real but whose ambers are questions a small build answers faster than more research: is it feasible, does the approach work, does the data really support it. It skips the spec pack and Gate 2, is time-boxed (1 person-week by default), and ends at Gate 3 with **grow** (to the tier the owner names), **keep** or **stop**. Every other tier takes the full route with a spec pack (`factory/standards/tiers.md`).

```
Develop and Assess ─gate 1 (Go as a spike, with plan.md)→ Build the spike ─gate 3→ grow (to Spec at tier 2, 3 or 4) │ keep │ stop
```

## When
Recommend it at Gate 1 (`decision.route: "light"`, `timebox`) when every foundation is green or amber, the one thing or the ambers can be tested by building something small, and building it would take less time than settling them on paper. Not when a foundation is red (fix it first: Get Ready), and never to step around a policy.

**Data and protection are decided in the plan,** not by the tier: a spike may use synthetic data, a sample of real records or real data, as far as the idea's data classes allow (POL-11 and its conditions), and is protected for what it holds and who can reach it (`security.md`). Hosted in Docker like every tier (DEF-02).

## Plan (before Gate 1)
`python factory/scripts/scaffold.py plan <slug>` writes `plan.md`; fill it in: the question (the ambers or the one thing, each with the answer that would settle it), the success and kill criteria (decided now, before anything is built, and judged on evidence the build does not tune to: held-out cases, or a judgement recorded blind or before the build, so the test can fail), the time box, the smallest scope that answers the question, the data (synthetic, a real sample or real, its classes) and the protection level, the template, and whether the code is throwaway or a seed. `check_spec.py <slug> --assessment` checks it with the brief and the assessment; a spike needs no overview. Gate 1 shows the plan beside the assessment, and **Go as a spike** approves both: `pipeline.py decide <slug> go --route light [--timebox N] --reply "..."` records Gate 2 as approved with it and moves the idea to Build at tier 1.

## Build
1. `python factory/scripts/scaffold.py app <slug> <template>`, then Build steps 2 and 3 (`build.md`: safe beside everything else, the baseline checks).
2. Build only what `plan.md` says is in. No epics, no spec pack; the main path tested (`testing.md`). Record shortcuts in `decisions.md` as you take them.
3. Stop at the time box with what you have. Running out of time is a result, not a failure.

## Gate 3 for a spike
1. Check the result against the success and kill criteria, as run (each run or not run).
2. The outcome (`audit.md` step 7): `python factory/scripts/learned.py outcome <slug>`, filled in, with the time box as the estimate; `learned.py check <slug>` must pass.
3. Write `gates/gate-3.md`: **Done** (what was built, how to run it), **Results exactly as run** against each criterion, **Recommended:** grow (to which tier, and why), keep or stop, **Decisions for you**, **Risks** (the shortcuts taken), **Next**.
4. **Stop.** Accept `grow to 2|3|4`, `keep`, `stop` (with a reason) or `approve` (the recommendation). Record it with `python factory/scripts/pipeline.py light <slug> grow|keep|stop --reply "..." [--tier 2|3|4] [--reason "..."]`:
   - **Grow** (the tier is required; there is no default): leaves the light route for Spec (`spec.md`) at that tier, with gates 2 and 3 reset. What the spike showed updates the brief, the assessment's ambers and the one thing (record the changes in `decisions.md`); the spec starts from it, and a seed's code may be the base the build starts from (doc 12). Keep `outcome.md`, and update it at the full Gate 3 rather than writing a new one.
   - **Keep:** good enough as it is, as a demonstration or a tool for its builder: on to Publish (`publish.md`). Anything other people will use grows instead.
   - **Stop:** closed with its reason, which is as useful an answer as a Go.
