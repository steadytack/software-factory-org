# Dormant

Parts of the factory that no idea has used yet. They are set aside here, not deleted, so the active factory stays small: the `/factory` skill does not load them, and the guides do not describe them. Their scripts, schemas, stubs and tests still work and are still tested.

| File | What it is | Brought back when |
|---|---|---|
| `spec.md` | Spec: the Application Definition and the spec pack (the full route, tiers 2 and 3) | An idea is approved for the full route, or a spike grows |
| `specification-pack.md` | The spec pack's documents and their rules | With `spec.md` |
| `publish.md` | Publish: the dry run, the repository, the 30- and 90-day benefits reviews | An idea passes Gate 3 with keep, or a full-route build passes it |
| `roadmap.md` | The roadmap route: a project or programme built out epic by epic | An idea is a project or programme |

The catalogue importer (`catalogue.py import`) is dormant too: the catalogue has one asset, the `web-app` template. Its rules stay in `catalogue/README.md`.

To bring one back: move it to where it was (`factory/stages/` or `factory/standards/`), point the skill and `factory/README.md` at it again, and record it in `CHANGELOG.md` with the idea that needed it.
