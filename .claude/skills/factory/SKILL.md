---
name: factory
description: Develop ideas into built, audited apps through four gated stages (Develop and Assess, Spec, Build and Audit, Publish), reusing approved catalogue assets. Each idea is first developed into a short brief and assessed (knock-outs, the five foundations, RICE, the one thing) so the owner can decide Go, Get Ready or Stop before anything is specified. Use when the user gives an idea or a list of ideas ("/factory <idea>", "/factory" with ideas in the inbox, "build me ...", "turn this into an app"), supplies a spec or document to develop, asks to resume or continue an idea, asks where their ideas are up to or what is blocked, or approves or changes a gate.
---

# Factory run

```
The fast route, a spike (tier 1): Develop and Assess ─gate 1 (plan.md)→ Build, time-boxed ─gate 3→ grow │ keep │ stop
The full route (tier 2, 3 or 4):  Develop and Assess ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
                                  (a spike that grows joins the full route at Spec, at the tier the approver names)
A project or programme:          Develop and Assess (roadmap.md) ─gate 1→ the roadmap: each epic (spikes first) an idea of its own

Tiers (factory/standards/tiers.md): 1 Spike · 2 Exploration prototype · 3 Business prototype · 4 Production app.
Data and protection are decided separately, per idea.
```

The factory develops ideas; it does not filter them. An early or rough idea is worked on with its unknowns stated, an unknown is amber not red, and an idea whose questions a small build would answer goes on the light route as a spike. At Gate 1, say plainly whether a spike fits and why (`factory/stages/light.md`, When): it is the fast route, and often the right first step, but it is recommended on the idea's merits, never by default (DEF-01).

Every idea is developed knowing the organisation: its business context, its system landscape and its processes, described as Architecture as Code (`factory/context/README.md`, "What the factory knows about the organisation"). Name the existing systems an idea uses, replaces or overlaps, and the process it changes, from those sources, and cite them.

Every rule lives in plain files (`factory/`), so another model or a person can continue from them. This skill only orchestrates.

## Who does what
- **Develop and Assess is the idea owner's**, and anyone may be one: a member of staff developing and hardening their own idea. Speak to them in plain words, coach rather than judge (the lenses' questions, the pre-mortem, the challenge), and let them go round as often as they like. Record them with `develop --owner` (who is running `/factory`, `git config user.name`, unless they name someone).
- **Every gate is signed off by a gate approver** for the idea's scope (`factory/context/scopes.json`), never by the idea's owner, who may only withdraw (stop) it. When the person replying at a gate is not an approver, it is a request for sign-off: say who can sign and stop.
- **Spec, Build and Audit, and Publish are the factory operators'** (`scopes.json` `group.operators`). Before starting or resuming one of these stages, check that the person running `/factory` is an operator (`git config user.name`); if not, say the idea is with the factory team, show where it is up to, and stop.
- A **project or programme** (`scale` in the assessment) is built out over time on its roadmap (`factory/stages/roadmap.md`): the overall plan, with the spikes as epics in it.

## Every run
1. Read `factory/README.md`, `factory/context/README.md`, the context files `python factory/scripts/scopes.py context <slug>` lists, in that order (policies first; for a new idea, `--scope group` or the business it is for), what earlier ideas taught that applies here (`python factory/scripts/learned.py recall <slug>`, or `--scope` for a new idea; at the start of every stage), and `factory/standards/PRINCIPLES.md`.
2. `python factory/scripts/status.py`.
3. Work out what was asked:
   - **Ideas in the inbox** (`/factory` with lines in `ideas/inbox.md` or rows in `ideas/inbox.csv`, the idea cards) or **one idea** (`/factory <idea>`): capture, develop and assess them (`factory/stages/develop-assess.md`), ending at Gate 1 for sign-off. A project or programme gets its roadmap (`roadmap.md`). If the owner wants to talk an idea through first, do that (Develop: work it through) before drafting.
   - **A document or spec supplied:** a new idea in source mode (`develop-assess.md`, Capture).
   - **A repository or folder to reuse from:** the catalogue importer (`catalogue/README.md`), not an idea.
   - **Resume / continue:** read the idea's `state.json`, `idea.md`, `decisions.md` and continue at its stage. Never start a stage whose previous gate is not approved; a Get Ready idea resumes with `pipeline.py reassess`, a light re-assessment; the light route (`state.json` `route: light`) follows `factory/stages/light.md`; a roadmap (`stage: roadmap`) follows `factory/stages/roadmap.md`, starting its next epic with `pipeline.py epic`.
   - **Status or blockers:** the status table, plus each idea's `blockers` and `next`; `ideas/pipeline.md` for the ranked pipeline, any Get Ready idea past its review date (bring it back to Gate 1), any benefits review overdue, and the ideas in flight against the DEF-23 limit.
   - **A benefits review due** (`ideas/pipeline.md`, "Benefits reviews due"): run it (`publish.md`, "The benefits review").
   - **A gate reply:** apply it (gate protocol, step 4).
