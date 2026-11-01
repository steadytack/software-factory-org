# Tiers

A tier says **how mature the build is**: what it is for, how much engineering it gets and how much of the spec pack it needs. Two other things are **decided separately**, per idea, and never follow from the tier:
- **Data:** what it is built and run with: synthetic, a sample of real records, or real data. Any tier may use real data the idea's data classes allow (POL-11, with its conditions): a spike can test against a small real sample. Recorded in the spike's `plan.md` or the definition's `data` choice.
- **Protection:** the level (A to D, `security.md`) its data and who can reach it need. A spike on a real Internal sample is protected for Internal data; a business prototype with real staff has a proper login. Recorded in `plan.md` or the definition's `protection` choice.

There is no default tier (DEF-01): it is chosen for each idea, with a reason.

| Tier | For | How it is built | Route and spec | How it ends |
|---|---|---|---|---|
| **1 Spike** | Answering one question fast: is it feasible, does the approach or the data work | Throwaway code; the main path only | Light (`stages/light.md`): a one-page plan, no spec pack | Gate 3: grow (to 2, 3 or 4), keep, stop |
| **2 Exploration prototype** | Letting people see it and react, to shape the idea | Looks and behaves like the real thing on screen; faked behind it where that is quicker; light tests | Full: the spec pack, with a section `Not applicable: reason` only where it makes no sense for a prototype | Raised to 3 or 4, kept, or retired |
| **3 Business prototype** | Refining the idea and the process by using it for real work | Works end to end like a production system, simpler underneath: one instance, simple storage, a test per requirement and for permissions, backups so it can be recovered (not resilient) | Full: the whole spec pack | Raised to 4 when it is to be relied on, or retired |
| **4 Production app** | Being relied on | Production grade: full test suite, hardening, monitoring, backup and tested recovery, a named owner and support, a retirement plan | Full: the whole spec pack, with the production sections (05, 10) to production depth | Changes through `stages/changes.md`; retired deliberately |

## Rules
- **Moving up a tier is a gate decision, never drift.** A spike grows at its Gate 3 to the tier the owner names (`pipeline.py light <slug> grow --tier 2|3|4`). A tier 2 or 3 app is raised by a change request (`stages/changes.md`, "Raising the tier") that lists what the higher tier adds and returns to Gate 2. A prototype that people have come to rely on is the signal to raise one, not a reason to skip it.
- **Integrations follow the tier** (DEF-24): tiers 1 to 3 connect to stand-ins (a fake built from the other system's schema, with synthetic data, or that system's test environment); a live connection to a production system of record is tier 4.
- **A tier never lowers protection.** Every policy, and the protection level its data and users need, applies at every tier.
- **Hosted in Docker at every tier** (DEF-02), so a build runs the same way from a spike to production.
