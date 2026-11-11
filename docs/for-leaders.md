# The software factory, for leaders

**Good ideas turned into working apps quickly, built one consistent way, safely, by AI with people deciding.** This page is for sponsors and for technical and AI leaders. For staff with an idea, see [for-staff.md](for-staff.md). For how it runs, see [factory/README.md](../factory/README.md).

## The problem it solves
Every organisation has more good ideas than IT can build. Most wait in a queue or are never raised; the rest get built in a spreadsheet or a one-off tool, each its own way. AI makes building faster, but on its own it makes this worse: more apps, built faster, each one different.

## What it is
**One production line for ideas.** An AI coding agent (Claude Code, with the `factory` skill) drafts and builds; plain files and deterministic Python scripts hold the rules and the state and check the work; named people decide at the gates.

| Layer | Does | Doesn't |
|---|---|---|
| **The agent** | Drafts the spike card or brief, answers challenges, builds the app, prepares each gate | Score, approve or publish anything by itself |
| **The scripts** (`factory/scripts/`, no AI) | Validate against schemas, check data classes against policy, record each gate with who signed it, scan for secrets, run checks in clean containers, refuse anything outward-facing without a typed confirmation | Make judgements |
| **People** | The idea's owner develops it; a gate approver, never the owner, signs it off | Write the paperwork |

Every idea goes through the same line, so each gets the same guardrails, policies (`factory/context/group/policies.md`), defaults (`defaults.md`), organisational context, and approved technology (one template today, `web-app`). All of it is content in this repository, versioned and improved like code.

## How an idea goes through
Most ideas start as a **spike**: one question, a one-page card, a small build in a time box (usually one or two person-weeks), then grow, keep or stop. An idea that needs real investment from the start is developed in full first (a brief and an assessment of the problem, value, data, risk and people). Apps come in three sizes, and moving up is always a gate decision, so nothing quietly becomes something people rely on:

| Size | For |
|---|---|
| **1 Spike** | Answering one question fast; may be thrown away |
| **2 Prototype** | People using it and reacting, to shape the idea and the process |
| **3 Production app** | Being relied on: fully tested, supported, with a named owner |

The parts for prototypes and production apps (the spec pack, publishing, benefits reviews, roadmaps for programmes) are written but **dormant** (`factory/dormant/`) until the first idea needs them, so the factory stays small until real use shows what it needs.

## How it stays safe
- **People decide at every gate.** A sign-off is recorded only with the approver's name, and an idea's owner cannot sign off their own idea.
- **Nothing leaves the organisation or goes live without a typed approval** (POL-01).
- **Policy as data.** The data classes (POL-11) say what information may be used and on what terms; the scripts enforce them. Spikes and prototypes run on made-up data against stand-ins for other systems (DEF-24); a live connection to a system of record comes only with a production app.
- **Protection follows the data, not the size.** Levels A to D are set by what an app holds and who can reach it.
- **Independent challenge.** Before a gate, a fresh agent that never saw the drafting argues against the work, and each challenge is answered. This stops the agent marking its own homework.
- **Context isolation.** Each idea sees only the context its business allows, so one business's context never reaches another's idea.
- **Imported material is inspected, never run** (POL-04), and checks are reported exactly as run (POL-03).
- **What goes to the AI provider:** what is in a session is sent to the model's provider, so POL-11 applies to the conversation too. Staff describe information rather than paste it. The provider is an approved third-party service (DEF-11).

## How it improves
Each idea feeds back what it taught: whether the assessment held (`outcome.md` at Gate 3), and which recommendations people overrode (`learned.py`). Repeated patterns become proposed changes for an approver to accept or reject; nothing changes by itself. The factory itself changes through recorded versions (`CHANGELOG.md`): a fix a real idea needed, a cut that makes it simpler, or a practice proven elsewhere and brought across with its evidence. Ideas for it that are not built now wait in `factory/parked.md`.

## Measuring it
`status.py` and the dashboard report cycle times from dates the factory already records: capture to Gate 1, Gate 1 to Gate 3, and spikes within their time box. `usage.py` measures the AI side of the cost per idea: tokens per session and per idea, and the sessions that grew too long (DEF-25). People's time at each gate is not measured yet; the first ideas measure it.

## Where it is now
- **The first idea is a spike** (`plan-cost-calculator`), approved on 2026-11-01. Its first test is whether the people it needs give it two sessions; if they are not booked by 2026-11-08, it stops, as its card says.
- **One template.** `web-app` is heavy for a short spike, though optional features (Share, Theme, Help, Feedback, a heartbeat) can now be switched off at Gate 1. It does not cover solvers, data pipelines or agents. Other templates come with the ideas that need them.
- **People are the limit.** Gates need human review, so at most 3 ideas are in flight per operator (DEF-23).
- **The agent can be wrong.** The challenge, the checks and the gates exist so its errors are visible before anything is relied on.

## What it needs from you
- **Sponsorship** for the first ideas, and then for opening the factory to staff.
- **Named people:** operators and gate approvers ([factory/README.md](../factory/README.md), "Who does what"). A second approver is needed before staff can develop their own ideas, so that owners and approvers differ.
- **Ideas:** small ones are welcome.

Terms: [glossary.md](glossary.md).
