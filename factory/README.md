# How the factory works

The factory turns an idea, an existing specification or an imported project into a built, audited application. An idea is first developed into a short brief and assessed against it (knock-outs, the five foundations, RICE, the one thing to know or fix), so the owner can make the investment decision at Gate 1, Go, Get Ready or Stop, before anything is specified. It decides small things itself and records them; it stops at the gates, and for anything only the owner can decide (`context/policies.md`).

```
Develop and Assess ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
```

| Stage | Produces | Gate approves |
|---|---|---|
| **Develop and Assess** | Ideas captured in `ideas/pipeline.json`; per idea `idea-brief.md` (problem, outcome, today's process, data, risk, people, fit, assumptions), `assessment.md` (knock-outs, the five foundations rated red, amber or green, RICE, the one thing, the recommendation) and `overview.md` for sponsors and the team; the ranked `ideas/pipeline.md` | The investment decision: Go, Get Ready (fix the named foundations, then a light re-assessment) or Stop |
| **Spec** | `application-definition.md` (the solution choices: tier, deployment, interfaces, design, template, candidate assets, lenses), then the spec pack in `spec/` (index plus 13 documents, the as-is and to-be business process included), `composition.json`, the component selection and gaps (doc 12), traceability | The solution choices, requirements, composition, gaps and the delivery plan |
| **Build and Audit** | The app in `app/`, epic by epic with tests; the spec conformance audit; a verification report; `outcome.md` (did the Gate 1 assessment hold?) | The audit and readiness |
| **Publish** | A dry-run report; on a typed confirmation, the repository | The release |

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
| `pipeline.py capture / add / develop / check / render / decide / reassess` | Develop and Assess: captures ideas from `ideas/inbox.md` or one at a time, makes each idea's folder with its brief and assessment, validates the assessments (data classes against POL-11), computes and ranks the RICE scores into `ideas/pipeline.md`; `decide` records Gate 1 (Go, Get Ready, Stop), `reassess` reopens a Get Ready idea |
| `scaffold.py new <slug> --name "..."` | Creates `ideas/<slug>/` with the brief and assessment stubs (`pipeline.py develop` calls it) |
| `scaffold.py overview <slug>` | The overview, filled from the assessment (Gate 1) |
| `scaffold.py definition <slug>` | The Application Definition: the solution choices (start of Spec) |
| `scaffold.py spec <slug>` | The spec pack stubs, filled from the definition |
| `check_spec.py <slug> [--assessment] [--impact IDs]` | Checks the brief, the assessment and the overview (Gate 1), or the definition and the whole pack (Gate 2): blockers and warnings; writes `spec/traceability.md`; also checks a pack copied outside the factory |
| `scaffold.py app <slug> <template>` | Copies a template into `ideas/<slug>/app/` with its standards, and starts its git repository |
| `status.py [--write]` | Every idea, its stage, tier, template and gates |
| `dashboard.py [--port N] [--write [path]]` | Read-only web page: how the factory works, each idea's progress, published apps, documents. `--write` makes one shareable page from the documents in `factory/web/share.json` |
| `import_source.py <file> <slug>` | A supplied document (docx, md, txt, pdf) into versioned markdown, images and source IDs in `ideas/<slug>/source/` |
| `verify.py --template <name>` | A template's checks from the registry, in clean containers |
| `publish.py <slug> [--fix] [--create] [--public]` | The publish dry run; creates a repository only on a typed confirmation |
| `learned.py add / review / mark / outcome / check` | The learning loop: records gate answers that differed from a recommendation in `context/learned.md`, writes each built idea's `outcome.md` (Gate 3), and `review` turns repeated overrides, foundations rated wrongly, effort mis-estimated and repeated lessons into candidate changes for an approver; nothing changes by itself |
| `check_factory.py [--fix]` | The factory agrees with itself: registry, schemas, context, ideas, the idea register and assessments, learned entries and outcomes, catalogue, generated tables |
| `catalogue.py list / search / show / import / validate / approve / reject` | The catalogue and its safe importer (`catalogue/README.md`) |
| `scan.py` | Static secret, script, instruction and licence checks (used by publish and the importer) |


## Rules the scripts never break
- Nothing outward-facing without the owner's typed confirmation (POL-01).
- Every check runs in a clean container or a temporary copy; results are reported as run (POL-03).
- Imported material is inspected, never executed (POL-04).

The factory's own tests: `python -m pip install -r factory/requirements-dev.txt`, then `python -m pytest factory/scripts/tests`.
