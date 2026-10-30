# 09 Assumptions, risks and decisions

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-09 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

## Assumptions
| ASM | Assumption | If wrong | Status | Owner | Blocks |
|---|---|---|---|---|---|
| ASM-001 | The phone's browser keeps local storage between visits | Recipes vanish; the export (FR-004) is the fallback | open | owner | none |

## Open questions
None.

## Risks
| RISK | Risk | Likelihood | Impact | Mitigation | Status | Owner | Blocks |
|---|---|---|---|---|---|---|---|
| RISK-001 | The browser clears its storage | Low | Medium | Export (FR-004) | accepted | owner | none |

## Dependencies
None.

## Decisions
| DEC | Decision | Rationale | Rejected alternatives | Date | Decided by |
|---|---|---|---|---|---|
| DEC-001 | Build on `single-page-html` | One page, no server, offline by design | `static-site`: needs a build for one page | 2026-10-19 | owner at Gate 1 |

## Change requests
None.
