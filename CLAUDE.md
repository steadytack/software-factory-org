This repository is Organisation A's software factory, a standalone repository that maintains its own factory files (stages, standards, scripts, schemas and the `factory` skill) here. Develop ideas with the `factory` skill (`/factory`). A change to the factory itself is a change to this repository: record it in `CHANGELOG.md` (under `## Unreleased`, one line per change), and run `check_factory.py` and the factory's tests; `VERSION` is bumped once per batch, not per change (`factory/standards/versioning.md`).

**Factory freeze** (from 0.18.0 until three ideas have reached Gate 3, at least one on the full route): change the factory only to fix a problem a real idea ran into, and name that idea in the changelog line. Other ideas for the factory (from reading, reviews or comparisons) go in `factory/parked.md`, to be weighed when the freeze lifts.

Before any idea, read only the context its scope allows: `python factory/scripts/scopes.py context <slug>`. Every layer's `policies.md` applies, the data classes (POL-11) included: if an idea needs a class that is not allowed, stop and ask. Never copy one business's context into another business's idea.

Report checks exactly as run ("not run" where not). Commit, push and publish only when asked. If sources conflict, ask before proceeding.

Working economy (`factory/context/group/defaults.md`, DEF-18 to DEF-22): keep sessions short and one piece of work each (state is in the idea's files, not the chat); keep big output out of the conversation; send wide searches to a helper that returns a summary; batch independent steps.
