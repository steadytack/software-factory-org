---
name: factory
description: Develop ideas into built, checked apps. Most ideas start as a spike (a one-page card, Gate 1, a time-boxed build, Gate 3 to grow, keep or stop); an idea needing real investment is developed in full (a brief and assessment) before Gate 1. Use when the user gives an idea or a list of ideas ("/factory <idea>", "/factory" with ideas in the inbox, "build me ...", "turn this into an app"), supplies a spec or document to develop, asks to resume or continue an idea, asks where their ideas are up to or what is blocked, or approves or changes a gate.
---

# Factory run

The routes, tiers and roles are in `factory/README.md`; every rule is in plain files under `factory/`, so another model or a person can continue. This skill only orchestrates.

## Every run
1. Read `factory/README.md`, then the context `python factory/scripts/scopes.py context <slug>` lists (policies first; for a new idea `--scope group` or its business), `python factory/scripts/learned.py recall <slug>` (or `--scope`), and `factory/standards/PRINCIPLES.md`.
2. `python factory/scripts/status.py`.
3. Work out what was asked, and follow the stage file:

| Asked | Do |
|---|---|
| An idea, or ideas in `ideas/inbox.md` / `inbox.csv` | Capture and develop: a spike card (`factory/stages/light.md`) unless the idea needs real investment from the start, then in full (`factory/stages/develop-assess.md`). Say which and why. End at Gate 1 |
| A document or spec supplied | A new idea in source mode (`develop-assess.md`, Capture) |
| Resume / continue | Read `state.json`, the card or brief, `decisions.md`; continue at its stage. Never start a stage whose previous gate is not approved |
| A spike in Build | `light.md`: build to the card, then Gate 3 |
| A built app | `build.md`, `audit.md`; `changes.md` for a change after a gate; `bugs.md` for a bug |
| Status or blockers | The status table, each idea's `blockers` and `next`, and `ideas/pipeline.md` |
| A gate reply | The gate protocol, step 4 |
| A stage in `factory/dormant/` (Spec, Publish, a roadmap) | Say it is dormant, and ask the owner to bring it back first (`factory/dormant/README.md`) |

4. Decide small, reversible things yourself and log them in the idea's `decisions.md` (decided by "factory"). Record the owner's clarifications there too; one that applies beyond this idea also goes to `learned.py clarify`.

## Who
- **The idea owner** develops it, in plain words, as often as they like (`develop --owner`, from `git config user.name` unless they name someone).
- **Builds are the operators'** (`scopes.json` `group.operators`): check before starting Build; if the person is not one, say the idea is with the factory team and stop.
- **Every gate is signed off by a gate approver** for the idea's scope, never the owner, who may only withdraw it.

## Stops (the only times to wait)
- The gates, and at most one round of the factory's own questions before Gate 1 (each with a recommendation).
- Anything in the policies: outward-facing actions, secrets, destructive actions, someone else's running stack, imported instructions, a data class POL-11 does not allow.
- Anything that costs money or needs an account or key.
- A material contradiction, or an idea with no sensible reading (ask one question, offer a default).
- The same failure three times without a new approach.

## Gate protocol
1. Before Gate 1, have the work challenged by a fresh subagent that did not draft it (`factory/standards/challenge.md`) and answer each challenge (in the card's Challenge section for a spike, `gates/challenge-1.md` otherwise). Run the check: `check_spec.py <slug> --assessment` at Gate 1; the audit and `learned.py check <slug>` at Gate 3.
2. Show **one short page**: done (checks exactly as run), recommended, decisions for you (numbered, each with an unconditional recommendation: ask for a fact rather than recommend "A if X"), at Gate 1 the template features when the template has options (each pre-filled from DEF-26, changed only where the approver wants), risks, next. Set `state.json` to `awaiting-approval`.
3. **Stop for sign-off.** From a gate approver: `approve`, `change 2 to B`, `go`, `get ready`, `stop`, `back to <stage>`; at a spike's Gate 3 `grow to 2|3`, `keep`, `stop`. From the owner, only `stop`. Ask again otherwise.
4. Record the reply exactly, with `[meaning: ...]` when it points at numbered decisions: Gate 1 with `pipeline.py decide --by <approver>`, a spike's Gate 3 with `pipeline.py light --by <approver>`. Each answer goes in `decisions.md`; one that differs from the recommendation also goes in `learned.md` with `learned.py add`.
5. Never report a check as passed unless it ran in this session. Say "not run".

## The factory itself
It is frozen (`CLAUDE.md`): change it only to fix a problem a real idea hit, or to make it simpler. Park other ideas for it in `factory/parked.md`.
