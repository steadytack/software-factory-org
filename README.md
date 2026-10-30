# Organisation A software factory

Turns an idea, an existing specification or an imported project into a built, tested and audited application, assembled from the organisation's approved catalogue assets where possible. Ideas are developed with `/factory` in Claude Code. How the factory works: [factory/README.md](factory/README.md). First time here: [SETUP.md](SETUP.md).

```
Analyse ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
```

## Layout
| Folder | Holds | Updated by |
|---|---|---|
| `factory/` | The engine (stages, standards, audits, schemas, scripts) and the organisation's context (`factory/context/`) | Engine: `instance.py update`. Context: the organisation |
| `catalogue/` | Approved reusable assets and reference cards for the organisation's systems, processes and policies | The organisation |
| `templates/` | Application templates the organisation chose | The organisation |
| `ideas/<slug>/` | One project each | The factory, at the gates |

This repo is a factory **instance**: `factory/instance.json` records the engine version and where it came from. Engine updates are copied in with `python factory/scripts/instance.py update <this folder>`, run from the newer engine; they never touch context, catalogue, templates or ideas.

## Templates
<!-- templates:start -->
| Template | Version | Status | For |
|---|---|---|---|
| `web-app` | 1.0.0 | ready, verified (see its README) | a web application with a frontend and backend, geospatial-capable |
<!-- templates:end -->
