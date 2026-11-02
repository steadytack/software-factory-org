# Operating model

How Organisation A runs the factory: who does what, how often, and when an app leaves the factory. The rules themselves are in `factory/`. This page is who carries them out. Fill in every "to be named" row before the factory is opened to all staff.

## Roles
| Role | Does | Who |
|---|---|---|
| **Intake triage** | Reads new idea cards (`ideas/inbox.md`, `ideas/inbox.csv`), runs `pipeline.py capture`, and makes sure every submitter gets a reply (below) | to be named |
| **Factory operator** | Runs `/factory` in Claude Code: drafts briefs and assessments, builds spikes and apps, and prepares each gate page | to be named (IT, a small rota), each listed in `scopes.json` `group.operators` |
| **Idea owner** | Develops and assesses their own idea with `/factory` (Develop and Assess is self-service: the brief, the assessment, the challenge, as many rounds as they like), then asks for sign-off; answers questions, tries the spike and owns the success measures after it | any member of staff: the submitter, or someone they name |
| **Gate approver** | Signs off at the gates: Go, Go as a spike, Go on the roadmap, Get Ready or Stop at Gate 1; the spec, the build and the release after it. Never signs off an idea they own | the gate approvers in `factory/context/scopes.json` |
| **Architecture owner** | Owns the AaC model of the system landscape: answers questions about a system, and adds new apps and integrations to the model when the factory offers them at Publish | to be named (the AaC team) |
| **Process owner** | Owns a process model: confirms the as-is an idea starts from, and adds its to-be once the app is live | to be named, per process |
| **Factory owner** | Owns the factory itself: the policies, defaults, stages, templates and checks every idea shares. Accepts or rejects the improvements `learned.py review` proposes, and releases them as versions | to be named (the group gate approver until then) |
| **Catalogue maintainer** | Approves reusable assets and checks each system's reference card | the catalogue approvers in `scopes.json`, and each card's maintainer |
| **Supporting team** | Takes over an app at tier 4: support, monitoring, backups, its retirement plan | the IT team that owns that service |

## Who does which stage
| Stage | Who does the work | Who signs it off |
|---|---|---|
| **Develop and Assess** (the brief, the assessment, the overview; a roadmap for a project or programme) | The idea owner, with `/factory` coaching them; an operator helps only if asked. Intake triage develops idea cards sent in by people who would rather not | **Gate 1**: a gate approver for the idea's scope, not the owner. The owner may withdraw (stop) their own idea |
| **Spec** | Factory operators, with the owner answering one round of questions | **Gate 2**: a gate approver |
| **Build and Audit** (or a spike) | Factory operators; the owner tries what is built | **Gate 3**: a gate approver (a spike's grow, keep or stop too) |
| **Publish** | Factory operators; the supporting team at tier 4 | **Gate 4**: a gate approver, with the supporting team's acceptance at tier 4 |
| **A roadmap's epics** | Each epic as above: its owner develops it, operators build it | Each epic's own gates; changes to the roadmap at the next epic's Gate 1 |

The scripts hold this line: a gate decision is recorded only with the name of the approver who signed it off (`--by`), and the idea's owner cannot sign off their own idea while another approver could. With a single approver who owns the idea, the sign-off is recorded with a note; name a second approver before the factory is opened to staff.

## Rhythm
The organisation sets how often each happens, and can change it as the volume of ideas grows.

| What | Cadence |
|---|---|
| Triage the inbox and acknowledge every new idea card | to be set |
| The Gate 1 decision meeting: the ranked `ideas/pipeline.md`, Get Ready ideas past their review date, and spikes ending at Gate 3 | to be set |
| `python factory/scripts/status.py` and the cycle times to leadership; `learned.py review`, where the factory owner decides which proposed improvements to the shared policies, defaults, templates and approach to release | to be set |
| The new app, its integrations and its to-be process offered to the architecture and process owners for their models | at each publish |
| The benefits reviews (`factory/stages/publish.md`) | when `ideas/pipeline.md` shows them due |

## Targets
The organisation sets the targets; the factory measures them (`status.py`, the cycle times).
- Every idea card gets a reply. Target: to be set.
- Every idea reaches Gate 1. Target, from capture: to be set.
- A spike finishes within its time box, agreed in its plan at Gate 1.
- Ideas in flight past Gate 1: at most 3 per operator (DEF-23, `factory/context/group/defaults.md`). Add each operator to `group.operators` in `factory/context/scopes.json` and the limit grows with them. It protects review capacity, not the number of ideas: every idea in flight needs people at its gates and audit.

## Replying to submitters
Intake triage owns the reply, and no idea card goes unanswered:
- **On capture:** an acknowledgement, and when its decision meeting is.
- **After Gate 1:** the decision, its reason and the idea's overview (`overview.md`). **Go** or **go as a spike** says what happens next and who the operator is. **Get ready** says what has to be fixed, by whom, and when it comes back. **Stop** says why, and what would change the answer.
- **After a spike:** whether it grows, is kept as it is, or stops, and why.

## Choosing the pilot idea
The first idea proves the factory, so choose one that can succeed and be measured:
- small, with one clear question a spike can answer;
- Internal data only, with no confidential or personal data;
- an owner who wants it and will try the spike;
- an outcome that can be measured;
- no hard integrations (at most reading from one system).

## Onboarding an operator
1. Read `SETUP.md`, this page, `factory/README.md` and the stage files (`factory/stages/`).
2. Run a first idea alongside an experienced operator, from capture to Gate 1.
3. Add them to `group.operators` in `factory/context/scopes.json`. This raises the work-in-progress limit by 3 (DEF-23).

## Growing the approved technology
The approved technology is templates to start from and a library of components that join with them and with each other. Both start small and grow with demand:
- Each "none fits" template at Spec, and each gap a component could have filled, is recorded as a decision and raised with the factory owner.
- Backfill comes first from what the organisation already runs and supports: its stacks, as the system landscape shows them, become templates, and its existing libraries and code are imported as components. So the factory doesn't add something new to support.
- Each app's reusable parts are offered back to the catalogue at Publish, as a gate decision.
- The factory owner decides which templates to add, with the architect who owns that technology; a template is an approved change to the registry, with its stack standard, skeleton and tests, released as a factory version. Catalogue maintainers take components through the catalogue's lifecycle, and only approved ones are reused (POL-10).

## Projects and programmes
A project or programme is developed as one idea with a **roadmap** (`factory/stages/roadmap.md`): the overall plan of how it builds out over time, from the end state back to the first step. Its open questions (does the approach work, does a product fit, what will it cost) are **spike epics** early in the plan, on synthetic data with stand-in integrations (DEF-24), and the builds that depend on them come after. Gate 1 signs off the roadmap as the direction; each epic then goes through the factory as an idea of its own, with its own sign-off, and the roadmap is updated after each one. Parts the factory cannot build yet (a live connection to a system of record, technology with no approved template) are **project epics** in the same roadmap, delivered with IT, so the whole build-out is in one plan.

## When an app leaves the factory
An app stays the factory's responsibility through tier 3. To be relied on, it is raised to tier 4 (`factory/stages/changes.md`, "Raising the tier") and the supporting team accepts it at Gate 4: a named owner, support, monitoring, tested recovery and a retirement plan (`factory/standards/tiers.md`). An app no one will support stays at tier 3, or is retired.
