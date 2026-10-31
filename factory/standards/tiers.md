# Tiers

A tier says **how mature the build is**: what it is for and how much engineering it gets. It does not say how much protection it needs: that follows the data and who can reach it, at every tier (`security.md`, the protection baseline). A tier 3 business prototype used by real staff has a proper login and protects its data like any app; it just does not have production-grade resilience.

| Tier | For | Users and data | How it is built | Route | How it ends |
|---|---|---|---|---|---|
| **1 Spike** | Answering one question fast: is it feasible, does the approach work | The builder; synthetic or public data only | Throwaway code; the main path only | Light (`stages/light.md`): a plan, no spec pack | Gate 3: grow (to 2, 3 or 4), keep, stop |
| **2 Exploration prototype** | Letting people see it and react, to shape the idea | A few people giving feedback; synthetic or public data only | Looks and behaves like the real thing on screen, faked behind it where that is quicker; light tests | Light: a plan, no spec pack | Gate 3: grow (to 3 or 4), keep, stop |
| **3 Business prototype** | Refining the idea and the process by using it for real work | Real users; real data within its allowed classes (POL-11) | Works end to end like a production system, simpler underneath: one instance, simple storage, main-path and permission tests, backups so it can be recovered (not resilient) | Full, with a proportionate spec pack (`specification-pack.md`) | A change request to tier 4 when it is to be relied on, or retired |
| **4 Production app** | Being relied on | Whoever it is for | Production grade: full test suite, hardening, monitoring, backup and tested recovery, a named owner and support, a retirement plan | Full, the whole spec pack | Changes through `stages/changes.md`; retired deliberately |

## Rules
- **Moving up a tier is a gate decision, never drift.** Tiers 1 and 2 grow at their Gate 3 (`pipeline.py light ... grow --tier N`). Tier 3 becomes tier 4 by a change request (`stages/changes.md`) that lists what tier 4 adds (tests, hardening, resilience, monitoring, support, a retirement plan) and returns to Gate 2. A business prototype that people have come to rely on is the signal to raise one, not a reason to skip it.
- **Real data starts at tier 3.** Tiers 1 and 2 use synthetic or public data only, whatever the idea will need later.
- **Protection is not lowered by a tier.** Every policy, and the protection baseline in `security.md`, applies at every tier.
- **Hosted in Docker at every tier** (DEF-02), so a build runs the same way from a spike to production.
- The default for the full route is tier 3 (DEF-01): most ideas are refined in real use before they are relied on.
