# Setting up Organisation A's factory

Work through this list once, in order. Each step is done when `python factory/scripts/check_factory.py` stops reporting it. Commit when it is clean (nothing here is pushed until you choose to).

1. **Name the organisation and its GitHub organisation.** In `factory/context/scopes.json`, replace every `{{...}}`: the group approver (their `git config user.name`), the GitHub organisation apps are published under (`publish.owner`) and the legal entity that holds copyright. Keep `visibility` private unless the organisation says otherwise.
2. **Set the data classes.** In `factory/context/group/policies.md`, answer every row of the data-classes table (POL-11): which classes may be used in the factory, and on what conditions. Rename or add classes to match the organisation's own classification.
3. **Paste the general context file** into `factory/context/group/business-context.md`, and fill in the hosting and approved services in `group/defaults.md` (DEF-02, DEF-11).
4. **Add the businesses and brands** to `scopes.json` (format: `factory/context/README.md`). Give each its folder when it has context of its own: `factory/context/businesses/<b>/`, `factory/context/brands/<x>/brand.md`. A business or brand without its own approvers uses the group's.
5. **Create one reference card per main system** (and per key process or policy): `python factory/scripts/catalogue.py card system <name> --link URL --maintainer WHO --purpose TEXT`, then `catalogue.py confirm <id>` once its maintainer has checked it.
6. **People.** Each person adds themselves to `factory/context/group/team.md` and copies `factory/context/environment.example.md` to `factory/context/environment.md` (git-ignored).
7. **Run** `python factory/scripts/check_factory.py`. It should print `check_factory: OK`.

Then try one small idea: `/factory <idea>` in Claude Code.
