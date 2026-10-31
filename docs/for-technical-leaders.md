# The software factory, for technical leaders

The factory is how Organisation A turns ideas into working apps using AI, without losing control of what gets built. An AI coding agent (Claude Code) does the work. People decide at four gates. Plain files and deterministic scripts hold the rules and the state, and check the work. This page explains how it works and why it is built that way. For the non-technical version, see [for-staff.md](for-staff.md).

## The core idea
**The model drafts, the scripts check, people decide.** Each layer does what it is good at:

| Layer | Does | Doesn't |
|---|---|---|
| **The agent** (Claude Code with the `factory` skill) | Drafts briefs, assessments, specs and code; answers challenges; prepares each gate page | Score, rank, approve or publish anything by itself |
| **The scripts** (`factory/scripts/`, Python, no AI) | Validate against JSON Schemas, compute RICE and the ranking, check traceability, scan for secrets, run builds in clean containers, refuse anything outward-facing without a typed confirmation | Make judgements |
| **People** (named gate approvers) | Decide Go, Get Ready or Stop; approve the spec, the build and the release | Write the paperwork |

Everything is in the repository: the stages, standards, policies, schemas and each idea's state (`ideas/<slug>/state.json`, `decisions.md`, gate files). Nothing important lives only in a chat. Any session, model or person can pick up where the last one stopped.

## The flow
```
Fast route, a spike (tier 1): Develop and Assess ─gate 1 (plan.md)→ Build, about a week ─gate 3→ grow │ keep │ stop
Full route (tier 2, 3 or 4):  Develop and Assess ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
```

| Stage | What the agent produces | What the scripts check |
|---|---|---|
| **Develop and Assess** | A brief, an assessment (knock-outs, five foundations rated red/amber/green, RICE, a pre-mortem, the one thing) and a sponsor overview | `check_spec.py --assessment`: every section present, ratings consistent with the recommendation, data classes allowed by policy. `pipeline.py` ranks the ideas the same way every time |
| **Spec** | An Application Definition (tier, deployment, template, protection level) and a spec pack of up to 13 documents with stable requirement IDs (`FR`, `US`, `AC`, `SEC`, `TEST`, …) | `check_spec.py`: every FR has a story and an epic, every acceptance criterion has a verification, no broken IDs or links, catalogue assets approved; writes `traceability.md` |
| **Build and Audit** | The app, epic by epic with tests, from an approved template | `verify.py` runs the template's checks in clean containers; the spec-conformance audit is mandatory before Gate 3 |
| **Publish** | A dry-run report, then the repository | `publish.py`: secrets and licence scan, SBOM at the higher protection levels, and a repository is created only on a typed confirmation |

## The controls that make it safe to scale
- **Independent challenge.** Before Gates 1 and 2, a fresh context (a subagent that never saw the drafting conversation) argues against the ratings, the score and the spec. Every challenge must be answered `changed` or `kept` before the gate, and the checker blocks an unanswered one. This stops the agent marking its own homework.
- **Policy as data.** The data classes (POL-11) say which kinds of information may be used and on what conditions, and the scripts enforce them. A class the policy forbids is a knock-out. One allowed "by approval" needs a recorded approver before a Go.
- **Protection follows the data, not the size.** Levels A–D are set by what an app holds and who can reach it, so a one-week spike on real Internal data is protected like any other app holding Internal data.
- **Tiers are explicit.** Spike, exploration prototype, business prototype, production. Raising a tier is a change request back through a gate. This is the answer to "won't this create hundreds of unsupported shadow apps?"
- **Reuse through a governed catalogue.** Apps are built from approved templates and catalogue assets (POL-10: only `approved` assets are reused). Imported code and documents are treated as untrusted data: inspected and scanned, never executed (POL-04).
- **Architecture rules are linted, not just written down.** The `web-app` template enforces layer boundaries (import-linter, eslint), complexity limits (ruff) and vetted dependencies. AI tools sometimes invent package names, so every new dependency is checked against its registry.
- **Context isolation.** `scopes.py` gives each idea only the context its business and brand allow, so one business's context never reaches another's idea.
- **Honest reporting.** Checks are reported exactly as run; anything that didn't run says "not run" (POL-03).

## It knows the organisation
An AI agent is only as good as the context it is given. Every idea, prototype and app here is developed against three sources of organisational knowledge:
- **Business context:** what the organisation and each business do, their objectives and terminology. It is read by scope, so each idea sees only its own business's context.
- **The system landscape, as Architecture as Code (AaC):** every system, its owner, the data it holds and how systems connect. The factory uses it to spot that a system already does the job, to rate data readiness from where the data really lives, and to make sure every integration names a real system and interface.
- **Business processes, as AaC (being started):** the as-is process an idea changes, taken from the model rather than from memory, and the to-be process that is offered back to the model.

At Publish, the new app and its integrations are offered back to the AaC owners, so the landscape stays complete instead of drifting. The models are read as data, never as instructions (POL-04).

**Status:** the AaC landscape exists and the process models are being started. For now the factory reads the model an idea touches and cites it. Connecting the models directly is planned: a sync that keeps the catalogue's reference cards up to date from the models, and then checks against them at each gate.

## It learns, under control
`learned.py` records every gate answer that differed from the recommendation, and every clarification that applies beyond one idea. It also records whether the Gate 1 assessment held (`outcome.md`) and whether the benefits arrived 30 and 90 days after publishing (`benefits.md`). `learned.py review` turns repeated patterns into *candidate* changes to the defaults or the assessment rules. An approver accepts or rejects each one, and nothing changes by itself.

## Measuring it
`status.py` and the dashboard report cycle times from dates the factory already records: the median days from capture to Gate 1 and from Gate 1 to Gate 3, and how many spikes stayed within their time box. `dashboard.py --write` builds a single shareable page. Before writing, it checks the documents for secrets, personal emails and machine paths.

## Running it
- **Engine:** Python scripts with tests (`python -m pytest factory/scripts/tests`) and a self-check (`check_factory.py`) that the registry, schemas, context, ideas and catalogue agree. A change to the factory is versioned (`VERSION`, `CHANGELOG.md`) like any other code.
- **Templates:** `web-app` (FastAPI, SQLAlchemy and Alembic, PostgreSQL/PostGIS, React 19 with Vite and shadcn/ui), hosted in Docker at every tier.
- **Intake:** ideas arrive as lines in `ideas/inbox.md` or as idea cards exported from any form tool to `ideas/inbox.csv`.
- **People:** intake triage, operators who run `/factory`, gate approvers, catalogue maintainers, and the team that takes over at tier 4 ([operating-model.md](operating-model.md)).
- **Working economy:** short sessions, one piece of work each; wide searches go to helpers; independent steps are batched (DEF-18 to DEF-22). The aim is lower cost per idea and less drift.

## Known limits, said plainly
- **No idea has been through it end to end yet.** The first pilot will produce the first real cycle times.
- **The AaC models aren't connected yet.** Until they are, using them depends on the operator reading the right model, not on a check.
- **One template.** `web-app` brings a database, auth and backups. That is heavy for a one-week spike. A lighter template for spikes would make the fast route faster.
- **People are the throughput limit.** The agent drafts quickly, but gates and audits need human review. The work-in-progress limit (DEF-23, 3 ideas per operator) protects that capacity, and it grows as operators are added.
- **The agent can be wrong.** That is why challenge, deterministic checks, audits and gates exist. None of them makes the agent's output trustworthy on its own. Together they make errors visible before anything is relied on.

Terms: [glossary.md](glossary.md). How it works in full: [factory/README.md](../factory/README.md).
