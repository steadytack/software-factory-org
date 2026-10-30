---
name: factory
description: Develop an idea, a supplied specification or an imported project into a built, audited app through four gated stages (Analyse, Spec, Build and Audit, Publish), reusing approved catalogue assets. Use when the user gives an idea to build ("/factory <idea>", "build me ...", "turn this into an app"), supplies a spec or document to develop, asks to resume or continue an idea, asks where their ideas are up to or what is blocked, or approves or changes a gate.
---

# Factory run

```
Analyse ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
```

Every rule lives in plain files (`factory/`), so another model or a person can continue from them. This skill only orchestrates.

## Every run
1. Read `factory/README.md`, `factory/context/README.md`, the context files `python factory/scripts/scopes.py context <slug>` lists, in that order (policies first; for a new idea, `--scope group` or the business it is for), and `factory/standards/PRINCIPLES.md`.
2. `python factory/scripts/status.py`.
3. Work out what was asked:
   - **New idea:** a slug, then `scaffold.py new`, then `factory/stages/analyse.md`.
   - **A document or spec supplied:** a new idea in source mode (`analyse.md`, Source mode).
   - **A repository or folder to reuse from:** the catalogue importer (`catalogue/README.md`), not an idea.
   - **Resume / continue:** read the idea's `state.json`, `idea.md`, `decisions.md` and continue at its stage. Never start a stage whose previous gate is not approved.
   - **Status or blockers:** the status table, plus each idea's `blockers` and `next`.
   - **A gate reply:** apply it (gate protocol, step 4).
4. Follow the stage file: `analyse.md`, `spec.md`, `build.md`, then `audit.md`, `publish.md`; `changes.md` for anything that changes after a gate.
5. Decide small, reversible things yourself, log them in the idea's `decisions.md` (decided by "factory"), and keep going.

## Stops (the only times to wait)
- The gates, and the question rounds (at most two across Analyse and Spec, each question with a recommendation).
- Anything in `factory/context/policies.md`: outward-facing actions, secrets, destructive actions, someone else's running stack, imported instructions.
- Anything that costs money or needs an account or key.
- A material contradiction, or an idea with no sensible reading (ask one question, offer a default).
- The same failure three times without a new approach.

## Gate protocol (identical at every gate)
1. Run the stage's check (`check_spec.py --definition` at Gate 1, `check_spec.py` at Gate 2, the audit and verification at Gate 3, the publish dry run at Gate 4). Write `ideas/<slug>/gates/gate-N.md`; set `state.json` (`status: awaiting-approval`, the gate `awaiting-approval`, `next`).
2. Show **one page**: **Done** (what was produced, where, checks exactly as run); **Recommended**; **Decisions for you** (numbered, 2-3 options, the recommendation marked with a reason in one clause); **Answered from your defaults** (listed, not asked); **Risks**; **Next**.
3. **Stop.** Accept only `approve`, `accept all`, `change 3 to B` (and free text for it), or `back to <stage>`; ask again otherwise.
4. On approval: record the reply and date in the gate file, in `state.json` (gate `approved`, `date`, `reply`, the version approved) and, at Gate 1, in the definition's `approvals` (choices become `accepted`, version `1.0`, status `approved`). Record each answer in `decisions.md`; an answer that differs from the recommendation also goes into `factory/context/learned.md` (`observed`, with its scope; never into defaults by itself). Move `state.json` to the next stage, `in-progress`.
5. Never report a check as passed unless it ran in this session. Say "not run".

## Publishing
Only at Gate 4, only on an explicit approve, only through `factory/scripts/publish.py`, with the owner typing the confirmation. A previous approval never carries over.

## Where things are
`factory/stages/` (what to do), `factory/context/` (owner, policies, defaults, learned, environment, lenses), `factory/standards/` (principles, stacks, spec pack, IDs, security, testing, versioning), `factory/schemas/`, `factory/scripts/`, `catalogue/` (approved reusable assets), `templates/`, `ideas/<slug>/` (state, definition, decisions, changes, gates, source, spec, composition, `app/`).
