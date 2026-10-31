# Stage 3: Build

Build the approved spec in increments on the selected template and assets. Output: `ideas/<slug>/app/`. Then the audit (`audit.md`) and **Gate 3**.

## Before you start
Gate 2 is approved. Read the whole pack, `composition.json`, `decisions.md`, `factory/standards/PRINCIPLES.md`, the stack standards and `factory/standards/testing.md` (and `factory/standards/ai-features.md` when the app calls a model).

## Steps
1. **Scaffold:** `python factory/scripts/scaffold.py app <slug> <template>` (copies the template, adds `NOTES.md`, `STANDARDS.md`, `standards/PRINCIPLES.md` and `standards/ai-features.md`, starts the app's own repository). Composition across templates is applied as `composition.json` says, within what the factory has proven; anything unproven is built as its own component folder and stated as a limitation.
2. **Safe beside everything else** (POL-05, POL-06): read `factory/context/environment.md`, check `docker ps` and listening ports live, then set a unique Compose project name, ports on `127.0.0.1` and fresh generated secrets in the app's git-ignored `.env` (never printed). Rename the product. Simple apps (no server) skip Docker entirely.
3. **Baseline:** the template's own checks (`python factory/scripts/verify.py --template <t> --path ideas/<slug>/app`) pass before any change. Record the result.
4. **Example code:** a template's example domain is not part of the spec. Remove it where practical; where it is woven through, hide it and record the deviation in `decisions.md` and spec `09`.
5. **Build epic by epic** in the order of `11-delivery-plan.md`. For each story, **tests first** (`factory/standards/testing.md`, "Tests come from the spec"): write the tests its ACs name, from the AC's Given/When/Then and the RULE examples, before the code; run them and see each fail for the reason the AC gives (not an import error), and record that in `NOTES.md`. Then the code, until they pass; then the checks in a clean container. A test is never changed to make it pass: if the AC was wrong, that is a change request (`changes.md`). A story is done only when its tests passed in this session. Keep `state.json` `current` on the epic and story. (A spike: its main path test is written first from the plan's success criterion.)
6. **Milestone gates.** Each epic (or milestone) ends at a short gate: `gates/gate-3-<epic>.md` with what it delivered, results exactly as run (each run or not run), changes to the plan, and the next epic. A one-epic app has one gate.
7. **Real stack** (anything with a server): build the images, start the stack, exercise the journeys against it with real services where the spec says so; check health and that anonymous access is refused; screenshots of any UI (desktop and phone), looked at.
8. **Changes** to the approved spec go through `changes.md` (a change request), never silently.
9. **Stop and report** when a blocker cannot be resolved safely, or after the same failure three times without a new approach (POL-08).

Then run the audit (`audit.md`).
