# {name}: roadmap

A project or programme is too big to specify or build in one go, so it is built out over time, epic by epic. This roadmap is the overall plan: where it ends up, the order it gets there in, and the decision after each step. Its open questions are epics too: **spikes**, early in the plan, each answering one question before the epics that depend on it are started. Gate 1 approves the roadmap as the direction; each epic then goes through the factory as an idea of its own, with its own Gate 1. Rules: `factory/stages/roadmap.md`.

## The end state
<What it does and for whom when it is fully built out, in plain words, and the success measures from the brief it delivers.>

## How it builds out
<The phases over time, in order (for example: prove it, a first release for one team, roll out, retire the old way). For each: what it delivers, which epics it holds, and the decision point at its end (what has to be true to go on). No dates unless the owner has them; the order and the decision points matter more.>

## Epics
Kinds: **spike** (a time-boxed question, tier 1, the light route), **build** (a release through the full route, tier 2, 3 or 4), **project** (delivered outside the factory, by a project with IT: a live integration to a production system of record, or technology the factory has no approved template for). Depends on: the epics that must finish first (`-` for none).

| Epic | Name | Kind | Answers or delivers | Tier | Depends on | Decision after |
|---|---|---|---|---|---|---|
| E1 | <name> | spike | <the question it answers, and the answer that would settle it> | 1 | - | <what each result means for the later epics> |
| E2 | <name> | build | <what it delivers, and to whom> | <2, 3 or 4> | E1 | <what decides the next step> |

## Starts now
<The epic or epics to start once the roadmap is approved (those that depend on nothing), and why these first.>

## Outside the factory
<What the factory will not build and who would (the project epics: live connections to systems of record, technology with no approved template, data the policy does not allow here), or "Nothing", with why.>

## Risks to the roadmap
<What would change the plan: an early spike failing, a system or team not ready, a dependency on another programme; and which epics each would change.>
