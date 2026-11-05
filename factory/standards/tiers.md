# Tiers

A tier says **how mature the build is**: what it is for, how much engineering it gets and how much specification it needs. Two other things are **decided separately**, per idea, and never follow from the tier:
- **Data:** synthetic, a sample of real records, or real data, as far as the idea's data classes allow (POL-11, with its conditions). Recorded in the spike card or the definition's `data` choice.
- **Protection:** the level (A to D, `security.md`) its data and who can reach it need. Recorded in the spike card or the definition's `protection` choice.

There is no default tier (DEF-01): it is chosen for each idea, with a reason.

| Tier | For | How it is built | Route | How it ends |
|---|---|---|---|---|
| **1 Spike** | Answering one question fast: is it feasible, does the approach or the data work | Throwaway code; the main path only | Light (`stages/light.md`): a one-page spike card | Gate 3: grow (to 2 or 3), keep, stop |
| **2 Prototype** | Letting people see it, use it and react, to shape the idea and the process | Works end to end on screen, simpler underneath: one instance, simple storage, a test per requirement and for permissions, backups so it can be recovered | Full (`dormant/spec.md`): the spec pack, with the production sections (05, 10) optional | Raised to 3 when it is to be relied on, kept, or retired |
| **3 Production app** | Being relied on | Production grade: full test suite, hardening, monitoring, backup and tested recovery, a named owner and support, a retirement plan | Full: the whole spec pack, the production sections to production depth | Changes through `stages/changes.md`; retired deliberately |

Tiers 2 and 3 were four tiers until factory 0.19.0: the exploration and business prototypes are now one **prototype** tier, and the production app is tier 3.

## Rules
- **Moving up a tier is a gate decision, never drift.** A spike grows at its Gate 3 to the tier the approver names (`pipeline.py light <slug> grow --tier 2|3 --by <approver>`). A prototype is raised by a change request (`stages/changes.md`, "Raising the tier") that returns to Gate 2. A prototype that people have come to rely on is the signal to raise it, not a reason to skip the gate.
- **Integrations follow the tier** (DEF-24): spikes and prototypes connect to stand-ins (a fake built from the other system's schema, with synthetic data, or that system's test environment); a live connection to a production system of record is tier 3.
- **A tier never lowers protection.** Every policy, and the protection level its data and users need, applies at every tier.
- **Hosted in Docker at every tier** (DEF-02).
