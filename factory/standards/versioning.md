# Versioning

| Thing | Where the version lives | Scheme |
|---|---|---|
| The factory | `VERSION`, `CHANGELOG.md` | Semantic: major for a change that needs existing ideas migrated, minor for new capability, patch for fixes |
| A template | `factory/templates.json` (`version`), its own `CHANGELOG.md` if it has one | Semantic |
| A catalogue asset | Its entry in `catalogue/assets/` (`version`, plus source revision or checksum) | Semantic, or the source's own version when imported |
| A schema | Its `$id` and `version` in `factory/schemas/` | Integer, bumped on any breaking change; scripts accept the current and previous version |
| An Application Definition | Front matter `version` | `0.1`, `0.2`... before Gate 1; `1.0` when approved; a change request bumps it |
| A spec document | Its metadata header | Same as above, per document; the pack index records the set |
| A composition | `composition.json` (`schema_version`, asset versions) | Recorded, never inferred |
| A built app | Its own repository and tags | Owner's choice; the factory records the commit at each gate |

Each idea's `state.json` records the factory version it was last run under, so an older idea can be migrated deliberately rather than silently.

IDs inside a spec are never reused when an item is deleted or superseded (see `requirement-ids.md`).
