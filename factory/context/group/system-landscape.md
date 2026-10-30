# System landscape: Organisation A (group)

The organisation's systems, processes and policies are described by **reference cards** in the catalogue, one per main system, rather than in this file. A card points at its source of truth (a Confluence or SharePoint page, say), names a maintainer and is confirmed each year.

- Create one: `python factory/scripts/catalogue.py card system <name> --link URL --maintainer WHO --purpose TEXT`
- Find them: `python factory/scripts/catalogue.py search <words>` (confirmed cards are returned; stale ones are flagged)
- A system owned by one business takes `--scope business:<b>`

Keep here only facts that have no card yet, marked unknown where unconfirmed:

| System | What it is | How a project may use it | Notes |
|---|---|---|---|
| GitHub | Code hosting (the organisation in `scopes.json`, `publish.owner`) | Publish repositories, only on approval | Private by default |
