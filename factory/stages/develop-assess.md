# Stage 1: Develop and Assess

Each idea is developed into something a gate approver can decide on, then stops at **Gate 1**. Its job is to develop ideas, not filter them: an early idea full of unknowns is worked on, with its unknowns stated.

**Two shapes.** Most ideas are **spikes**: one question a small build answers. They get a one-page card (`spike.md`) and follow `light.md` from here. An idea that needs real investment from the start is developed **in full**, as below: a brief, an assessment and an overview, then Gate 1 (Go to Spec, Get Ready or Stop). When unsure, start with a spike.

**Who:** the **idea owner**. Any member of staff can run this with `/factory`, as often as they like. Going further needs **sign-off** by a gate approver for the idea's scope (`factory/context/scopes.json`), never the owner, who may only withdraw it (`factory/README.md`, "Who does what").

## Before you start
1. `python factory/scripts/scopes.py context --scope <scope>` lists the context to read, policies first (the data classes, POL-11), then `factory/standards/PRINCIPLES.md`. Without `scopes.json` the scope is `group`; otherwise record it in `state.json` as an object, `{"business": "<business>", "brands": [...]}`, never a string.
2. `python factory/scripts/status.py`; never reuse another idea's slug. For an existing idea, read `state.json`, its card or brief and assessment, and `decisions.md`, and continue.

## 1. Capture
The register is `ideas/pipeline.json`. `pipeline.py capture` adds every line of `ideas/inbox.md` and row of `ideas/inbox.csv` not yet in it; `pipeline.py add "<idea>"` adds one. A supplied document: `add "<summary>" --source document`, develop it, then `import_source.py <file> <slug>`; summarise what the source already decides and what it leaves open, never rewrite it.

## 2. Develop
`python factory/scripts/pipeline.py develop IDEA-nnn [<slug>] --owner "<name>"`, with `--spike` for a spike card. In full, it makes `idea-brief.md` and `assessment.md`.

**Work it through** when the owner wants to: an open conversation about what it is really for, other ways to get there, what would make it fail, a smaller first version. Then:
1. **Draft the brief** (one to two pages, plain language) from the idea, any source and the scope's context (the system landscape, `catalogue.py search <terms>`). Say which systems it would use, replace or overlap and where its data lives. Sections: Problem; Outcome and success measures; How it's done today; Data (with its POL-11 classes); Risk; People and process; Strategic fit; Assumptions and unknowns. Answer the lenses' **Screening** questions (`context/lenses/README.md`) in the matching sections.
2. **Mark every assumption** *(assumed)* and **name the source of every piece of evidence**: evidence with no source is an assumption, and one anecdote is thin.
3. **One question round at most** (DEF-17): only questions whose answer would change a rating or the decision, numbered, each with a recommendation.

## 3. Assess
Fill in `assessment.md`; its JSON block is the record the scripts read.
- **Knock-outs first.** Record `data_classes`. Knock out (`knockout`: `rule`, `ref`, `reason`) when it needs a class POL-11 answers "no" for (`data-class`), cannot be done without breaking a policy (`policy`), needs an unapproved paid service (`paid-service`, DEF-11) or duplicates an idea or catalogue asset (`duplicate`). A knocked-out idea is stopped. When in doubt, rate it instead.
- **The five foundations**, each `green`, `amber` or `red` with a one-line reason: **Problem** (clear what we are improving?), **Value** (what success looks like and is worth), **Data** (the right quality data, not just lots), **Risk** (what if it is wrong?), **People** (who owns it, how it fits the process). Green: answered with sourced evidence. Amber: not yet answered, or on assumptions; say what would settle it. Red: what is known stops it working.
- **RICE**, each factor with a `value` and `reason`: Reach per `period`, Impact (0.25 to 3), Confidence (%), Effort (person-weeks). The script computes the score.
- **Pre-mortem** (`## Pre-mortem`): a year on, it failed; the three likeliest reasons, each naming its foundation.
- **The one thing** (`one_thing`): the single thing to know or fix before investing.
- **The recommendation** (`decision`): **Go** when every foundation is green or amber; **Get Ready** when a foundation is red (`fix` lists what to fix); **Stop** when knocked out or not worth it. If the ambers are questions a small build answers faster, recommend developing it as a spike instead.

A project or programme (`scale`) goes the roadmap route, which is dormant (`factory/dormant/roadmap.md`): bring it back first.

## 4. Rank and overview
`python factory/scripts/pipeline.py render` validates every assessment and card and writes `ideas/pipeline.md`. `python factory/scripts/scaffold.py overview <slug>` writes `overview.md` from the assessment; finish it from the brief in plain words, for sponsors.

## Gate 1
1. **Challenge** (`factory/standards/challenge.md`): a fresh subagent argues against the ratings, the score and the recommendation in `gates/challenge-1.md`; answer each (changed or kept).
2. `python factory/scripts/check_spec.py <slug> --assessment` must pass.
3. Write `gates/gate-1.md`, short: what was done and the check as run; the recommendation with the foundations, score and one thing; **Decisions for you**, numbered, each with an unconditional recommendation (ask for a fact rather than recommend "A if X"); the risks. Set `state.json` to `awaiting-approval` and stop for sign-off.
4. Record the approver's reply exactly, with `[meaning: ...]` when it points at numbered decisions: `python factory/scripts/pipeline.py decide <slug> go|get-ready|stop --by <approver> --reply "..." [--reason "..."] [--fix problem,data --owner "..." [--review YYYY-MM-DD]]`.
   - **Go:** on to Spec (`factory/dormant/spec.md`, brought back for it), in its own session.
   - **Get Ready:** paused, with who fixes what by when (four weeks by default); `pipeline.md` flags it when overdue. When fixed, `pipeline.py reassess <slug>`: re-rate only the listed foundations, refresh the overview, back to Gate 1.
   - **Stop:** closed with its reason.
5. **Data approvals:** a class POL-11 allows only by approval needs `pipeline.py approve-data <slug> <class> --by <approver> --reply "..."` before a Go.
6. Record every answer in `decisions.md`; one that differs from the recommendation also goes in `learned.md` with `learned.py add`.