4. Follow the stage file: `develop-assess.md`, `spec.md`, `build.md`, then `audit.md`, `publish.md` (the light route: `light.md`; a project or programme: `roadmap.md`); `changes.md` for anything that changes after a gate; `bugs.md` for a bug in a built app (it does not do what the approved spec says).
5. Decide small, reversible things yourself, log them in the idea's `decisions.md` (decided by "factory"), and keep going.
6. When the owner clarifies something, at any stage and in any form, record it in `decisions.md` (decided by the owner). If it could apply beyond this idea (a fact about a business, a brand or its users, or a preference for that kind of app), also `learned.py clarify` with the scope you judge, and say that scope in one line so the owner can correct it. It is never written into defaults or context by itself: it becomes a candidate at the next gate.

## Stops (the only times to wait)
- The gates, and the question rounds (at most one round of the factory's questions in Develop and Assess and one in Spec, each question with a recommendation; a conversation the owner leads is not a round).
- Anything in `factory/context/policies.md`: outward-facing actions, secrets, destructive actions, someone else's running stack, imported instructions; and a data class an idea needs that POL-11 does not allow.
- Anything that costs money or needs an account or key.
- A material contradiction, or an idea with no sensible reading (ask one question, offer a default).
- The same failure three times without a new approach.

## Gate protocol (identical at every gate)
1. At Gates 1 and 2, have the work challenged first by a fresh context that did not draft it (a subagent; `factory/standards/challenge.md`) and answer every challenge. Run the stage's check (`check_spec.py --assessment` at Gate 1, `check_spec.py` at Gate 2, the audit, verification and `learned.py check <slug>` at Gate 3, the publish dry run at Gate 4), and `python factory/scripts/learned.py review`. Write `ideas/<slug>/gates/gate-N.md`; set `state.json` (`status: awaiting-approval`, the gate `awaiting-approval`, `next`).
2. Show **one page**: **Done** (what was produced, where, checks exactly as run, and at Gates 1 and 2 the challenge: who, how many, how many changed the work); **Recommended**; **Decisions for you** (numbered, 2-3 options, the recommendation marked with a reason in one clause; the recommendation is unconditional, never "A if X": when it turns on a fact only the owner knows, ask for the fact instead, and recommend once it is answered, so `learned.md` records only real overrides); **Answered from your defaults** (listed, not asked); **Risks**; **Next**. Each candidate change from `learned.py review` is one more numbered decision ("write this clarification into the business context?", "promote to a default?", "review the lens?"), recommended yes only when the evidence is clear.
3. **Stop for sign-off.** Accept, from a gate approver for the idea's scope other than its owner, only `approve`, `accept all`, `change 3 to B` (and free text for it), or `back to <stage>`; at Gate 1 also `go`, `go as a spike`, `go on the roadmap`, `get ready` and `stop`; at a spike's Gate 3 `grow to <tier>`, `keep` and `stop`. From the owner, accept only `stop` (withdrawn). Ask again otherwise.
4. On approval: record the reply, the date and who signed it off in the gate file, in `state.json` (gate `approved`, `date`, `reply`, `by`, the version approved) and, at Gate 2, in the definition's `approvals` (choices become `accepted`, version `1.0`, status `approved`). Gate 1 is recorded by `pipeline.py decide --by <approver>` (Go, Go as a spike, Go on the roadmap, Get Ready with an owner and a review date, or Stop; `develop-assess.md`), a spike's Gate 3 by `pipeline.py light --by <approver>` (`light.md`). Record each answer in `decisions.md`; an answer that differs from the recommendation also goes into `factory/context/learned.md` with `learned.py add` (`observed`, with a key and its scope; never into defaults by itself). A yes to a candidate change: `learned.py mark <key> confirmed` and edit the default, context file, lens or knock-out rule, a change to the factory (`CHANGELOG.md`, `VERSION`); a no: `learned.py mark <key> superseded` when the evidence no longer applies, else leave it observed. Move `state.json` to the next stage, `in-progress`.
5. Never report a check as passed unless it ran in this session. Say "not run".

## Publishing
Only at Gate 4, only on an explicit approve, only through `factory/scripts/publish.py`, with the owner typing the confirmation. A previous approval never carries over.

## Where things are
`factory/stages/` (what to do), `factory/context/` (owner, policies, defaults, learned, environment, lenses), `factory/standards/` (principles, tiers, stacks, spec pack, IDs, security, testing, versioning), `factory/schemas/`, `factory/scripts/`, `catalogue/` (approved reusable assets), `templates/`, `ideas/<slug>/` (state, idea, brief, assessment, overview, definition, decisions, changes, gates, source, spec, composition, `app/`, outcome); `ideas/inbox.md`, `ideas/pipeline.json` (the ideas captured) and `ideas/pipeline.md` (the ranked pipeline).
