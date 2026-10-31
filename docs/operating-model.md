# Operating model

How Organisation A runs the factory day to day: who does what, how often, and when an app leaves the factory. The rules themselves are in `factory/`. This page is who carries them out. Fill in every "to be named" row before the factory is opened to all staff.

## Roles
| Role | Does | Who |
|---|---|---|
| **Intake triage** | Reads new idea cards (`ideas/inbox.md`, `ideas/inbox.csv`), runs `pipeline.py capture`, and replies to each submitter within a week | to be named |
| **Factory operator** | Runs `/factory` in Claude Code: drafts briefs and assessments, builds spikes and apps, and prepares each gate page | to be named (IT, a small rota), each listed in `scopes.json` `group.operators` |
| **Gate approver** | Decides at the gates: Go, Go as a spike, Get Ready or Stop at Gate 1; approves the spec, the build and the release | the gate approvers in `factory/context/scopes.json` |
| **Idea owner** | The person or team the idea is for: answers questions, tries the spike, owns the success measures | the submitter, or someone they name |
| **Catalogue maintainer** | Approves reusable assets and checks each system's reference card | the catalogue approvers in `scopes.json`, and each card's maintainer |
| **Supporting team** | Takes over an app at tier 4: support, monitoring, backups, its retirement plan | the IT team that owns that service |

## Rhythm
| When | What |
|---|---|
| Weekly | Triage the inbox; reply to every submitter |
| Every two weeks | Gate 1 decision meeting: the ranked `ideas/pipeline.md`, Get Ready ideas past their review date, and spikes ending at Gate 3 |
| Monthly | `python factory/scripts/status.py` and the cycle times to leadership; `learned.py review` for changes to the factory |
| 30 and 90 days after publishing | The benefits review (`factory/stages/publish.md`) |

## Targets
- A reply to every idea card within **one week**.
- Gate 1 within **two weeks** of capture.
- A spike finishes within its time box (one person-week by default).
- Ideas in flight past Gate 1: at most 3 per operator (DEF-23, `factory/context/group/defaults.md`). Add each operator to `group.operators` in `factory/context/scopes.json` and the limit grows with them. It protects review capacity, not the number of ideas: every idea in flight needs people at its gates and audit.

## When an app leaves the factory
An app stays the factory's responsibility through tier 3. To be relied on, it is raised to tier 4 (`factory/stages/changes.md`, "Raising the tier") and the supporting team accepts it at Gate 4: a named owner, support, monitoring, tested recovery and a retirement plan (`factory/standards/tiers.md`). An app no one will support stays at tier 3, or is retired.
