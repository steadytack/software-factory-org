# Stage 1: Develop and Assess

A one-line idea cannot be assessed, and an idea that has not been assessed should not be specified. So each idea is first developed into a short brief, then assessed against it, and only an idea the owner decides to invest in goes on to Spec. Output per idea: `idea-brief.md`, `assessment.md` and `overview.md` in `ideas/<slug>/`; across all ideas, the ranked pipeline in `ideas/pipeline.md`. Ends at **Gate 1**, the investment decision: **Go** (the full route, or the light route: a time-boxed **spike**, `plan.md`), **Get Ready** or **Stop**.

Its job is to develop ideas, not to filter them: an idea that is early, rough or full of unknowns is worked on, with its unknowns stated, never held back for being early. It stays light: a brief of one to two pages and an assessment of a page, not a specification. The solution (tier, deployment, interfaces, template, catalogue assets) is not chosen here; that opens Spec.

## Before you start
1. Read `factory/context/README.md`, then the files `python factory/scripts/scopes.py context --scope <scope>` lists, in order (policies first, the data classes in POL-11 among them), and `factory/standards/PRINCIPLES.md`. Without `factory/context/scopes.json` the scope is `group`; with it, establish which business and brands the idea is for (ask in the question round if unclear) and record `scope` in `state.json`.
2. `python factory/scripts/status.py`; never reuse another idea's slug.
3. Existing idea: read `state.json`, `idea.md`, the brief, the assessment and `decisions.md`, and continue.

## 1. Capture
Ideas arrive three ways. Capture takes everything in and filters nothing; the register is `ideas/pipeline.json` (schema `factory/schemas/pipeline.schema.json`).
- **Many ideas** (`/factory` with the inbox): the owner puts ideas in `ideas/inbox.md`, one per line or bullet. `python factory/scripts/pipeline.py capture` adds every line not yet in the register (`IDEA-nnn`); lines already there are skipped, so re-running is safe.
- **One idea** (`/factory <idea>`): `python factory/scripts/pipeline.py add "<idea>"`.
- **A supplied document** (source mode): `python factory/scripts/pipeline.py add "<one-line summary>" --source document`, develop it (below), then `python factory/scripts/import_source.py <file> <slug>`, which writes `source/<version>/` (markdown, images, the original, `ids.json`). Check the printed counts against the document, read any warning, and record it in `state.json` `imports`. Summarise what the source **already decides** and what it **leaves open**; never rewrite the source. A project or repository to reuse from is the catalogue importer's job (`catalogue/README.md`), not an idea.

## 2. Develop
For each captured idea: `python factory/scripts/pipeline.py develop IDEA-nnn [<slug>]`. It creates `ideas/<slug>/` (stage `develop`) with the idea in `idea.md`, and the stubs `idea-brief.md` and `assessment.md`. Then:

**Work it through, when the owner wants to** (before or while drafting): an open, owner-led conversation to thrash the idea out: what it is really for, other ways to get there, what would make it fail, a smaller first version. It lasts as long as the owner wants; the factory contributes options, challenges and examples from the context and the catalogue, and the brief is drafted from where it lands (the alternatives considered go under Strategic fit or Assumptions and unknowns). This is not a question round: the limit in step 3 is on questions the factory asks, not on the owner's thinking.

1. **Draft the brief** (`idea-brief.md`, one to two pages, plain language) from the idea, the source if any, and the scope's context (business context, system landscape, team, catalogue reference cards: `python factory/scripts/catalogue.py search <terms> --scope <scope>`). Sections: Problem (what is wrong today, who it affects, how often, what it costs); Outcome and success measures; How it's done today (the as-is process, in brief); Data (what exists, where it is kept, its quality, its POL-11 data classes); Risk (the impact if it is wrong, where human judgement is needed); People and process (owner and users); Strategic fit; Assumptions and unknowns.
   **Screen with the lenses** (`context/lenses/README.md`): answer the **Screening** questions of `business-value` (Problem, Value), `users-and-workflows` (People & Process), `data-and-integrations` (Data Foundations) and `security` (Risk) in the matching sections of the brief, for every idea, whether or not those lenses are activated later in Spec. A question the brief cannot answer goes under Assumptions and unknowns; it is not left out. This is what makes a foundation's rating evidence rather than a first impression.
