# 12 Component selection and gaps

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-12 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

## Catalogue search
2026-10-19; six approved template assets; terms: offline, single page, local storage, calculator.

## Required capabilities
| CAP | Capability | Requirements | Candidates | Selected | Decision | Rationale | Compatibility and licence | Adaptation | Evidence | Remaining work | Reuse scope |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CAP-001 | One offline page with safe local storage and file export | FR-001, FR-002, FR-003, FR-004, NFR-001 | CAT-001, CAT-002 | CAT-001 1.0.0 | reuse | Has storage and export helpers with tests; no server | Browser only; owner's own work | Replace the example content | Its 13 tests passed (catalogue evidence) | The calculator itself (EPIC-001) | project |

## Rejected candidates
CAT-002: a build step and Node for a single page.

## Known composition limitations
None: one component.
