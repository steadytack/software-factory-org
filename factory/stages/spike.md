# The spike route: try it before specifying it

A spike is the fast way through the factory for an idea whose value looks real but whose ambers are questions a small build would answer faster than more research: does the data really work, will people use it, can it be done. It skips the spec pack and Gate 2, is built at tier 1 within a time box, and ends at Gate 3 with **grow**, **keep** or **stop**.

```
Develop and Assess ─gate 1 (Go as a spike, with spike.md)→ Build the spike ─gate 3→ grow: Spec (full route) │ keep: Publish │ stop
```

## When
Recommend it at Gate 1 (`decision.route: "spike"`, with `timebox`) when every foundation is green or amber, the one thing or the ambers can be tested by building something small, and building it would take less time than settling them on paper. Not when a foundation is red (fix it first: Get Ready), and never to step around a policy: the data classes (POL-11), secrets, outward-facing actions and every other policy apply in full at every tier.

## Plan (before Gate 1)
`python factory/scripts/scaffold.py spike <slug>` writes `spike.md`; fill it in: the question (the ambers or the one thing, each with the answer that would settle it), the success and kill criteria (decided now, before anything is built), the time box (1 person-week by default), the smallest scope that answers the question, the data and its classes (synthetic or public where it can), the template, and whether the code is throwaway or a seed. `check_spec.py <slug> --assessment` checks it with the brief and the assessment; a spike needs no overview. Gate 1 shows the plan beside the assessment, and **Go as a spike** approves both: `pipeline.py decide <slug> go --route spike [--timebox N] --reply "..."` records Gate 2 as approved with it and moves the idea to Build at tier 1.

## Build
1. `python factory/scripts/scaffold.py app <slug> <template>`, then Build steps 2 and 3 (`build.md`: safe beside everything else, the baseline checks).
2. Build only what `spike.md` says is in. No epics, no spec pack; the tests cover the main path (tier 1, `testing.md`). Record shortcuts in `decisions.md` as you take them.
3. Stop at the time box with what you have. Running out of time is a result, not a failure.

## Gate 3 for a spike
1. Check the result against the success and kill criteria, as run (each run or not run).
2. The outcome (`audit.md` step 6): `python factory/scripts/learned.py outcome <slug>`, filled in, with the time box as the estimate; `learned.py check <slug>` must pass.
3. Write `gates/gate-3.md`: **Done** (what was built, how to run it), **Results exactly as run** against each criterion, **Recommended:** grow, keep or stop, with why, **Decisions for you**, **Risks** (the shortcuts taken), **Next**.
4. **Stop.** Accept `grow`, `keep`, `stop` (with a reason) or `approve` (the recommendation). Record it with `python factory/scripts/pipeline.py spike <slug> grow|keep|stop --reply "..." [--reason "..."]`:
   - **Grow:** the idea leaves the spike route and goes to Spec (`spec.md`) with gates 2 and 3 reset. What the spike showed updates the brief, the assessment's ambers and the one thing (record the changes in `decisions.md`); the spec starts from it, and a seed spike's code may be the base the build starts from (doc 12). Keep the spike's `outcome.md`, and update it at the full Gate 3 rather than writing a new one.
   - **Keep:** good enough as it is, for its owner: on to Publish (`publish.md`) as a tier 1 tool. A tool that others will rely on grows instead.
   - **Stop:** closed with its reason, which is as useful an answer as a Go.
