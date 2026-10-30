# 06 Data model

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-06 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

## Entities
| DATA | Entity | Purpose | FRs | Personal data | Retention |
|---|---|---|---|---|---|
| DATA-001 | Recipe | A saved favourite | FR-003, FR-004 | No | Until deleted |

## Fields
| Field | Entity | Type | Required | Rule |
|---|---|---|---|---|
| name | DATA-001 | text, up to 40 characters | yes | unique |
| ratio | DATA-001 | number | yes | 1 to 30 |
| coffee | DATA-001 | grams, number | yes | above 0 |

## Relationships
Not applicable: one entity.

## Ownership, flows and source of truth
The browser's storage is the source of truth; the export file is a copy.

## Retention, deletion and migration
Recipes stay until deleted; there is no migration.
