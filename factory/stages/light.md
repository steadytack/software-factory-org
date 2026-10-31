# The light route: a spike or an exploration prototype (tiers 1 and 2)

The fast way through the factory for an idea whose value looks real but whose ambers are questions a small build answers faster than more research. It skips the spec pack and Gate 2, works only with synthetic or public data, is time-boxed, and ends at Gate 3 with **grow**, **keep** or **stop**. Tiers: `factory/standards/tiers.md`.

```
Develop and Assess ─gate 1 (Go as a spike or as a prototype, with plan.md)→ Build ─gate 3→ grow (to tier 2, or to Spec at tier 3 or 4) │ keep │ stop
```

| | Tier 1: Spike | Tier 2: Exploration prototype |
|---|---|---|
| Answers | One question, fast: is it feasible, does the approach work | What should it be: people see it, use it and react, to shape the idea |
| Who uses it | The builder | A few people giving feedback |
| Built | Throwaway code, the main path only | Looks and behaves like the real thing on screen; faked behind it where that is quicker |
| Time box (default) | 1 person-week | 2 person-weeks |

## When
Recommend it at Gate 1 (`decision.route: "light"`, `tier`, `timebox`) when every foundation is green or amber, the one thing or the ambers can be tested by building something small, and building it would take less time than settling them on paper. Not when a foundation is red (fix it first: Get Ready), and never to step around a policy.

**Synthetic or public data only.** Real records (Internal and above, POL-11) are what make a build a business prototype: an idea that needs real data to answer its question goes on the full route at tier 3. Hosted in Docker like every tier (DEF-02); anything reachable by anyone but the builder has a login (`security.md`).

## Plan (before Gate 1)
`python factory/scripts/scaffold.py plan <slug>` writes `plan.md`; fill it in: the question (the ambers or the one thing, each with the answer that would settle it), the success and kill criteria (decided now, before anything is built), the time box, the smallest scope that answers the question, the synthetic or public data it uses, the template, and whether the code is throwaway or a seed. `check_spec.py <slug> --assessment` checks it with the brief and the assessment; the light route needs no overview. Gate 1 shows the plan beside the assessment, and **Go as a spike** or **Go as a prototype** approves both: `pipeline.py decide <slug> go --route light --tier 1|2 [--timebox N] --reply "..."` records Gate 2 as approved with it and moves the idea to Build.

## Build
1. `python factory/scripts/scaffold.py app <slug> <template>`, then Build steps 2 and 3 (`build.md`: safe beside everything else, the baseline checks).
2. Build only what `plan.md` says is in. No epics, no spec pack; tests as `testing.md` sets for the tier. Record shortcuts in `decisions.md` as you take them.
3. Stop at the time box with what you have. Running out of time is a result, not a failure.

## Gate 3 for the light route
1. Check the result against the success and kill criteria, as run (each run or not run). For a prototype, what the people who used it said, in their words where possible.
2. The outcome (`audit.md` step 6): `python factory/scripts/learned.py outcome <slug>`, filled in, with the time box as the estimate; `learned.py check <slug>` must pass.
3. Write `gates/gate-3.md`: **Done** (what was built, how to run it), **Results exactly as run** against each criterion, **Recommended:** grow (to which tier), keep or stop, with why, **Decisions for you**, **Risks** (the shortcuts taken), **Next**.
4. **Stop.** Accept `grow` (to tier 2, 3 or 4), `keep`, `stop` (with a reason) or `approve` (the recommendation). Record it with `python factory/scripts/pipeline.py light <slug> grow|keep|stop --reply "..." [--tier 2|3|4] [--reason "..."]`:
   - **Grow to tier 2** (from a spike): stays on the light route; revise `plan.md` for the prototype, then build it.
   - **Grow to tier 3 or 4** (3 by default): leaves the light route for Spec (`spec.md`) at that tier, with gates 2 and 3 reset. What the build showed updates the brief, the assessment's ambers and the one thing (record the changes in `decisions.md`); the spec starts from it, and a seed's code may be the base the build starts from (doc 12). Keep `outcome.md`, and update it at the full Gate 3 rather than writing a new one.
   - **Keep:** good enough as it is, as a demonstration or reference, still on synthetic or public data: on to Publish (`publish.md`). Anything people will use for real work grows instead.
   - **Stop:** closed with its reason, which is as useful an answer as a Go.
