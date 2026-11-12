# Setting up Organisation A's factory

## A developer joining
The factory is plain files (Markdown, JSON schemas) and Python scripts, driven by Claude Code. Every app it builds comes from a template in `templates/`.

**You need:** Python 3.12 or later, git, Docker (for the template checks and running apps), Node 20 or later (for the web-app frontend; CI uses 20), and Claude Code with access to this repository.

**First run:**
```bash
git clone <this repository> && cd software-factory-org
python -m pip install -r factory/requirements-dev.txt
python factory/scripts/check_factory.py        # the factory's files agree: prints check_factory: OK
python -m pytest factory/scripts/tests         # the factory's own tests, no Docker
python factory/scripts/verify.py --template web-app   # the template's checks in clean containers (Docker)
```
Then copy `factory/context/environment.example.md` to `factory/context/environment.md` (git-ignored) and fill it in, and add yourself to `factory/context/group/team.md`.

**Where to read next:** `CLAUDE.md` (the rules every session follows), `factory/README.md` (how the factory works and who does what), `factory/standards/PRINCIPLES.md` (how code is written) and `templates/web-app/README.md` (the template).

**Changing the factory:**
- Each change is a line under `## Unreleased` in `CHANGELOG.md`.
- `check_factory.py` and the tests must pass before you commit; CI (`.github/workflows/`) runs them again on every push.
- A change to the web-app template also runs `verify.py --template web-app`, and a new template version needs its evidence row in `catalogue/assets/CAT-006.json`.
- Ideas for the factory that you are not building now go in `factory/parked.md`.

**Trying it:** in Claude Code at the repository root, `/factory <an idea in plain words>`; `python factory/scripts/status.py` shows where the ideas are.

## Setting up the organisation (once)
Work through this list once, in order. Each step is done when `python factory/scripts/check_factory.py` stops reporting it. Commit when it is clean (nothing here is pushed until you choose to).

1. **Name the organisation and its GitHub organisation.** In `factory/context/scopes.json`, replace every `{{...}}`: the group approver (their `git config user.name`), the GitHub organisation apps are published under (`publish.owner`) and the legal entity that holds copyright. Keep `visibility` private unless the organisation says otherwise.
2. **Set the data classes.** In `factory/context/group/policies.md`, answer every row of the data-classes table (POL-11): which classes may be used in the factory, and on what conditions. Rename or add classes to match the organisation's own classification.
3. **Bring in the business context** by scope: the sections that hold across the group into `factory/context/group/business-context.md`, each business's into its own file (step 4), with its data class on a line near the top, after checking POL-11 allows it. Then fill in the hosting and approved services in `group/defaults.md` (DEF-02, DEF-11).
4. **Add the businesses and brands** to `scopes.json` (format: `factory/context/README.md`). Give each its folder when it has context of its own: `factory/context/businesses/<b>/`, `factory/context/brands/<x>/brand.md`. A business or brand without its own approvers uses the group's.
5. **List the Architecture as Code sources** (the system landscape and the process models) in `factory/context/group/system-landscape.md`, with where each lives, its owner and its data class. Then **create one reference card per main system** (and per key process or policy), pointing at its model where it has one: `python factory/scripts/catalogue.py card system <name> --link URL --maintainer WHO --purpose TEXT`, then `catalogue.py confirm <id>` once its maintainer has checked it.
6. **People.** Name the roles in `factory/README.md` ("Who does what"), and list the operators in `scopes.json` (`group.operators`: the work-in-progress limit, DEF-23, is per operator). Each person adds themselves to `factory/context/group/team.md` and copies `factory/context/environment.example.md` to `factory/context/environment.md` (git-ignored).
7. **Run** `python factory/scripts/check_factory.py`. It should print `check_factory: OK`.

Then try one small idea: `/factory <idea>` in Claude Code.
