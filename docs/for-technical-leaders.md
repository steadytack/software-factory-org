# The software factory, for technical leaders

The factory is how Organisation A turns ideas into working apps using AI, without losing control of what gets built. An AI coding agent (Claude Code) does the work. People decide at four gates. Plain files and deterministic scripts hold the rules and the state, and check the work. This page explains how it works and why it is built that way. For the non-technical version, see [for-staff.md](for-staff.md). For the factory put through its own first stage (brief, assessment, overview), see [the-factory/](the-factory/README.md).

## The core idea
**The model drafts, the scripts check, people decide.** Each layer does what it is good at:

| Layer | Does | Doesn't |
|---|---|---|
| **The agent** (Claude Code with the `factory` skill) | Drafts briefs, assessments, specs and code; answers challenges; prepares each gate page | Score, rank, approve or publish anything by itself |
| **The scripts** (`factory/scripts/`, Python, no AI) | Validate against JSON Schemas, compute RICE and the ranking, check traceability, scan for secrets, run builds in clean containers, refuse anything outward-facing without a typed confirmation | Make judgements |
| **People** (named gate approvers) | Decide Go, Get Ready or Stop; approve the spec, the build and the release | Write the paperwork |

Everything is in the repository: the stages, standards, policies, schemas and each idea's state (`ideas/<slug>/state.json`, `decisions.md`, gate files). Nothing important lives only in a chat. Any session, model or person can pick up where the last one stopped.

## One way of building, improved over time
Using AI to build faster is easy. Keeping a hundred AI-built apps consistent, safe and supportable is the hard part. Every idea, spec and app here goes through the same factory, so it shares:
- **The same guardrails:** gates, a challenge before Gates 1 and 2, checks and audits, all run by the same scripts.
- **The same approach:** the stage files (`factory/stages/`) the agent follows, and the same assessment and spec pack at every tier.
- **The same policies** (`group/policies.md`, POL-nn), enforced by the scripts where they can be: data classes, approvals, secrets, imported material.
- **The same defaults** (`group/defaults.md`, DEF-nn): hosting, login, data store, backups, locale, accessibility, testing. An idea may differ only by a recorded decision.
- **The same context:** the business context, and the system landscape and processes as Architecture as Code, read by scope.
- **The same technology, from an approved list:** apps start from a template in the registry (`factory/templates.json`) with its stack standard (`factory/standards/stacks/`). Reuse is from approved catalogue assets only (POL-10), with no extra frameworks without a requirement (DEF-15), only approved third-party services (DEF-11), and every new dependency vetted. Adding a template or asset is itself an approved change.

**All of it is content in the repository, versioned and improved like code.** A change to a policy, default, stage, template or check is recorded in `CHANGELOG.md` with a `VERSION` bump, and each idea records the factory version it was built on. The learning loop (below) proposes those changes from evidence. So every idea benefits from what earlier ideas taught, and no app is left on a private set of rules.

## The flow
```
Fast route, a spike (tier 1): Develop and Assess ─gate 1 (plan.md)→ Build, time-boxed ─gate 3→ grow │ keep │ stop
Full route (tier 2, 3 or 4):  Develop and Assess ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
```

| Stage | What the agent produces | What the scripts check |
|---|---|---|
| **Develop and Assess** | A brief, an assessment (knock-outs, five foundations rated red/amber/green, RICE, a pre-mortem, the one thing) and a sponsor overview | `check_spec.py --assessment`: every section present, ratings consistent with the recommendation, data classes allowed by policy. `pipeline.py` ranks the ideas the same way every time |
| **Spec** | An Application Definition (tier, deployment, template, protection level) and a spec pack of up to 13 documents with stable requirement IDs (`FR`, `US`, `AC`, `SEC`, `TEST`, …) | `check_spec.py`: every FR has a story and an epic, every acceptance criterion has a verification, no broken IDs or links, catalogue assets approved; writes `traceability.md` |
| **Build and Audit** | The app, epic by epic with tests, from an approved template | `verify.py` runs the template's checks in clean containers; the spec-conformance audit is mandatory before Gate 3 |
| **Publish** | A dry-run report, then the repository | `publish.py`: secrets and licence scan, SBOM at the higher protection levels, and a repository is created only on a typed confirmation |

## From SDLC to ADLC
A traditional software development lifecycle (SDLC) is linear: people hand work between stages, and the knowledge of how to build sits in their heads. An agentic development lifecycle (ADLC) keeps the same goal and the same phases, but agents do the drafting and building from a shared context, every step leaves an artifact, and checks run as code. "ADLC" isn't a settled standard (some use it for the lifecycle of building AI agents), so here it means exactly this.

