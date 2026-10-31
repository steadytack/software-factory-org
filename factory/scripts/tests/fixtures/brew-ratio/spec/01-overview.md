# 01 Overview

| Doc | Version | Status | Updated | Baseline |
|---|---|---|---|---|
| SPEC-01 | 0.1 | draft | 2026-10-19 | application-definition 1.0 |

A single web page that works out coffee and water for a brew from a ratio, in either direction, and keeps favourite recipes in the browser. For one person at the kitchen counter, on a phone.

- Calculate water from coffee (FR-001) and coffee from water (FR-002), by RULE-001.
- Save recipes (FR-003); export and import them (FR-004).

Success: OBJ-001. Tier 3; simple deployment, one HTML file, no server. Built on the `single-page-html` template (CAT-001, see 12). Main risk: the browser clears its storage (RISK-001). One epic (EPIC-001). Next: Gate 2.

## Glossary
| Term | Meaning |
|---|---|
| Ratio | Grams of water per gram of coffee, written 1:16 |
