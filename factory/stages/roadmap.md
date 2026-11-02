# The roadmap route: a project or programme

Some ideas are too big for one spec and one build: several releases or apps working toward one outcome, several teams or systems, or a change to a major system. The factory still develops them, but as a **roadmap**: the overall plan of how the idea builds out over time, epic by epic. Its open questions are epics too: **spikes**, early in the plan, each answering one question before the epics that depend on it start. Gate 1 approves the roadmap as the direction, not the whole investment; each epic then goes through the factory as an idea of its own, with its own Gate 1.

```
Develop and Assess (brief, assessment, roadmap.md) ─gate 1 (the direction)→ the roadmap
     └─ each epic, when its turn comes: pipeline.py epic → Develop and Assess ─gate 1→ a spike (light.md) │ a build (the full route) │ a project outside the factory
```

## When
Set `scale` in the assessment while assessing (`develop-assess.md`, step 3):

| Scale | When | Goes ahead as |
|---|---|---|
| `app` (or absent) | One app or release that one build can deliver | The full route or a spike |
| `project` | Several releases or apps toward one outcome, or more than one team or system to change | Its roadmap |
| `programme` | Several projects, or a change to a major or core system (a scheduling engine with a dozen integrations, say) | Its roadmap |

When unsure, ask in the question round: the owner knows whether it is one thing or several. A large idea is never squeezed into one build, and never held back for being large.

## The roadmap (before Gate 1)
`python factory/scripts/scaffold.py roadmap <slug>` writes `roadmap.md`; fill it in from the brief and the assessment:
- **The end state:** what it does and for whom when fully built out, and the success measures it delivers.
- **How it builds out:** the phases over time, in order, each with what it delivers, its epics and the decision point at its end. No dates unless the owner has them.
- **Epics:** the table. Each epic is a **spike** (one question, tier 1, the light route), a **build** (a release through the full route at tier 2, 3 or 4) or a **project** (delivered outside the factory, by a project with IT: a live integration to a production system of record (DEF-24), technology with no approved template, or data the policy does not allow here). Each says what it answers or delivers, its tier, the epics it depends on (which must finish first) and the decision after it.
- **The spikes come first:** every amber, and the one thing, is a question a spike epic early in the plan answers, with the builds that depend on it after. The spike's success and kill criteria are written in its own `plan.md` when it starts.
- **Starts now**, **Outside the factory** and **Risks to the roadmap.**

The assessment rates the whole idea (RICE for the end state, Effort for the whole roadmap, rough); each epic gets its own assessment when it starts. `check_spec.py <slug> --assessment` checks the roadmap: every section, no placeholder, at least two epics, valid kinds, dependencies only on earlier epics, at least one spike or build that can start, and a warning when ambers have no spike epic.

## Gate 1: the direction
As for any idea (`develop-assess.md`, Gate 1), with the roadmap beside the overview. **Recommended:** Go on the roadmap, Get Ready or Stop. A Go approves the direction and the epics in Starts now; it does not approve the builds, which each come back to their own Gate 1. Record it with `pipeline.py decide <slug> go --by <approver> --reply "..."` (the route is `roadmap`; the full and light routes are refused for a project or programme). The idea moves to stage `roadmap`; it does not count against the work-in-progress limit (DEF-23): its epics do, as they go ahead.

## Running the roadmap
1. **Start an epic:** `python factory/scripts/pipeline.py epic <slug> E<n> [<epic-slug>] [--owner "<name>"]`. It captures the epic as an idea linked to the roadmap (`parent`, `epic` in its `state.json` and the register) and opens it at Develop and Assess. It refuses a project epic, an epic already started, and one whose dependencies have not finished their Gate 3 or have stopped.
2. **Develop and assess it** like any idea, briefly: its brief cites the parent's brief for what does not change and says what this epic adds. A spike epic is recommended Go as a spike with its `plan.md`; a build epic goes the full route at its tier.
3. **After each epic's Gate 3,** update `roadmap.md` with what it showed: what the next epics now are, any epic added, dropped or reordered, and any change to the end state. Record each change in the parent's `decisions.md`. A change to the end state, or a new build or project epic, is a numbered decision at the next epic's Gate 1 for the approver to sign off.
4. **A project epic** is tracked in the roadmap, not built: say who delivers it and record its progress in `roadmap.md`.
5. **Close the roadmap** when its last epic finishes, or stop it at any decision point: record it in the parent's `decisions.md` and set its `state.json` to `done` or `stopped`, with the reason.

`ideas/pipeline.md` lists each roadmap's epics, with the idea each became and where it is.
