# Organisation A software factory

Turns an idea, an existing specification or an imported project into a built, tested and audited application, assembled from the organisation's approved catalogue assets where possible. Ideas are developed with `/factory` in Claude Code. How the factory works: [factory/README.md](factory/README.md). First time here: [SETUP.md](SETUP.md).

```
Develop and Assess ─gate 1→ Spec ─gate 2→ Build and Audit ─gate 3→ Publish ─gate 4→ done
                   └─ a spike, tier 1 (plan.md) ─→ Build ─gate 3→ grow (to Spec at tier 2, 3 or 4) │ keep │ stop

Tiers (factory/standards/tiers.md): 1 Spike · 2 Exploration prototype · 3 Business prototype · 4 Production app.
Data and protection are decided separately, per idea.
```

## Layout
| Folder | Holds | Updated by |
|---|---|---|
| `factory/` | The engine (stages, standards, audits, schemas, scripts) and the organisation's context (`factory/context/`) | The organisation |
| `catalogue/` | Approved reusable assets and reference cards for the organisation's systems, processes and policies | The organisation |
| `templates/` | Application templates the organisation chose | The organisation |
| `ideas/<slug>/` | One project each | The factory, at the gates |

This repo is standalone: it began from version 0.2.1 of the factory on 2026-10-30, and its factory files are now maintained here, like any other code in the repository.

## Templates
<!-- templates:start -->
| Template | Version | Status | For |
|---|---|---|---|
| `web-app` | 1.1.0 | ready, verified (see its README) | a web application with a frontend and backend, geospatial-capable |
<!-- templates:end -->
