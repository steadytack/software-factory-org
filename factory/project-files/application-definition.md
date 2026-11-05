```json definition
{
  "schema_version": 1,
  "slug": "{slug}",
  "name": "{name}",
  "version": "0.1",
  "status": "draft",
  "maturity_tier": {"value": 3, "state": "unresolved", "reason": "<2 (a prototype) or 3 (a production app), and why: there is no default>"},
  "data": {"value": "synthetic", "state": "unresolved", "reason": "<synthetic, sample or real, and why; within the data classes POL-11 allows>"},
  "protection": {"value": "B", "state": "unresolved", "reason": "<A to D, from the data and who can reach it>"},
  "deployment": {"value": "hosted", "state": "recommended", "default": "DEF-02", "reason": "<why>", "development": "<if it differs>"},
  "interfaces": {"value": ["web"], "state": "recommended", "reason": "<why>"},
  "brand": {"value": "unbranded", "state": "recommended", "default": "DEF-09"},
  "design_system": {"value": "<catalogue design asset or the template's design file>", "state": "recommended", "default": "DEF-09"},
  "interaction_style": {"value": "<forms, tables, dashboard, map, timeline, chat...>", "state": "recommended"},
  "template": {"value": "<template name, or none>", "state": "recommended", "reason": "<why; the runner-up>"},
  "lenses": {"active": ["business-value", "users-and-workflows"], "skipped": []},
  "candidate_assets": [],
  "sources": [{"kind": "idea", "ref": "idea-brief.md"}],
  "approvals": []
}
```

# {name}: Application Definition

The solution choices, made at the start of Spec and approved with the spec at Gate 2. The block above is the machine-readable record (checked against `factory/schemas/application-definition.schema.json`). Each choice is `recommended`, `accepted`, `rejected`, `deferred` or `unresolved`; `default` names the DEF-nn it came from. The problem, outcome, users and success measures are in `idea-brief.md` and are not repeated here.

## Tier, data and protection
<The tier (2 Prototype, 3 Production app) and why (`factory/standards/tiers.md`). Separately: the data it is built and run with (synthetic, a sample of real records, or real; its classes and any POL-11 conditions), and the protection level that data and its users need (`factory/standards/security.md`).>

## Deployment and runtime
<Category, why, and the development environment if it differs.>

## Interfaces and design
<Interface types; brand, design system and interaction style (visual direction is inferred from these).>

## Data, identity, integrations and security needs
<What is stored and how sensitive it is (the data classes from the assessment); who logs in; outside systems; what could go wrong.>

## Operations and support
<How it is run, updated and backed up; who notices when it breaks. Or "Not applicable: reason".>

## Template and candidate catalogue assets
<The recommended template (or none fits), the runner-up, and what each candidate asset would contribute; the initial composition hypothesis.>

## Lenses
<Which lenses were used and why; each skipped lens with its reason.>

## Decisions and overrides
<Answers that differ from a recommendation (also in `learned.md`).>
