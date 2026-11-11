# Organisation software factory

**Good ideas turned into working apps quickly, built one consistent way, safely, by AI with people deciding.**

Every organisation has more good ideas than IT can build. Most wait in a queue; the rest become a spreadsheet or a one-off tool, each built its own way. AI makes building faster, but on its own it makes that worse: more apps, built faster, each one different. The factory is one production line for ideas. An AI agent (Claude Code, with `/factory`) drafts and builds. Plain files and scripts hold the rules and check the work. Named people decide at every gate.

## How an idea goes through
```
idea ─→ spike card ─→ Gate 1 ─→ build in a time box ─→ Gate 3 ─→ grow, keep or stop
         (one page)   (go?)      (1–2 person-weeks)    (did it work?)
```
Most ideas start as a **spike**: one question, a one-page card, a small build. An idea that needs real investment from the start gets a full brief and assessment first. Moving up from spike to prototype to production app is always a gate decision, so nothing quietly becomes something people rely on.

## What every app gets
- **The same guardrails:** the organisation's policies and defaults, enforced by scripts, not by memory. Only the information the rules allow is used, and spikes run on made-up data.
- **A proven template** (`web-app`). It comes with sign-in and roles, checked daily backups, secrets kept out of the code, and accessibility and browser-error checks on every page. Optional features are chosen at Gate 1.
- **Checks reported as run:** clean-container tests, a smoke test of the running app, and an audit against what was approved. An independent agent challenges the work before each gate.
- **A sign-off from someone who isn't the idea's owner,** recorded with their name.

## Start here
- **Have an idea?** [docs/for-staff.md](docs/for-staff.md): what to send and what happens next.
- **Leading, sponsoring or assessing it?** [docs/for-leaders.md](docs/for-leaders.md): what it is, how it stays safe, where it is now.
- **Running it?** [factory/README.md](factory/README.md) (how it works, who does what) and [SETUP.md](SETUP.md) (first time here).
- **Where are the ideas up to?** [ideas/pipeline.md](ideas/pipeline.md).
- **A word you don't know?** [docs/glossary.md](docs/glossary.md).

## Layout
| Folder | Holds |
|---|---|
| `factory/` | The rules (stages, standards, audits, schemas, scripts), the organisation's context (`factory/context/`), and parts set aside until needed (`factory/dormant/`) |
| `catalogue/` | Approved reusable assets and reference cards for existing systems |
| `templates/` | The application templates the organisation chose |
| `ideas/<slug>/` | One idea each |
| `docs/` | The guides for staff and leaders, and the glossary |

## Templates
<!-- templates:start -->
| Template | Version | Status | For |
|---|---|---|---|
| `web-app` | 1.4.0 | ready, verified (see its README) | a web application with a frontend and backend, geospatial-capable |
<!-- templates:end -->
