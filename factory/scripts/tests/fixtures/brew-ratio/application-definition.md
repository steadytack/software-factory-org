```json definition
{
  "schema_version": 1,
  "slug": "brew-ratio",
  "name": "Brew ratio",
  "version": "1.0",
  "status": "approved",
  "maturity_tier": {"value": 2, "state": "accepted", "default": "DEF-01", "reason": "used repeatedly by one person"},
  "deployment": {"value": "simple", "state": "accepted", "default": "DEF-02", "reason": "no server needed: one page, data kept in the browser"},
  "interfaces": {"value": ["web", "mobile"], "state": "accepted", "reason": "used at the kitchen counter on a phone"},
  "brand": {"value": "unbranded", "state": "accepted", "default": "DEF-09"},
  "design_system": {"value": "the template's built-in styles", "state": "accepted", "default": "DEF-09"},
  "interaction_style": {"value": "a single form with a live result", "state": "accepted"},
  "template": {"value": "single-page-html", "state": "accepted", "reason": "one page, no server; runner-up static-site is heavier and needs a build"},
  "lenses": {
    "active": ["business-value", "users-and-workflows", "data-and-integrations", "ux-and-accessibility"],
    "skipped": [
      {"lens": "architecture", "reason": "one page, no server"},
      {"lens": "security", "reason": "no accounts, no server, nothing sensitive; imported files are covered by SEC-001"},
      {"lens": "operations", "reason": "nothing to run or back up beyond the export"},
      {"lens": "cost-and-maintainability", "reason": "no outside services"}
    ]
  },
  "candidate_assets": [
    {"id": "CAT-001", "fit": "a single offline page with safe local storage and file export", "limitations": "no shared data"},
    {"id": "CAT-002", "fit": "would work as a one-page site", "limitations": "needs a build step and Node for a single page"}
  ],
  "sources": [{"kind": "idea", "ref": "idea-brief.md"}],
  "approvals": [{"gate": 2, "date": "2026-10-19", "reply": "test fixture, not a real approval", "version": "1.0"}]
}
```

# Brew ratio: Application Definition

The solution choices. The problem, outcome, users and success measures are in `idea-brief.md`.

## Maturity tier
Tier 2: used repeatedly by one person; tests for the main behaviour.

## Deployment and runtime
Simple: one HTML file opened in a browser. No Docker. Developed with Node 24 for the tests only.

## Interfaces and design
Web, used on a phone. Unbranded, the template's styles, one form with a live result.

## Data, identity, integrations and security needs
Recipes in the browser's storage; nothing personal. No login, no outside systems. Imported files are untrusted.

## Operations and support
Not applicable: nothing runs; the export is the backup.

## Template and candidate catalogue assets
`single-page-html` (CAT-001). Runner-up `static-site` (CAT-002).

## Lenses
See the definition block.

## Decisions and overrides
None.
