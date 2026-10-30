# How the factory works

The factory turns an idea, an existing specification or an imported project into a built, audited application. It decides small things itself and records them; it stops at four gates, and for anything only the owner can decide (`context/policies.md`).

```
Analyse ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
```

| Stage | Produces | Gate approves |
|---|---|---|
| **Analyse** | `application-definition.md`: problem, users, scope, maturity tier, deployment, interfaces, design choices, candidate catalogue assets, assumptions and risks | The Application Definition |
| **Spec** | The spec pack in `spec/` (index plus 12 documents), `composition.json`, the component selection and gaps (doc 12), traceability | Requirements, composition, gaps and the delivery plan |
| **Build and Audit** | The app in `app/`, epic by epic with tests; the spec conformance audit; a verification report | The audit and readiness |
| **Publish** | A dry-run report; on a typed confirmation, the repository | The release |

## Where things are
| Path | What |
|---|---|
| `context/` | Who the owner is, policies, defaults, learned choices, environment, systems, lenses (`context/README.md` gives the precedence) |
| `stages/` | What to do at each stage: `analyse.md`, `spec.md`, `build.md`, `audit.md`, `publish.md`, and `changes.md` for anything after a gate |
| `standards/` | `PRINCIPLES.md` for every app, stack rules per template, the spec pack and its IDs, security, testing, versioning |
| `audits/` | Audit prompts; spec conformance is mandatory before Gate 3 |
| `schemas/` | JSON Schemas for the Application Definition, project state, composition, catalogue entries and source records |
| `scripts/` | The deterministic tools (below) |
| `templates.json` | The template registry; the template tables are generated from it |
| `project-files/` | Files copied into new ideas and apps: the Application Definition and spec pack stubs, `NOTES.md` |

## Scripts
| Script | Does |
|---|---|
| `scaffold.py new <slug> --name "..."` | Creates `ideas/<slug>/` at the start of Analyse |
| `scaffold.py definition <slug>` | The Application Definition to fill in |
| `scaffold.py spec <slug>` | The spec pack stubs, filled from the definition |
| `check_spec.py <slug> [--definition] [--impact IDs]` | Checks the definition (Gate 1) or the whole pack (Gate 2): blockers and warnings; writes `spec/traceability.md`; also checks a pack copied outside the factory |
| `scaffold.py app <slug> <template>` | Copies a template into `ideas/<slug>/app/` with its standards, and starts its git repository |
| `status.py [--write]` | Every idea, its stage, tier, template and gates |
| `dashboard.py [--port N] [--write [path]]` | Read-only web page: how the factory works, each idea's progress, published apps, documents. `--write` makes one shareable page from the documents in `factory/web/share.json` |
| `import_source.py <file> <slug>` | A supplied document (docx, md, txt, pdf) into versioned markdown, images and source IDs in `ideas/<slug>/source/` |
| `verify.py --template <name>` | A template's checks from the registry, in clean containers |
| `publish.py <slug> [--fix] [--create] [--public]` | The publish dry run; creates a repository only on a typed confirmation |
| `check_factory.py [--fix]` | The factory agrees with itself: registry, schemas, context, ideas, catalogue, generated tables |
| `catalogue.py list / search / show / import / validate / approve / reject` | The catalogue and its safe importer (`catalogue/README.md`) |
| `scan.py` | Static secret, script, instruction and licence checks (used by publish and the importer) |


## Rules the scripts never break
- Nothing outward-facing without the owner's typed confirmation (POL-01).
- Every check runs in a clean container or a temporary copy; results are reported as run (POL-03).
- Imported material is inspected, never executed (POL-04).

The factory's own tests: `python -m pip install -r factory/requirements-dev.txt`, then `python -m pytest factory/scripts/tests`.
