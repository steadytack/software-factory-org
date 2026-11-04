# Organisation A software factory

Turns an idea, an existing specification or an imported project into a built, tested and audited application, assembled from the organisation's approved catalogue assets where possible. Ideas are developed with `/factory` in Claude Code. Most start as a spike: a small, time-boxed working version, then grow, keep or stop. Every idea, spec and app is built with the same guardrails, approach, policies, defaults and organisational context, from an approved list of technology, and all of it is improved over time as content in this repository.

- **Have an idea?** [docs/for-staff.md](docs/for-staff.md): what to send and what happens next.
- **Leading or sponsoring it?** [docs/overview-for-leaders.md](docs/overview-for-leaders.md), the factory on one page; and [docs/the-factory/](docs/the-factory/README.md), the factory assessed by its own first stage (brief, assessment, sponsor overview).
- **A technical or AI leader?** [docs/for-technical-leaders.md](docs/for-technical-leaders.md): how it works, the controls and its known limits.
- **Running it?** [docs/operating-model.md](docs/operating-model.md) (who does what), [factory/README.md](factory/README.md) (how it works), [SETUP.md](SETUP.md) (first time here).
- **A word you don't know?** [docs/glossary.md](docs/glossary.md).

The routes through the factory (a spike, the full route, a project or programme) and its tiers are drawn in [factory/README.md](factory/README.md).

## Layout
| Folder | Holds | Updated by |
|---|---|---|
| `factory/` | The engine (stages, standards, audits, schemas, scripts) and the organisation's context (`factory/context/`) | The organisation |
| `catalogue/` | Approved reusable assets and reference cards for the organisation's systems, processes and policies | The organisation |
| `templates/` | Application templates the organisation chose | The organisation |
| `ideas/<slug>/` | One project each | The factory, at the gates |
| `docs/` | Plain-language guides: for staff, for leaders, for technical leaders, the operating model, the glossary | The organisation |

This repo is standalone: it began from version 0.2.1 of the factory on 2026-10-30, and its factory files are now maintained here, like any other code in the repository.

## Templates
<!-- templates:start -->
| Template | Version | Status | For |
|---|---|---|---|
| `web-app` | 1.2.0 | ready, verified (see its README) | a web application with a frontend and backend, geospatial-capable |
<!-- templates:end -->
