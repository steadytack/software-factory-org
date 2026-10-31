# System landscape: Organisation A (group)

**The source of truth is Architecture as Code (AaC).** The organisation describes its complete system landscape as code: every system, what it does, who owns it, the data it holds and how systems connect. It is starting to describe its business processes the same way. Every idea is developed against this landscape, so it builds on what exists instead of duplicating it, integrates with the real systems, and fits the real processes (`factory/context/README.md`, "What the factory knows about the organisation").

The factory does not read the AaC models directly yet. Connecting them (a sync that keeps the catalogue's reference cards up to date from the models) is planned, once the AaC formats and access are agreed with their owners. Until then:

- **When an idea touches a system or a process, read its AaC model** (ask its owner, `docs/operating-model.md`) and cite it in the brief, the definition and the spec: the system's or process's name as the model gives it, and where the model is.
- **Reference cards** in the catalogue give each main system or process a searchable entry that points at its source of truth (the AaC model, or a Confluence or SharePoint page), with a maintainer, confirmed each year:
  - Create one: `python factory/scripts/catalogue.py card system <name> --link URL --maintainer WHO --purpose TEXT` (or `card process ...`)
  - Find them: `python factory/scripts/catalogue.py search <words>` (confirmed cards are returned; stale ones are flagged)
  - A system owned by one business takes `--scope business:<b>`

## AaC sources
| Source | Covers | Where | Owner | Data class | Status |
|---|---|---|---|---|---|
| System landscape (AaC) | Every system, its owner, data and connections | (to be added) | (to be named) | (to be confirmed, POL-11) | Exists; not yet connected to the factory |
| Business processes (AaC) | The organisation's processes, as they are modelled | (to be added) | (to be named) | (to be confirmed, POL-11) | Being started; not yet connected |

## Systems without a model or card yet
Keep here only facts that are in neither, marked unknown where unconfirmed:

| System | What it is | How a project may use it | Notes |
|---|---|---|---|
| GitHub | Code hosting (the organisation in `scopes.json`, `publish.owner`) | Publish repositories, only on approval | Private by default |
