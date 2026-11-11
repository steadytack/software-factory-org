# Dormant

Parts of the factory that no idea has used yet. They are set aside here, not deleted, so the active factory stays small: the `/factory` skill does not load them, and the guides do not describe them. Their scripts, schemas, stubs and tests still work and are still tested.

| File | What it is | Brought back when |
|---|---|---|
| `spec.md` | Spec: the Application Definition and the spec pack (the full route, tiers 2 and 3) | An idea is approved for the full route, or a spike grows |
| `specification-pack.md` | The spec pack's documents and their rules | With `spec.md` |
| `publish.md` | Publish: the dry run, the repository, the 30- and 90-day benefits reviews | An idea passes Gate 3 with keep, or a full-route build passes it |
| `roadmap.md` | The roadmap route: a project or programme built out epic by epic | An idea is a project or programme |

The catalogue importer (`catalogue.py import`) is dormant too: the catalogue has one asset, the `web-app` template. Its rules stay in `catalogue/README.md`.

## Waiting in the personal `software-factory` repository
When the factory's work was brought across (0.20.0 to 0.22.0), these improvements to Spec and Publish were left behind, because those parts are dormant here. When Spec or Publish comes back, read the commit in that repository (`git show <sha>`) and port it by hand, leaving out anything about its ideas.

| Improvement | Source commit | Comes back with |
|---|---|---|
| The glossary is checked, and every journey must reach the to-be | `2add614` | Spec |
| Change proposals with deltas merged into the pack (`sync_change.py`), and `check_spec.py --analyze` | `7dbe001` | Spec |
| Wider `--impact` (shared data or integration, every-screen NFRs); delta audits re-verify it | `9d90737` | Spec |
| `check_spec.py --audit`: Verified needs the real input (the rule itself is in `spec-conformance.md` already) | `9281867` | Spec |
| The app's copy of the spec keeps up | `1c3d701` | Spec and Publish |
| No publishing past a change request the last conformance run does not cover | `8824d37` | Publish |
| Private terms never published: `publish.py` checks the tree and the history | `e9f51c8` | Publish |

To bring one back: move it to where it was (`factory/stages/` or `factory/standards/`), point the skill and `factory/README.md` at it again, and record it in `CHANGELOG.md` with the idea that needed it.
