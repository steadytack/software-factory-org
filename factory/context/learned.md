# Learned

Appended at each gate when the approver chooses differently from a recommendation, newest last, with `python factory/scripts/learned.py add`. An entry is evidence, not a rule: the factory never turns one project's exception into a default by itself.

**Key:** the default the recommendation came from (`DEF-nn`), or a short kebab-case key for anything else (`gate1-decision`, `tier`, `template`), so the same question can be found across projects.
**Status:** `observed` (seen once), `confirmed` (the approver agreed it should change the default; then edit `defaults.md`), `superseded` (no longer true).
**Scope:** `project`, `type` (that kind of app), `brand:<x>`, `business:<b>` or `global`.

**Review:** `python factory/scripts/learned.py review` runs at every gate. The same override chosen in two or more projects, and the patterns in the ideas' `outcome.md` records (a foundation rated wrongly, effort mis-estimated, the same lesson repeated), become candidate changes on the gate page. An approver says yes or no; on yes, `learned.py mark <key> confirmed` and the default, lens or knock-out rule is edited as a change to the factory.

| Date | Project | Key | Question | Recommended | Chosen | Reason | Scope | Status |
|---|---|---|---|---|---|---|---|---|
