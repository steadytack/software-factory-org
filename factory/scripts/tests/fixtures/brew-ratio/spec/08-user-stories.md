# 08 User stories

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-08 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

## Stories
| US | Role | Goal | Value | FR | Epic | Priority |
|---|---|---|---|---|---|---|
| US-001 | Brewer | Enter coffee and a ratio and see the water | I weigh the water without arithmetic | FR-001 | EPIC-001 | Must |
| US-002 | Brewer | Enter water and a ratio and see the coffee | I can brew to the size of my cup | FR-002 | EPIC-001 | Must |
| US-003 | Brewer | Save a recipe by name | I reuse it tomorrow | FR-003 | EPIC-001 | Should |
| US-004 | Brewer | Export and import my recipes | I keep them if the browser is cleared | FR-004 | EPIC-001 | Could |

## Acceptance criteria
| AC | Given | When | Then | Verification |
|---|---|---|---|---|
| US-001-AC1 | 18 g of coffee | I choose 1:16 | 288 ml is shown | TEST-001 |
| US-001-AC2 | A ratio of 0 or 40 | I enter it | No result; a message says the ratio must be 1 to 30 | TEST-001 |
| US-002-AC1 | 250 ml of water | I choose 1:15 | 16.7 g is shown | TEST-001 |
| US-003-AC1 | A recipe named "Morning" | I save it and reload the page | It is still listed | TEST-002 |
| US-003-AC2 | Storage that is blocked or full | I save | A message says it was not saved; nothing else is lost | TEST-002 |
| US-004-AC1 | Two saved recipes | I export and import the file | The same two recipes are listed | TEST-003 |
| US-004-AC2 | A malformed or hostile file | I import it | It is refused and the saved recipes are unchanged | TEST-003 |
