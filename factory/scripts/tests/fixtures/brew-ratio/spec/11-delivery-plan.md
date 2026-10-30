# 11 Delivery plan

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-11 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

One epic: the app is small enough to build and verify as one unit.

## Epics
| EPIC | Epic | Outcome | FRs | Stories | Components | Release | Depends on |
|---|---|---|---|---|---|---|---|
| EPIC-001 | Brew calculator | The whole app, offline | FR-001, FR-002, FR-003, FR-004 | US-001, US-002, US-003, US-004 | CMP-001 | 1 | none |

## Tests
| TEST | Test | Level | Verifies | Where |
|---|---|---|---|---|
| TEST-001 | The ratio rule both ways, and its limits | unit | RULE-001, US-001-AC1, US-001-AC2, US-002-AC1 | tests/ratio.test.mjs |
| TEST-002 | Saving survives a reload; blocked storage reports failure | unit | US-003-AC1, US-003-AC2 | tests/storage.test.mjs |
| TEST-003 | Export and import round trip; a hostile file is refused | unit | US-004-AC1, US-004-AC2, SEC-001 | tests/storage.test.mjs |
| TEST-004 | Every FR with the network off | manual | NFR-001 | browser, offline mode |
| TEST-005 | Keyboard-only run through every FR | manual | NFR-002 | browser |

## Definition of Done
Code with the tests its ACs name, passing in a clean container (`verify.py`); the manual checks done and recorded.

## Release acceptance
EPIC-001 done; the spec conformance audit has no failed items.
