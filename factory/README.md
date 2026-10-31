# How the factory works

The factory turns an idea, an existing specification or an imported project into a built, audited application. An idea is first developed into a short brief and assessed against it (knock-outs, the five foundations, RICE, the one thing to know or fix), so the owner can make the investment decision at Gate 1, Go, Get Ready or Stop, before anything is specified. It decides small things itself and records them; it stops at the gates, and for anything only the owner can decide (`context/policies.md`).

```
The fast route, a spike (tier 1): Develop and Assess ─gate 1 (plan.md)→ Build, about a week ─gate 3→ grow │ keep │ stop
The full route (tier 2, 3 or 4):  Develop and Assess ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
```

Ideas come in as lines in `ideas/inbox.md` or as idea cards (`project-files/idea-card.md`) exported to `ideas/inbox.csv`. The terms are in `docs/glossary.md`, and who does what is in `docs/operating-model.md`.

Tiers (`standards/tiers.md`, chosen per idea; no default): **1 Spike** takes the light route; **2 Exploration prototype**, **3 Business prototype** and **4 Production app** take the full route with the spec pack. **Data** (synthetic, a real sample, real) and **protection** (levels A to D, `standards/security.md`) are separate decisions, at every tier. Every tier is hosted in Docker (DEF-02).

| Stage | Produces | Gate approves |
|---|---|---|
| **Develop and Assess** | Ideas captured in `ideas/pipeline.json`; per idea `idea-brief.md` (problem, outcome, today's process, data, risk, people, fit, assumptions), `assessment.md` (knock-outs, the five foundations rated red, amber or green, RICE, the one thing, the recommendation) and `overview.md` for sponsors and the team; the ranked `ideas/pipeline.md` | The investment decision: Go, Get Ready (fix the named foundations, then a light re-assessment) or Stop |
| **Spec** | `application-definition.md` (the solution choices: tier, deployment, interfaces, design, template, candidate assets, lenses), then the spec pack in `spec/` (index plus 13 documents, the as-is and to-be business process included), `composition.json`, the component selection and gaps (doc 12), traceability | The solution choices, requirements, composition, gaps and the delivery plan |
| **Build and Audit** | The app in `app/`, epic by epic with tests; the spec conformance audit; a verification report; `outcome.md` (did the Gate 1 assessment hold?) | The audit and readiness |
| **Publish** | A dry-run report; on a typed confirmation, the repository; `benefits.md`, reviewed 30 and 90 days later (were the success measures met?) | The release |
| *The light route* (`stages/light.md`) | A spike (tier 1), instead of Spec: `plan.md` (the question, success and kill criteria, the time box, the data and protection), approved with Gate 1; a time-boxed build; the outcome | Gate 3: grow (to Spec at the tier named), keep or stop |

## Where things are
| Path | What |
|---|---|
| `context/` | Who the owner is, policies, defaults, learned choices, environment, systems, lenses (`context/README.md` gives the precedence) |
| `stages/` | What to do at each stage: `develop-assess.md`, `spec.md`, `build.md`, `audit.md`, `publish.md`, and `changes.md` for anything after a gate |
| `standards/` | `PRINCIPLES.md` for every app, stack rules per template, the spec pack and its IDs, security, testing, versioning |
| `audits/` | Audit prompts; spec conformance is mandatory before Gate 3 |
| `schemas/` | JSON Schemas for the idea register, the assessment, the Application Definition, project state, composition, catalogue entries, source records and scopes |
| `scripts/` | The deterministic tools (below) |
| `templates.json` | The template registry; the template tables are generated from it |
| `project-files/` | Files copied into new ideas and apps: the idea brief, assessment, overview, Application Definition and spec pack stubs, `NOTES.md` |

## Scripts
| Script | Does |
|---|---|
| `pipeline.py capture / add / develop / check / render / decide / reassess / approve-data / light` | Develop and Assess: captures ideas from `ideas/inbox.md`, the idea cards in `ideas/inbox.csv`, or one at a time, makes each idea's folder with its brief and assessment, validates the assessments (data classes against POL-11), computes and ranks the RICE scores into `ideas/pipeline.md`; `decide` records Gate 1 (Go, Go as a spike, Get Ready with an owner and a review date, Stop), `reassess` reopens a Get Ready idea, `light` records a spike's Gate 3 (grow to a tier, keep, stop); overdue Get Ready ideas are flagged; `approve-data` records an approver's yes for a data class POL-11 allows only by approval |
| `scaffold.py new <slug> --name "..."` | Creates `ideas/<slug>/` with the brief and assessment stubs (`pipeline.py develop` calls it) |
| `scaffold.py overview <slug>` | The overview, filled from the assessment (Gate 1) |
| `scaffold.py plan <slug>` | A spike's plan (`plan.md`), when a spike is recommended |
| `scaffold.py definition <slug>` | The Application Definition: the solution choices (start of Spec) |
| `scaffold.py spec <slug>` | The spec pack stubs, filled from the definition |
| `check_spec.py <slug> [--assessment] [--impact IDs]` | Checks the brief, the assessment and the overview (Gate 1), or the definition and the whole pack (Gate 2): blockers and warnings; writes `spec/traceability.md`; also checks a pack copied outside the factory |
| `scaffold.py app <slug> <template>` | Copies a template into `ideas/<slug>/app/` with its standards, and starts its git repository |
| `status.py [--write]` | Every idea, its stage, tier, template and gates; the cycle times so far (capture to Gate 1, Gate 1 to Gate 3, spikes within their time box) |
| `dashboard.py [--port N] [--write [path]]` | Read-only web page: how the factory works, each idea's progress, published apps, documents. `--write` makes one shareable page from the documents in `factory/web/share.json` |
| `import_source.py <file> <slug>` | A supplied document (docx, md, txt, pdf) into versioned markdown, images and source IDs in `ideas/<slug>/source/` |
| `verify.py --template <name>` | A template's checks from the registry, in clean containers |
| `publish.py <slug> [--fix] [--create] [--public]` | The publish dry run; creates a repository only on a typed confirmation |
| `learned.py add / clarify / recall / review / mark / outcome / benefits / check` | The learning loop: records gate answers that differed from a recommendation, and the owner's clarifications that reach beyond one idea, in `context/learned.md`; `recall` gives an idea only the rows its scope allows; writes each built idea's `outcome.md` (Gate 3) and each published idea's `benefits.md` (30- and 90-day reviews), and `review` turns repeated overrides, foundations rated wrongly, effort or reach mis-estimated, impact or success measures missed and repeated lessons into candidate changes for an approver; nothing changes by itself |
| `check_factory.py [--fix]` | The factory agrees with itself: registry, schemas, context, ideas, the idea register and assessments, learned entries and outcomes, catalogue, generated tables |
| `catalogue.py list / search / show / import / validate / approve / reject` | The catalogue and its safe importer (`catalogue/README.md`) |
| `scan.py` | Static secret, script, instruction and licence checks (used by publish and the importer) |


## Rules the scripts never break
- Nothing outward-facing without the owner's typed confirmation (POL-01).
- Every check runs in a clean container or a temporary copy; results are reported as run (POL-03).
- Imported material is inspected, never executed (POL-04).

The factory's own tests: `python -m pip install -r factory/requirements-dev.txt`, then `python -m pytest factory/scripts/tests`.
