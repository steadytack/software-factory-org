# Changes after a gate

A change to something already approved is a controlled edit, not a restart (factory spec 14.5).

1. **Record it** in the project's `changes.md` and in spec `09` (Change requests): `CR-nnn` (never reused), the change, the reason, the affected IDs, the impact, whether approval is needed, the outcome.
2. **Find what it touches:** `python factory/scripts/check_spec.py <slug> --impact FR-007[,US-003]` lists the linked items (stories and criteria, rules, screens, data, permissions, integrations, capabilities, epics, tests) and the documents to review. A new version of an imported source: `import_source.py` keeps the old version; compare the two and treat each difference as a change.
3. **Edit** the affected documents (after Gate 2, also the code and tests; after Build, also `composition.json` and the verification). Bump the versions in each document's metadata and the pack README's history.
4. **Re-check:** `check_spec.py` has no blockers; tests for any code touched are run.
5. **Delta gate** when the change materially affects scope, risk, cost or release commitments: show only what changed (the CR, the impact list, the edits, the check result, decisions needed). Earlier gates stay approved unless the owner says `back to <stage>`. Small changes inside the approved scope are logged and shown at the next gate.

## Which gate a change returns to
- Problem, outcome, value, data, risk or ownership (the brief, a foundation rating, RICE or the decision): Gate 1, as a delta: a light re-assessment of what changed (the assessment's version is bumped), never a restart.
- Solution choices (tier, deployment, interfaces, design, template), requirements, composition, plan: Gate 2, as a delta (the definition's or the pack's version is bumped); with code, the impact names the code and tests to revisit.
- Build-only: covered by the next milestone gate.
- Factory changes (a template, a policy, a stage): recorded in `CHANGELOG.md`; each affected idea gets a CR.

## Interruptions and versions
An interrupted stage sets `state.json` `status: interrupted` and `next` says what is done and what is left. Each idea records the `factory_version` it last ran under; when it resumes under a newer one, read the changelog since then, tell the owner what differs, and update the version once the idea meets the new rules.

## Raising the tier
A tier 3 business prototype becomes a tier 4 production app only by a change request, never by drift (`factory/standards/tiers.md`). The request lists what tier 4 adds (the full test suite, hardening, resilience and tested recovery, monitoring, a named owner and support, a retirement plan), fills in the spec documents the business prototype kept short, and returns to Gate 2. When people have come to rely on a business prototype, raise it.
