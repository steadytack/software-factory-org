# How the factory works

The factory turns an idea into a built, checked app. Most ideas start as a **spike**: a one-page card, a time-boxed build, then grow, keep or stop. An idea that needs real investment from the start is developed in full (a brief and an assessment) before anything is specified. The factory decides small things itself and records them; it stops at the gates, and for anything only the owner can decide (`context/group/policies.md`).

```
A spike (tier 1):           spike card ─gate 1→ Build, time-boxed ─gate 3→ grow │ keep │ stop
The full route (tier 2-3): Develop and Assess ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
                            (a spike that grows joins the full route at Spec, at the tier the approver names)
```

Tiers (`standards/tiers.md`, chosen per idea): **1 Spike**, **2 Prototype**, **3 Production app**. **Data** (synthetic, a real sample, real) and **protection** (levels A to D, `standards/security.md`) are separate decisions. Every tier is hosted in Docker (DEF-02).

**Active and dormant.** What no idea has used yet (Spec and the spec pack, Publish and benefits reviews, the roadmap route for programmes, the catalogue importer) is in `dormant/`: written, tested, not loaded. Each comes back when an idea needs it (`dormant/README.md`).

| Stage | Produces | Gate approves |
|---|---|---|
| **A spike** (`stages/light.md`) | `spike.md`: the problem, the question, success and stop, the time box, data and protection, the challenge, the sign-off; a time-boxed build; `outcome.md` | Gate 1: Go as a spike or Stop. Gate 3: grow, keep or stop |
| **Develop and Assess** (`stages/develop-assess.md`) | `idea-brief.md`, `assessment.md` (knock-outs, five foundations, RICE, the one thing), `overview.md`; the ranked `ideas/pipeline.md` | Gate 1: Go, Get Ready or Stop |
| **Build and Audit** (`stages/build.md`, `stages/audit.md`) | The app in `app/` with tests; the spec-conformance audit; `outcome.md` | Gate 3: the audit and readiness |
| *After a gate* | `stages/changes.md` for a change, `stages/bugs.md` for a bug in a built app | As the change needs |

## Who does what
| Role | Does | Who |
|---|---|---|
| **Idea owner** | Develops their own idea with `/factory`, tries the spike, owns its success measures | Any member of staff |
| **Factory operator** | Runs `/factory` from Gate 1 on: builds spikes and apps, prepares each gate | `group.operators` in `context/scopes.json` |
| **Gate approver** | Signs off at the gates; never an idea they own | The gate approvers in `context/scopes.json` |
| **Factory owner** | Owns the factory: accepts or rejects proposed changes (`learned.py review`) and releases them | To be named (the group gate approver until then) |

- **Sign-off is recorded with a name** (`--by`), and an owner cannot sign off their own idea while another approver could. Name a second approver before opening the factory to staff.
- **Every idea card gets a reply:** on capture, after Gate 1 (the decision and why; for Stop, what would change it) and after a spike.
- **At most 3 ideas in flight per operator** (DEF-23). It protects review time at the gates.
- **A new operator** reads `SETUP.md`, this page and `stages/`, runs a first idea beside an experienced one, then is added to `group.operators`.

## Where things are
| Path | What |
|---|---|
| `context/` | The owner, policies, defaults, learned choices, environment, systems, lenses (`context/README.md` gives the precedence) |
| `stages/` | What to do: `light.md` (a spike), `develop-assess.md`, `build.md`, `audit.md`, `changes.md`, `bugs.md` |
| `standards/` | `PRINCIPLES.md` for every app, stack rules per template, tiers, security, testing, the challenge, versioning |
| `audits/` | The four audit prompts; spec conformance is mandatory before Gate 3 |
| `dormant/` | Parts set aside until an idea needs them |
| `schemas/` | JSON Schemas for the idea register, assessments and spike cards, state, outcomes, and the dormant parts |
| `scripts/` | The deterministic tools (below) |
| `project-files/` | Stubs copied into new ideas and apps: the spike card, the brief, the assessment, the overview, `NOTES.md` and the dormant parts' stubs |
| `templates.json` | The template registry; the template tables are generated from it |
| `parked.md` | Ideas for the factory itself, parked during the freeze |

## Scripts
| Script | Does |
|---|---|
| `pipeline.py capture / add / develop [--spike] / check / render / decide / reassess / approve-data / light` | Ideas: captured from `ideas/inbox.md` or `ideas/inbox.csv`, developed into a spike card or a brief and assessment, checked (data classes against POL-11) and ranked into `ideas/pipeline.md`; `decide` records Gate 1, `light` a spike's Gate 3, `approve-data` an approver's yes for a class POL-11 allows only by approval |
| `check_spec.py <slug> --assessment` | Gate 1: the spike card, or the brief, assessment and overview |
| `scaffold.py new / overview / app` | An idea's folder (`--spike` for a card), its overview, its app from a template |
| `learned.py outcome / check / add / review / mark` | `outcome.md` at Gate 3, and the learning loop: answers that differed from a recommendation, turned into candidate changes for an approver; nothing changes by itself |
| `status.py [--write] [--ci]`, `status.py --stack <slug>` | Every idea, its stage, tier and gates; cycle times; with `--ci`, the latest run of each workflow in every app with its own repository (`gh`), a red one flagged; with `--stack`, whether the idea's running Docker stack is the current build (exits 1 when a built image is older than its sources) |
| `dashboard.py [--port N] [--write [path]]` | A read-only web page of the ideas and documents |
| `verify.py --template <name>` | A template's checks, in clean containers |
| `check_factory.py [--fix]` | The factory agrees with itself: registry, schemas, context, ideas, catalogue, generated tables |
| `scan.py`, `scopes.py`, `import_source.py` | Secret and licence checks; the context an idea's scope allows; a supplied document into markdown |
| Dormant | `scaffold.py definition / spec / roadmap`, `check_spec.py` on a pack, `publish.py`, `catalogue.py`, `pipeline.py epic`, `learned.py benefits` |

## Rules the scripts never break
- Nothing outward-facing without the owner's typed confirmation (POL-01).
- Every check runs in a clean container or a temporary copy; results are reported as run (POL-03).
- Imported material is inspected, never executed (POL-04).

The factory's own tests: `python -m pip install -r factory/requirements-dev.txt`, then `python -m pytest factory/scripts/tests`.
