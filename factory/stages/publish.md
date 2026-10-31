# Stage 4: Publish

Prepare a release and perform it only on explicit, typed confirmation (POL-01). Output: `ideas/<slug>/publish-report.md`. Ends at **Gate 4**. Hosting is parked; the destination is GitHub.

## Steps
1. Gate 3 is approved (a kept spike: `plan.md` goes with the app in place of the spec; `factory/stages/light.md`). If the repository will be public and the hardening audit has not run, recommend it first.
2. **Dry run:** `python factory/scripts/publish.py <slug>`. It creates nothing and pushes nothing; it copies `spec/` into `app/docs/spec/` (the one change it makes, and it says so) and writes `publish-report.md`: secrets in the tree and history, `.gitignore`, licence, README, CI, machine paths, personal emails, template leftovers, a clean tree, the spec check, an SBOM at protection C and D, and spec items marked to settle before publishing.
3. Fix every blocker (`--fix` adds the MIT licence) and re-run until there are none. Warnings go to the gate to be fixed or accepted.
4. `gates/gate-4.md` shows: what will happen, the destination (`owner/slug`), **visibility** (private by default, DEF-14), the files affected, whether it is reversible, cost or exposure implications, the dry-run result, unresolved blockers, the release summary (changes, verification results, known limitations, outstanding risks).
5. **Only on an explicit approve at this gate:** `python factory/scripts/publish.py <slug> --create` (add `--public` only if approved as public). The owner types the repository name, and for public also the word "public". A previous approval never carries over.
6. Report the actual result: the URL if `gh` confirms it, or the failure exactly as reported. `publish.py` records a confirmed repository in `state.json` as `app: {repo, url}`, which the status page links to. Then `state.json` to `done`, and the release in `decisions.md`.
7. **Benefits review:** `python factory/scripts/learned.py benefits <slug>` writes `benefits.md`, with the 30- and 90-day reviews due from today. Say at the gate's report when they fall due.

## The benefits review (30 and 90 days after)
Did the app deliver what Gate 1 expected, now that people use it? On or after a review's due date (`ideas/pipeline.md` lists them, and flags one overdue), in its own session (DEF-18): ask the owner for the numbers, at most one question round; fill in that review in `benefits.md`: each success measure from the brief and doc 02 with its target and what was measured, the reach per period actually seen (0 is a real answer), whether the impact held, whether it is used as the to-be process expects, the date, and the lessons (as in `outcome.md`). `python factory/scripts/learned.py check <slug> --review 30|90` must pass. Show a short page: the measures met and missed, reach against the estimate, and any candidate change from `learned.py review`. A measure missed is not a failure to hide: it may lead to a change request (`changes.md`), retiring the app, or a lesson for the next assessment.

A possible secret found by the scan stops everything: say what and where (never the value), and recommend rotating it if it was ever committed.
