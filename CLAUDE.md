This repository is Organisation A's software factory, a standalone repository that maintains its own factory files (stages, standards, scripts, schemas and the `factory` skill) here. Develop ideas with the `factory` skill (`/factory`). A change to the factory itself is a change to this repository: record it in `CHANGELOG.md` (under `## Unreleased`, one line per change), and run `check_factory.py` and the factory's tests; `VERSION` is bumped once per batch, not per change (`factory/standards/versioning.md`).

**Factory freeze lifted** (0.20.0, by the owner, 2026-11-11), to bring across work proven in the personal `software-factory` repository; the freeze ran from 0.18.0. Removing, merging or shortening is still always welcome. Ideas for the factory that are not being built now go in `factory/parked.md`.

Before any idea, read only the context its scope allows: `python factory/scripts/scopes.py context <slug>`. Every layer's `policies.md` applies, the data classes (POL-11) included: if an idea needs a class that is not allowed, stop and ask. Never copy one business's context into another business's idea.

Report checks exactly as run ("not run" where not). Commit, push and publish only when asked. If sources conflict, ask before proceeding.

Working economy (`factory/context/group/defaults.md`, DEF-18): keep sessions short and one piece of work each (state is in the idea's files, not the chat); keep big output out of the conversation; send wide searches to a helper that returns a summary; batch independent steps.
