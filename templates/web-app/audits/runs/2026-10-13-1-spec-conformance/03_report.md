# 03 Report: Spec conformance, web-app (run 2026-10-13-1)

Scope: `templates/web-app` only. No spec was supplied, so a 39-item spec was reconstructed from README, CLAUDE.md, code and tests (`01_spec_reconstructed.md`); it is inferred, not authoritative.

## Summary
| Status | Count |
|---|---|
| WORKING | 31 |
| PARTIAL | 4 (SPEC-22, 34, 36, 39) |
| SCAFFOLDED | 1 (SPEC-18) |
| BROKEN | 2 (SPEC-26, 38) |
| UNVERIFIABLE | 0 as items; SMTP delivery and backup restore noted inside items |

Headline: 31 of 39 (79%) fully working, 36 of 39 (92%) working or partial, with every core data, auth and security path exercised against a live stack. Out-of-spec additions are mostly valuable and tested.

## Highest-risk items
1. **SPEC-38 (H)**: `backend/tests/test_features.py` has a SyntaxError on `main` (introduced in commit cc23244, the HEIC/generic-type change). The whole backend suite cannot be collected, so CI would fail. With the line fixed in a copy, 252 backend tests pass.
2. **SPEC-26 (H)**: `app.reconcile` and `GET /api/admin/storage-reconciliation` treat photo thumbnails as orphan files (55 of 57 reported orphans were thumbnails). `python -m app.reconcile --delete` would delete valid thumbnails. I did not run `--delete`.
3. **SPEC-18 (M)**: notifications have storage and endpoints but nothing creates them. Probably by design (scheduler docstring), but the UI will always show none.

## Open questions
- Is SPEC-18 meant to ship with a default producer (for example a survey-due sweep), or stay a hook?
- Should `DESIGN_TOKENS.md` / `COMPONENT_CATALOGUE.md` be copied into web-app (README step 5)?

## Remediation sequence (dependency order)
1. Fix `test_features.py` (replace the literal line breaks with `b"a,b\n1,2\n"`). Effort S. Unblocks everything below.
2. Fix reconcile: treat `<stored_path>.thumb.jpg` as referenced; add a regression test with a thumbnail. Effort S.
3. Point `generate:types` at this stack's API port (or make it an env var). Effort S.
4. Decide SPEC-18; if a producer is wanted, add a scheduler job calling `notify()` plus a test. Effort M.
5. Low priority: stop logging emails, consider `nginx-unprivileged`, copy the shared docs, add a restore test for backups. Effort S each.

## Progress entry
2026-10-13: Prompt 1 audit of web-app done. 31/39 working; 2 broken (backend test file syntax error, reconcile counts thumbnails as orphans); notifications have no producer. Nothing fixed yet, awaiting approval of the sequence above.

## Method notes
Dynamic checks ran against the preview stack and throwaway containers (`audit-pg`, `audit-single`, `audit-prod`, `audit-weak`); the repo was not modified. Preview-only conditions: COOKIE_SECURE=false, seeding enabled.
