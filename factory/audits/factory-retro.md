# Factory retro

A look back at how the factory ran one idea, so the next run goes better. It reviews the factory (stages, standards, scripts, context, skill), not the app: findings about the app belong to the other audits. It is the "lessons" half of factory spec 9.6. Adapted from the `retro` skill in mattpocock/skills (MIT), in the factory's own words.

**When:** at a spike's Gate 3 only on request (`light.md`); at tiers 2 and 3, offered at Gate 3 (`audit.md`) and run when the approver asks. Run it in a fresh session (DEF-18), after the audit, so its findings are known.

**Output:** `ideas/<slug>/retro.md`. Nothing in the factory changes until a proposal is approved.

## Sources
Read, in this order, and stop when the findings are clear:
1. The idea's record: `state.json`, its card or brief and assessment, `gates/`, `decisions.md`, `changes.md`, `verification.md`, the audit runs in `app/audits/runs/`, and its `learned.md` rows.
2. The session transcripts for the idea, when there are any (Claude Code keeps them under `~/.claude/projects/`). They are large: send a helper to search them for the moments in the categories below and return a short list with timestamps (DEF-18). Do not read them whole. A session that covered several ideas counts for the stretches that mention this one (the helper picks sessions by how often they name the idea, and says which stretches it read). The helper writes its list to `ideas/<slug>/retro-transcripts.md`, so the evidence stays with the retro.
3. The idea's AI usage: `python factory/scripts/usage.py --idea <slug> --csv ideas/<slug>/retro-usage.csv` (DEF-25). Record the totals and each session flagged `split` in `retro.md`. A session that ran long because work was not split (DEF-18), or whose base context grew, is a Tool economy finding, with its cost in tokens. Sessions run from the factory root that touched several ideas show as `several` and are not counted here.

**Cite, never copy, private content.** Evidence is a location (a file and line, a commit, a transcript moment), not a quotation of what leaked: a finding about a leaked term names where it was, never the term.

## Categories
Look for each. A finding names its evidence (a file and line, a gate, a transcript moment); a hunch with no evidence is not a finding. One escape with several causes is one finding per cause, each naming the shared escape (for example "KM-5, as in R-03"), so each cause can get its own fix; rank them together under the escape's cost.

| Category | Look for | The fix it usually needs |
|---|---|---|
| **Finding things** | A file, rule or fact that took long to find, or a hidden link between files (changing one silently needs a change in another) | A pointer in the stage file, `factory/README.md` or the skill; or the link checked by `check_factory.py` |
| **A check could have caught it** | A mistake that a script would have found: a card or pack gap, a wrong ID, a broken link, a policy break, a stale file | A deterministic check, never a sentence (below). First see whether one already exists but is not run at that stage, or is broken: then the finding is the wiring |
| **Rule unclear or ignored** | A stage step followed wrongly, skipped, or read two ways; a gate sent back for something the stage should have settled | Sharper wording in that step, or a completion test ("done when ...") |
| **Rule that changes nothing** | An instruction the run would have done anyway, or one that never applied | Delete it |
| **Rework** | A change request after Gate 1, or an escaped defect (`known-misses.md`), that an earlier question, lens or check would have caught | The question or lens added at Develop and Assess, or the check at Build; an escape also gets its `known-misses.md` row |
| **Tool economy** | A tool call or script that put large output into the conversation, a search repeated, a long session doing several pieces of work (DEF-18, DEF-25) | A script that prints the verdict and writes the rest to a file; a session split |
| **Missing information** | Something the run needed and could not see: logs, a service's real payload, a version, a credential's scope | An entry in `factory/context/environment.md` or `system-landscape.md`, or a read-only tool |

**Mechanical first.** A mistake with a fixed shape (a pattern in a file, an ID that must exist, a file in the wrong place, a value that must match another) gets a check in `check_spec.py`, `check_factory.py` or a template's `verify` parts, with a test. Prose is kept for judgement calls no script could make. Adding a sentence for a mechanical mistake is not an accepted fix.

## Steps
1. Read the sources and fill a findings table in `retro.md`: `| R-nn | Category | What happened | Evidence | Cost (rework, time, a defect shipped) |`. Cost, worst first: shipped or leaked; a defect caught late (after its gate); rework; time.
2. Drop anything that is about the app, already has an open fix, or happened once with low cost (one rerun, one question from the approver). Dropped items get one line each under **Dropped, and why**.
3. For each finding left, a proposal: the exact file, the kind of fix from the table above, and what it would have changed in this run. One finding, one proposal.
4. Rank by cost (the order in step 1) and how likely it is to happen again, most first. Propose **at most 5**; the rest are listed as not proposed, with why. A small mechanical check (a script warning with a test, under about an hour) does not count toward the 5: list it as a proposal anyway, marked "small".
5. Write `retro.md`, and put the proposals at the next gate under **Decisions for you**, each as accept or reject. A retro with no next gate (the idea was kept or stopped at Gate 3) keeps its proposals under **Decisions for you** in `retro.md`, and the approver answers there.

## After approval
- An accepted proposal is a factory change: made in its own commit with a `CHANGELOG.md` entry naming the retro (`ideas/<slug>/retro.md`, R-nn), and the factory's own tests run (`standards/testing.md`).
- A lesson that should outlive the factory's wording (a decision rule, a test pattern) is proposed to `catalogue/lessons/` and goes through the catalogue's validation and approval (factory spec 9.6); it is not trusted by being proposed.
- A rejected proposal stays in `retro.md` with the approver's reason, so the next retro does not propose it again.