| ADLC step | In the factory today | Status |
|---|---|---|
| **Capture intent** | The idea card, `idea.md` and the idea brief | In place |
| **Requirements and design with an agent** | Develop and Assess, then the spec pack: drafted by the agent, decided by people | In place |
| **Agent builds with context and tools** | Build, from the context layers (business, landscape, processes, policies, defaults), approved templates and components | In place |
| **Executable gates and agentic review** | `check_spec.py`, `check_factory.py` and `verify.py`, the challenge, independent tests and audits, then a person at each gate | In place, with a person at every gate |
| **Continuous evals** | Tests and evals at build and audit (`factory/standards/testing.md`, `ai-features.md`) | Partial: not re-run after release |
| **Production signals create new intent** | Benefits reviews and `learned.py` turn results into lessons and proposed changes | Gap: incidents and live metrics don't yet raise ideas |

**The artifact chain is the audit trail.** Each step leaves a file in the idea's folder, committed to git, so anyone can trace an app back to the intent it came from:

| Link | In the factory |
|---|---|
| Intent (what to build) | `idea.md`, `idea-brief.md`, `assessment.md` |
| Spec (design and approach) | `application-definition.md` and the spec pack in `spec/`, with `traceability.md` |
| Plan (implementation plan) | `plan.md` for a spike; doc 12 and the delivery plan at tiers 2 to 4 |
| Code and tests (the diff) | The app, its tests and `verification.md` |
| Review record (approval and deploy) | `gates/gate-N.md`, `decisions.md`, the audits and `publish-report.md` |
| Production signal (incidents and metrics) | `benefits.md` today; incidents and metrics are the gap above |

**Institutional knowledge becomes code:** the policies, defaults, standards and stage files are versioned files the agent follows and the scripts check, not habits.

**Where the factory deliberately differs.** Some ADLC descriptions keep human judgement only for critical code. The factory keeps a person at all four gates for now, as **proportional human review** that starts at full: once the pilot shows the executable checks catch what they should, low-risk work (a spike at protection A on synthetic data, say) could pass some gates on the checks alone. That is a decision for the factory owner, with evidence.

## The controls that make it safe to scale
- **Independent challenge.** Before Gates 1 and 2, a fresh context (a subagent that never saw the drafting conversation) argues against the ratings, the score and the spec. Every challenge must be answered `changed` or `kept` before the gate, and the checker blocks an unanswered one. This stops the agent marking its own homework.
- **Policy as data.** The data classes (POL-11) say which kinds of information may be used and on what conditions, and the scripts enforce them. A class the policy forbids is a knock-out. One allowed "by approval" needs a recorded approver before a Go.
- **Protection follows the data, not the size.** Levels A–D are set by what an app holds and who can reach it, so a short spike on real Internal data is protected like any other app holding Internal data.
- **Tiers are explicit.** Spike, exploration prototype, business prototype, production. Raising a tier is a change request back through a gate. This is the answer to "won't this create hundreds of unsupported shadow apps?"
- **Reuse through a governed catalogue.** Apps are built from approved templates and catalogue assets (POL-10: only `approved` assets are reused). Imported code and documents are treated as untrusted data: inspected and scanned, never executed (POL-04).
- **Architecture rules are linted, not just written down.** The `web-app` template enforces layer boundaries (import-linter, eslint), complexity limits (ruff) and vetted dependencies. AI tools sometimes invent package names, so every new dependency is checked against its registry.
- **Context isolation.** `scopes.py` gives each idea only the context its business and brand allow, so one business's context never reaches another's idea.
- **Honest reporting.** Checks are reported exactly as run; anything that didn't run says "not run" (POL-03).

