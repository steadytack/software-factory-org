# Learned

Appended at each gate when the approver chooses differently from a recommendation, newest last, with `python factory/scripts/learned.py add`; and whenever the owner clarifies something, at any stage, that could apply beyond the idea, with `python factory/scripts/learned.py clarify`. An idea reads only the rows its scope allows: `python factory/scripts/learned.py recall <slug>`. An entry is evidence, not a rule: the factory never turns one project's exception into a default by itself.

**Key:** the default the recommendation came from (`DEF-nn`), a short kebab-case key for anything else (`gate1-decision`, `tier`, `template`), or `clarify-<topic>` for a clarification (Recommended is what the factory had assumed, or `none`; Chosen is the owner's answer), so the same question can be found across projects.
**Status:** `observed` (seen once), `confirmed` (the approver agreed it should change the default; then edit `defaults.md`), `superseded` (no longer true).
**Scope:** `project`, `type` or `type:<kind>` (that kind of app, for example `type:field-app`), `brand:<x>`, `business:<b>` or `global`.

**Review:** `python factory/scripts/learned.py review` runs at every gate. A clarification scoped beyond its project (once is enough), the same override chosen in two or more projects, and the patterns in the ideas' `outcome.md` records (a foundation rated wrongly, effort mis-estimated, the same lesson repeated), become candidate changes on the gate page. An approver says yes or no; on yes, `learned.py mark <key> confirmed` and the default, lens or knock-out rule is edited as a change to the factory.

| Date | Project | Key | Question | Recommended | Chosen | Reason | Scope | Status |
|---|---|---|---|---|---|---|---|---|
| 2026-11-01 | plan-cost-calculator | rice-impact | Gate 1 decision 2: is a scheduler decision pending and dependent on this (sets Impact)? | A: yes, Impact 1 | B: not yet, keep Impact 0.5 | Owner did not confirm a pending scheduler decision | project | observed |