2. **Mark every assumption** *(assumed)*, so the assessment can tell evidence from a guess.
3. **One question round at most** from the factory in this stage (DEF-17; an owner-led working session is not one): only questions whose answer would change a foundation's rating or the decision, numbered, each with a recommendation (rules in `context/lenses/README.md`). Several ideas developed together share one round. Then finish the brief with the answers, or with the assumption stated.

## 3. Assess
Fill in `assessment.md`. The JSON block is the record; `pipeline.py` and `check_spec.py` read it.

**Knock-outs first.** Record `data_classes` (the classes from the data-classes table, POL-11, that the idea would need; `[]` for none). Knock the idea out, with a `knockout` of `rule`, `ref` and a one-line `reason`, when it:

| Rule | When | Ref |
|---|---|---|
| `data-class` | It needs a data class the scope's `policies.md` answers "no" for (POL-11). The scripts enforce this. A class allowed only on conditions (approval per idea, synthetic data only) is not a knock-out: the condition is shown beside the score. | `POL-11` |
| `policy` | It cannot be done without breaking a policy | the `POL-nn` |
| `paid-service` | It needs a paid service, an account or a key that is not approved (DEF-11) | `DEF-11` |
| `duplicate` | It duplicates another idea, an approved catalogue asset or another captured idea | `ideas/<slug>`, `CAT-nnn` or `IDEA-nnn` (checked to exist) |

A knocked-out idea needs no ratings or RICE; its recommendation is `stop`. When in doubt, do not knock out: rate it and say why.

**The five foundations.** Each is `green`, `amber` or `red`, with a one-line reason from the brief:

| Key | Foundation | The question |
|---|---|---|
| `problem` | Problem | Are we clear exactly what we're trying to improve? |
| `value` | Value | Do we know what success looks like and what it's worth? |
| `data` | Data Foundations | Do we have the right quality data? Lots of data is not the same as ready data. |
| `risk` | Risk | What happens if it gets something wrong or misses something? |
| `people` | People & Process | Who owns it and how would it fit the process? |

Each foundation is rated on its lens's screening questions, as answered in the brief. Green: every screening question answered with evidence. Amber: a question not yet answered, or answered on assumptions worth checking; an early idea is expected to have ambers, and an unknown is never red just for being unknown. Red: what is known stops it working as things stand (for example, the data exists but is not usable, no one will own it, or the worst outcome cannot be accepted). The reason names what decided the rating, and for an amber, what would settle it.

**RICE**, now from the brief's evidence, each factor a `value` and a one-line `reason`: **Reach**, people or processes touched per `period` (`per month` by default); **Impact** per person or process reached, 0.25 minimal, 0.5 low, 1 medium, 2 high, 3 massive; **Confidence**, a percentage (100 backed by data, 80 a good argument, 50 a hunch; lower for a guess), which should follow the foundations: many ambers or a red mean a low confidence; **Effort**, rough person-weeks to a first release, informed by the likely `template` (the table in `spec.md`) and the approved catalogue `assets` that could be reused (`CAT-nnn`, checked to exist). Score = Reach x Impact x Confidence% / Effort; the script computes it, never type a score in.

**The ONE thing** (`one_thing`, required): the single thing to know or fix before investing. Even a clear Go has one.

**The recommendation** (`decision`): `recommended` is `go`, `get-ready` or `stop`, with a one-line `reason`:
- **Go** when every foundation is green or amber (ambers become risks in Spec). A Go with a red foundation is refused.
- **Go as a spike** (the light route, tier 1) when the value looks real but the ambers are questions a small, time-boxed build would answer faster than more research (`route: light`, below; `factory/standards/tiers.md`). It may use a sample of real data where the data classes allow.
- **Get Ready** when a foundation is red, or ambers together make even a light build premature; `fix` lists the foundations to fix (each amber or red).
- **Stop** when it is knocked out, or the value is not worth the effort at any rating.

**A spike recommended:** `python factory/scripts/scaffold.py plan <slug>` and fill in `plan.md` (the question, success and kill criteria, the time box, scope, the data and protection, template; `factory/stages/light.md`); set `decision.route` to `light` and `decision.timebox` (person-weeks). It is approved with Gate 1, in place of a spec pack.

## 4. Check and rank
`python factory/scripts/pipeline.py render` validates the register and every assessment and writes `ideas/pipeline.md`: the ranked table (rank, score, factors, foundations, the recommendation or decision, conditions), then the ideas that went ahead, those getting ready, stopped and knocked-out ideas, and the ideas captured but not yet developed. Ties are broken by higher Confidence, then lower Effort, then slug. `check_factory.py` checks the register too.