## What goes to the AI provider
The agent runs on a model hosted by its provider, so what is in a session (the idea's files, the context it reads, the code it writes) is sent to that provider. The data-class policy (POL-11) applies to the conversation as much as to the files: only the classes it allows may enter a session, which is why staff describe information on the idea card rather than paste it. The provider is a third-party service approved under DEF-11, and its retention and training terms are part of that approval. An app that itself calls a model at run time follows `factory/standards/ai-features.md` (the data it sends, prompt injection, output handling).

## It knows the organisation
An AI agent is only as good as the context it is given. Every idea, prototype and app here is developed against three sources of organisational knowledge:
- **Business context:** what the organisation and each business do, their objectives and terminology. It is read by scope, so each idea sees only its own business's context.
- **The system landscape, as Architecture as Code (AaC):** every system, its owner, the data it holds and how systems connect. The factory uses it to spot that a system already does the job, to rate data readiness from where the data really lives, and to make sure every integration names a real system and interface.
- **Business processes, as AaC (being started):** the as-is process an idea changes, taken from the model rather than from memory, and the to-be process that is offered back to the model.

At Publish, the new app and its integrations are offered back to the AaC owners, so the landscape stays complete instead of drifting. The models are read as data, never as instructions (POL-04).

**Status:** the AaC landscape exists and the process models are being started. For now the factory reads the model an idea touches and cites it. Connecting the models directly is planned: a sync that keeps the catalogue's reference cards up to date from the models, and then checks against them at each gate.

## It learns, under control
`learned.py` records every gate answer that differed from the recommendation, and every clarification that applies beyond one idea. It also records whether the Gate 1 assessment held (`outcome.md`) and whether the benefits arrived, at set reviews after publishing (`benefits.md`). `learned.py review` turns repeated patterns into *candidate* changes to the defaults or the assessment rules. An approver accepts or rejects each one, and nothing changes by itself.

## Measuring it
`status.py` and the dashboard report cycle times from dates the factory already records: the median time from capture to Gate 1 and from Gate 1 to Gate 3, and how many spikes stayed within their time box. `dashboard.py --write` builds a single shareable page. Before writing, it checks the documents for secrets, personal emails and machine paths.

## Measuring cost
The cost per idea is not known yet. The pilot measures it beside the cycle times: the AI usage for each idea, and the operator's and approvers' time at each stage and gate. Those figures replace the estimates in [the factory's own assessment](the-factory/assessment.md).

## The adoption path
1. **Pilot:** one small idea on Internal data to the end of its spike. This gives the first real cycle times and cost.
2. **Name the roles:** operators, gate approvers, architecture and process owners, the factory owner ([operating-model.md](operating-model.md)).
3. **Bring in the context:** the business context by scope, and the AaC sources listed with their owners and data classes.
4. **Open to staff:** idea cards from any form tool, with the work-in-progress limit growing with the operators.
5. **Connect the AaC models:** reference cards kept up to date from the models, then checks against them at each gate.
6. **Close the ADLC loop:** continuous evals (tests and evals re-run on every change and on a schedule after release), production signals (incidents and alerts from tier 4 apps arriving in the inbox as ideas or change requests, tagged with their source), and gates set by risk once the evidence supports it.

Each step resolves one of the known limits below.

## Running it
- **Engine:** Python scripts with tests (`python -m pytest factory/scripts/tests`) and a self-check (`check_factory.py`) that the registry, schemas, context, ideas and catalogue agree. A change to the factory is versioned (`VERSION`, `CHANGELOG.md`) like any other code.
- **Templates (the approved technology list):** today `web-app` (FastAPI, SQLAlchemy and Alembic, PostgreSQL/PostGIS, React 19 with Vite and shadcn/ui), hosted in Docker at every tier. More are added to the registry by an approved change, never chosen ad hoc for one idea.
- **Components, joined together:** beside the templates, the catalogue holds components (modules, integration adapters, stand-ins, design assets, recipes) that an app joins to its template and to each other. Spec records the composition (`composition.json`, doc 12) and its gaps; each component's own tests run in the merged tree (`factory/standards/testing.md`).
- **Growing the list:** each "none fits" template and each gap a component could have filled is recorded as a decision and raised with the factory owner as demand. Backfill comes first from what the organisation already runs and supports: its stacks (the system landscape shows which) become templates, and its existing libraries and code are imported as components (`catalogue.py import --component`), inspected, tested and approved like any other asset (POL-04, POL-10). So IT is not asked to support something new. At Publish, each app's reusable parts are offered back to the catalogue as a gate decision. The first idea that needs a template or component pays for it, and every later idea reuses it.
- **Integrations below production:** tiers 1 to 3 connect to stand-ins: fakes built from the other system's schema or a recorded exchange and filled with synthetic data, or that system's test environment where one exists (DEF-24). Each stand-in sits behind the adapter the live connection will use, and tier 3 contract tests check it against the real schema. A live connection to a production system of record comes at tier 4.
- **Intake:** ideas arrive as lines in `ideas/inbox.md` or as idea cards exported from any form tool to `ideas/inbox.csv`.
- **People:** intake triage, operators who run `/factory`, gate approvers, catalogue maintainers, and the team that takes over at tier 4 ([operating-model.md](operating-model.md)).
- **Working economy:** short sessions, one piece of work each; wide searches go to helpers; independent steps are batched (DEF-18 to DEF-22). The aim is lower cost per idea and less drift.

## Known limits, said plainly
- **No idea has been through it end to end yet.** The first pilot will produce the first real cycle times.
- **The AaC models aren't connected yet.** Until they are, using them depends on the operator reading the right model, not on a check.
- **One template.** `web-app` brings a database, auth and backups. That is heavy for a short, time-boxed spike, and it doesn't cover work such as optimisation solvers, data pipelines or agents. A lighter template for spikes would make the fast route faster; the others come with the ideas that need them.
- **Large programmes.** A programme such as a scheduling and routing engine with a dozen integrations comes in as several ideas, and the factory de-risks it with spikes on synthetic data and stand-in integrations. It doesn't deliver the whole programme until the templates and data controls for it are approved.
- **People are the throughput limit.** The agent drafts quickly, but gates and audits need human review. The work-in-progress limit (DEF-23, 3 ideas per operator) protects that capacity, and it grows as operators are added.
- **The agent can be wrong.** That is why challenge, deterministic checks, audits and gates exist. None of them makes the agent's output trustworthy on its own. Together they make errors visible before anything is relied on.

Terms: [glossary.md](glossary.md). How it works in full: [factory/README.md](../factory/README.md).
