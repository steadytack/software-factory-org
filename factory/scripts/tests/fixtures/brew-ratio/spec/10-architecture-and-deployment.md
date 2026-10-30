# 10 Architecture and deployment

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-10 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

Deployment category: simple

## Components
| CMP | Component | Role | Built from | Runtime |
|---|---|---|---|---|
| CMP-001 | Calculator page | The whole app | CAT-001 1.0.0 | Browser |

## Integrations
Not applicable: no outside systems and one component.

## Technology and rationale
The template's plain HTML, CSS and JavaScript; Node 24 runs the unit tests only.

## Environments and configuration
Developed and run the same way: open `index.html`. No configuration.

## Running it
Open the file in a browser. The export file is the backup. Docker is not used (factory spec 7.1).
