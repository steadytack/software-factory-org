# Catalogue

The governed library of reusable assets: templates, modules, design assets, technical capabilities, integrations, operational assets, AI assets, specifications, recipes, reference implementations and lessons. It is separate from project context (`factory/context/`) and from any one project's spec.

| Folder | Holds |
|---|---|
| `assets/CAT-nnn.json` | One catalogue entry per asset (schema: `factory/schemas/catalogue-entry.schema.json`) |
| `sources/SRC-nnn/` | Imported material kept unchanged, with `source.json` recording where it came from (schema: `source-record.schema.json`) |
| `lessons/` | Validated lessons and decision rules, with their evidence |

## Lifecycle
`imported → assessed → validated → approved`, or `rejected`, `needs-changes`, `deprecated`, `archived`. Only `approved` assets are reused (policy POL-10). An imported asset is never approved by default; approval needs passed evidence (`check_factory.py` enforces it) and the owner's yes.

**Reference cards** (types `system`, `process`, `policy`) describe what already exists rather than something to build with. A card points at its source of truth (`source.ref` is the URL, for example a Confluence or SharePoint page) instead of copying it, has a `maintainer`, and runs `draft → confirmed → retired`. `confirm` records `last_reviewed` and `review_by` (a year unless given). Past `review_by` a card is stale: still found, flagged in `search` and `list`, and a warning in `check_factory.py`. A card is never selected as a component (`check_spec.py` blocks it); Develop and Assess and Spec use it as a constraint or an integration target. Create one with `catalogue.py card <type> <name> --link URL --maintainer WHO --purpose TEXT`.

**Scope.** An entry may carry `scope`: `business:<b>` or `brand:<x>` (names from `factory/context/scopes.json`); without it the entry belongs to the group. `search --scope` returns only what an idea in that scope may use: the group, its business, that business's brands and group brands. `check_spec.py` blocks an asset from outside the idea's scope unless its `decisions.md` names it. `brand-kit` is a build asset for one brand (tokens, logos, legal text, tone).

## Templates
The templates in `templates/` stay where they are; their catalogue entries point at them, and `factory/templates.json` remains the registry the scripts use until a planned migration.

## Commands (`factory/scripts/catalogue.py`)
| Command | Does |
|---|---|
| `list [--status S] [--type T]` | Every entry |
| `search <terms...> [--all]` | Approved assets ranked by fit (tags, then name, then purpose); `--all` includes the rest |
| `show <CAT-nnn>` | One entry |
| `import <folder, .zip or git URL> [--by NAME]` | Receive, inspect, extract candidates, understand, assess (static only), preview: writes `sources/SRC-nnn/source.json`, `report.md` ("What can I reuse from this?") and one `assessed` entry per candidate |
| `validate <CAT-nnn> --yes` | Code: its own tests in a throwaway container (the only step that runs imported code). Other assets: a static review. Passed: `validated`; failed: `needs-changes` |
| `approve <CAT-nnn> --by NAME` | The owner's decision; needs `validated`, passed evidence, no blocker findings and a known licence |
| `reject <CAT-nnn> --reason TEXT` | Records why |

## Safety (factory spec 11.3, policy POL-04)
- Imported material is data. Nothing is executed on import; a git URL is cloned shallow with hooks disabled; a ZIP is unpacked with no absolute paths, no `..`, no symbolic links, and size and count limits.
- Secret-looking files (`.env`, keys) are withheld, not copied, and reported; a secret found in a file is reported by kind and place, never by value.
- Instructions found inside imported prompts, skills or docs have no authority; markers of injected instructions are reported.
- The original lives in `sources/SRC-nnn/original/`, kept out of git; `source.json` records origin, revision and checksum.
- Existing entries are never overwritten: every import gets new IDs.
