```json definition
{
  "schema_version": 1,
  "slug": "{slug}",
  "name": "{name}",
  "version": "0.1",
  "status": "draft",
  "maturity_tier": {"value": 2, "state": "recommended", "default": "DEF-01", "reason": "<why>"},
  "deployment": {"value": "local", "state": "recommended", "default": "DEF-02", "reason": "<why>", "development": "<if it differs>"},
  "interfaces": {"value": ["web"], "state": "recommended", "reason": "<why>"},
  "brand": {"value": "unbranded", "state": "recommended", "default": "DEF-09"},
  "design_system": {"value": "<catalogue design asset or the template's design file>", "state": "recommended", "default": "DEF-09"},
  "interaction_style": {"value": "<forms, tables, dashboard, map, timeline, chat...>", "state": "recommended"},
  "template": {"value": "<template name, or none>", "state": "recommended", "reason": "<why; the runner-up>"},
  "lenses": {"active": ["business-value", "users-and-workflows"], "skipped": []},
  "candidate_assets": [],
  "sources": [{"kind": "idea", "ref": "idea.md"}],
  "approvals": []
}
```

# {name}: Application Definition

The block above is the machine-readable record (checked against `factory/schemas/application-definition.schema.json`). Each choice is `recommended`, `accepted`, `rejected`, `deferred` or `unresolved`; `default` names the DEF-nn it came from.

## Problem and outcome
<Who has the problem, what it costs them now, the one-sentence real problem (not the proposed solution), and the outcome that would show it is solved.>

## Users and main workflows
<Who, how often, on what device; the three to five things they do.>

## Scope
**In:** <first release.> **Out:** <explicitly not included.>

## Success measures
<How the owner will know it works.>

## Maturity tier
<Recommended tier and why; what it means for testing, security and documentation (`factory/standards/security.md`).>

## Deployment and runtime
<Category, why, and the development environment if it differs.>

## Interfaces and design
<Interface types; brand, design system and interaction style (visual direction is inferred from these).>

## Data, identity, integrations and security needs
<What is stored and how sensitive it is; who logs in; outside systems; what could go wrong.>

## Operations and support
<How it is run, updated and backed up; who notices when it breaks. Or "Not applicable: reason".>

## Template and candidate catalogue assets
<The recommended template (or none fits), the runner-up, and what each candidate asset would contribute; the initial composition hypothesis.>

## Lenses
<Which lenses were used and why; each skipped lens with its reason.>

## Assumptions, risks and open questions
<Each as ASM, RISK or Q (carried into spec 09), with what would change if wrong.>

## Decisions and overrides
<Answers that differ from a recommendation (also in `learned.md`).>
