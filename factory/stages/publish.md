# Stage 4: Publish

Prepare a release and perform it only on explicit, typed confirmation (POL-01). Output: `ideas/<slug>/publish-report.md`. Ends at **Gate 4**. Hosting is parked; the destination is GitHub.

## Steps
1. Gate 3 is approved (a kept spike: `spike.md` goes with the app in place of the spec; `factory/stages/spike.md`). If the repository will be public and the hardening audit has not run, recommend it first.
2. **Dry run:** `python factory/scripts/publish.py <slug>`. It creates nothing and pushes nothing; it copies `spec/` into `app/docs/spec/` (the one change it makes, and it says so) and writes `publish-report.md`: secrets in the tree and history, `.gitignore`, licence, README, CI, machine paths, personal emails, template leftovers, a clean tree, the spec check, and spec items marked to settle before publishing.
3. Fix every blocker (`--fix` adds the MIT licence) and re-run until there are none. Warnings go to the gate to be fixed or accepted.
4. `gates/gate-4.md` shows: what will happen, the destination (`owner/slug`), **visibility** (private by default, DEF-14), the files affected, whether it is reversible, cost or exposure implications, the dry-run result, unresolved blockers, the release summary (changes, verification results, known limitations, outstanding risks).
5. **Only on an explicit approve at this gate:** `python factory/scripts/publish.py <slug> --create` (add `--public` only if approved as public). The owner types the repository name, and for public also the word "public". A previous approval never carries over.
6. Report the actual result: the URL if `gh` confirms it, or the failure exactly as reported. `publish.py` records a confirmed repository in `state.json` as `app: {repo, url}`, which the status page links to. Then `state.json` to `done`, and the release in `decisions.md`.

A possible secret found by the scan stops everything: say what and where (never the value), and recommend rotating it if it was ever committed.
