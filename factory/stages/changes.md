# Changes after a gate

A change to something already approved is a controlled edit, not a restart (factory spec 14.5). When the app does not do what the approved spec says, that is a bug, not a change: `bugs.md`.

1. **Record it** in the project's `changes.md` and in spec `09` (Change requests): `CR-nnn` (never reused), the change, the reason, the affected IDs, the impact, whether approval is needed, the outcome.
2. **Find what it touches:** `python factory/scripts/check_spec.py <slug> --impact FR-007[,US-003]` lists the linked items (stories and criteria, rules, screens, data, permissions, integrations, capabilities, epics, tests) and the documents to review. A new version of an imported source: `import_source.py` keeps the old version; compare the two and treat each difference as a change.
3. **Edit** the affected documents (after Gate 2, also the code and tests; after Build, also `composition.json` and the verification). Bump the versions in each document's metadata and the pack README's history.
4. **Re-check:** `check_spec.py` has no blockers; tests for any code touched are run. An app that runs as a stack (anything with a server) is then rebuilt and restarted (`docker compose up -d --build`, or the app README's own command); `python factory/scripts/status.py --stack <slug>` prints "stack current", and the changed screen, figure or behaviour is looked at on that running stack before the owner is told it is done or asked to look: passing tests do not change what the running build shows. After a push of an app with its own repository (`state.json` `app.repo`), `python factory/scripts/status.py --ci` shows its CI; a red run is fixed before anything is called done.
5. **Delta gate** when the change materially affects scope, risk, cost or release commitments: show only what changed (the CR, the impact list, the edits, the check result, decisions needed). Earlier gates stay approved unless the owner says `back to <stage>`. Small changes inside the approved scope are logged and shown at the next gate. A change that touched a screen offers the UI polish audit (`factory/audits/ui-polish.md`) at that gate; it runs when the owner asks.

## Which gate a change returns to
- Problem, outcome, value, data, risk or ownership (the brief, a foundation rating, RICE or the decision): Gate 1, as a delta: a light re-assessment of what changed (the assessment's version is bumped), never a restart.
- Solution choices (tier, deployment, interfaces, design, template), requirements, composition, plan: Gate 2, as a delta (the definition's or the pack's version is bumped); with code, the impact names the code and tests to revisit.
- Build-only: covered by the next milestone gate.
- Factory changes (a template, a policy, a stage): recorded in `CHANGELOG.md`; each affected idea gets a CR.

## Interruptions and versions
An interrupted stage sets `state.json` `status: interrupted` and `next` says what is done and what is left. Each idea records the `factory_version` it last ran under; when it resumes under a newer one, read the changelog since then, tell the owner what differs, and update the version once the idea meets the new rules.

## Raising the tier
A tier 2 or 3 app moves up only by a change request, never by drift (`factory/standards/tiers.md`). The request lists what the higher tier adds (for 3: end-to-end behaviour for real work, a test per requirement and for permissions, recovery from backup, and the pack sections a prototype marked not applicable; for 4: the full test suite, hardening, resilience and tested recovery, monitoring, a named owner and support, a retirement plan), revisits the `data` and `protection` choices, and returns to Gate 2. When people have come to rely on a prototype, raise it.