## 5. Overview
`python factory/scripts/scaffold.py overview <slug>` writes `overview.md` with the RICE numbers, the five foundations, the one thing and the recommendation filled in from the assessment; write the rest from the brief, last. Top: a one-page executive summary (the problem, the impact and success measures, the foundations, the one thing, who benefits, rough effort and cost, key risks, the decision asked). Below, in plain language: what it is, how it changes people's work, in and out of scope, what happens next. No requirement IDs, codes or factory jargon; someone who has never seen the factory should follow it.

## Gate 1: the investment decision
`python factory/scripts/check_spec.py <slug> --assessment` must pass: the brief has every section and no placeholder; the assessment is valid, with no placeholder, every foundation rated with a reason, valid RICE, the one thing and a recommendation consistent with the ratings (data classes and knock-outs checked against POL-11); a Get Ready re-assessment re-rated each foundation it fixed; the overview exists with no placeholder (requirement IDs in it are a warning); for a spike, `plan.md` has every section and no placeholder. A knocked-out idea, and a spike, need no overview. Then write `gates/gate-1.md`, set `state.json` (`status: awaiting-approval`, gate 1 `awaiting-approval`) and stop (gate protocol in the skill). Several ideas at Gate 1 together may share one gate page, each with its own decision.

Gate 1 shows: **Done** (the brief, the assessment and the overview, linked: the overview is what sponsors read; the check exactly as run; the idea's place in `ideas/pipeline.md`). **Recommended:** Go (and the likely tier, 2, 3 or 4, with why), Go as a spike (with the plan: the question, the criteria, the time box, the data), Get Ready or Stop, with the foundations, the RICE score and the one thing. **Decisions for you:** numbered: the decision; for Get Ready, who fixes which foundation and the review date (four weeks unless said); any knock-out the owner may want to overrule. **Answered from your defaults**, **Risks** (ambers, low confidence, conditional data classes), **Next:** Spec on Go.

**Stop.** Accept `go`, `go as a spike`, `get ready`, `stop` (with a reason), `approve` (the recommendation), `change 2 to B`, or `back to <stage>`; ask again otherwise. On the reply, record it with `python factory/scripts/pipeline.py decide <slug> go|get-ready|stop --reply "<the reply>" [--reason "..."] [--route full|light [--timebox N]] [--fix problem,data --owner "..." [--review YYYY-MM-DD]]`. It runs the Gate 1 check, records the decision in the assessment and `state.json` (gate 1 with its date and reply), and:
- **Go:** gate 1 `approved`; the idea moves to Spec (`factory/stages/spec.md`), in its own session (DEF-18): `/factory resume <slug>`.
- **Go as a spike** (`--route light`, or `approve` when it was recommended): gates 1 and 2 `approved` (the plan is approved with the decision), straight to Build at tier 1 (`factory/stages/light.md`).
- **Get Ready:** gate 1 `get-ready`, status `paused`, `next` names the foundations to fix (from `--fix`, else the assessment's `fix`), who fixes them (`--owner`, required) and the review date (`--review`, four weeks by default). `ideas/pipeline.md` lists every idea getting ready with its owner and date, and flags one past its date as **overdue**: at the review date it comes back to Gate 1 fixed or not, to be re-assessed, re-scoped (a spike may answer what research could not) or stopped, so no idea waits on no one. When they are fixed: `python factory/scripts/pipeline.py reassess <slug>` opens a **light re-assessment**, not a restart. It keeps the brief and the assessment, records the ratings and reasons being fixed, and returns the idea to `in-progress`. Update the brief where the fix changed it, re-rate only the listed foundations (each with a new reason), adjust RICE and the one thing if the evidence moved, refresh the overview, and come back to Gate 1. The check refuses a fixed foundation whose reason has not changed.
- **Stop:** gate 1 `stopped`, status `stopped`, the reason recorded. A stopped idea stays in the pipeline as a record.

An overruled knock-out: the owner says why; record it in `decisions.md`, remove the `knockout` and rate the idea. A data-class knock-out cannot be overruled here: the policy changes first. Record every answer in `decisions.md`; an answer that differs from the recommendation also goes into `factory/context/learned.md`: `python factory/scripts/learned.py add --project <slug> --key gate1-decision --question "Gate 1" --recommended <recommended> --chosen <decided> --reason "..." --scope <scope>` (a rating or knock-out the owner overruled: the key `foundation-<key>` or `knockout-<rule>`).
