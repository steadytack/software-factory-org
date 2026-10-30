# 03 Functional requirements

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-03 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

## Requirements
| FR | Requirement | Journey | Priority | Verification | Source |
|---|---|---|---|---|---|
| FR-001 | Given grams of coffee and a ratio, show the millilitres of water | JRN-001 | Must | TEST-001 | idea.md |
| FR-002 | Given millilitres of water and a ratio, show the grams of coffee | JRN-001 | Must | TEST-001 | idea.md |
| FR-003 | Save a named recipe (ratio and coffee) that is still there after a reload | JRN-002 | Should | TEST-002 | idea.md |
| FR-004 | Export saved recipes to a file and import them again | JRN-002 | Could | TEST-003 | idea.md |

## Business rules
| RULE | Rule | FR | Example | Edge cases |
|---|---|---|---|---|
| RULE-001 | water = coffee × ratio, rounded to whole ml; coffee = water ÷ ratio, rounded to 0.1 g | FR-001, FR-002 | 18 g at 1:16 is 288 ml; 250 ml at 1:15 is 16.7 g | Ratio outside 1 to 30, or an empty or negative amount: no result and a message |

## Workflows and states
Not applicable: one form, no states beyond the result.

## Errors and edge cases
Covered by RULE-001 and the acceptance criteria of US-003 and US-004.

## Import, export and background behaviour
Export writes a JSON file; import validates it before replacing anything (US-004).
