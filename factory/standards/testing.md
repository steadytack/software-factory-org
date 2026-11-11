# Testing

## What is tested
- **A test per functional requirement** (FR), at the level that proves it: unit for a rule or calculation, API or integration for behaviour across a boundary.
- **An end-to-end journey** for each user journey that crosses the UI. A journey also fails on a browser console error, an uncaught page error or a server error (5xx), unless the test names the error it expects; and each page with a UI is checked for accessibility (WCAG 2.1 A and AA, with axe), with a rule skipped only for a reason recorded as a DEC. The `web-app` template does both (`frontend/tests/e2e/fixtures.ts`).
- **Negative and edge cases** from the acceptance criteria (empty, huge, duplicate, malformed, unauthorised).
- **A contract test per integration** (INT), at tier 3 and above: the shape of what crosses it (fields, types, errors, status codes) checked against what the other side really sends or accepts, from its published schema or a recorded real exchange; a mock that only agrees with this app proves nothing. `check_spec.py` warns about an INT no TEST names.
- **Evals for an AI feature** (`ai-features.md`): an eval set against the real model with a pass threshold, beside tests that mock the model for malformed output, refusals, timeouts and injection.
- **Operations scripts have their failure paths run** (backup, restore, export, scheduled jobs): with what they depend on stopped (the database down, the target missing), each fails loudly and leaves nothing that counts as a success; an empty or partial backup must not count as fresh. A restore drill restores the newest dump the job made, as found, never one made by hand for the drill.
- **Module tests travel with the module:** a composed app runs each catalogue asset's own tests in the merged tree, as evidence the composition works.
- Tier scales the depth (`tiers.md`): tier 1 the main path; tier 2 a test per FR, the journeys and permissions, and recovery from a backup; tier 3 all of this plus concurrency, failure and load where the spec sets thresholds, and abuse cases. Security and privacy tests follow the protection level (`security.md`), whatever the tier: a spike on real data tests what protects it.

## Tests come from the spec
Code and tests written by the same author in one pass tend to agree with each other rather than with the spec: a test that copies what the code does proves nothing. So:
- **Tests first.** A story's tests are written from its acceptance criteria (Given/When/Then) and the RULE examples, before its code, and seen to fail for the right reason (`stages/build.md`). For a module that does not exist yet, first write a minimal stub (the module and the names the tests import, each raising `NotImplementedError` or returning an empty value) so the first run fails on the AC's assertion, not on the import; where a stub is not practical, accept the import error for that first run and say so in `NOTES.md`. Each test names the AC, RULE, PERM or FR it proves (`US-004-AC2` in its name or description), so tests expected and tests run can be matched by ID.
- **Expected values come from the spec**, never from running the code: a figure, message or state the spec does not give is an open question (Q), not a value to copy from the output.
- **A test is not weakened to pass.** Changing a test's expectation means the AC was wrong: a change request.
- **Independent tests at the audit** (tiers 2 and 3; `stages/audit.md`): a fresh context that has not seen the build's tests or code writes tests from the spec pack against the app's outside (its API, CLI or UI): every PERM (an allowed role and a refused one), every RULE example, and the negative and edge ACs of each Must FR. They run in the clean container like any other test; a failure is a finding, and those that pass join the suite. The verification report gives their counts separately.

## What makes a test worth keeping
A test checks behaviour through the public interface (the route, the command, the function a caller uses), so it survives a refactor that keeps the behaviour. It is not kept when it is:
- **Tautological:** the expected value is worked out the way the code works it out (`assert total(items) == sum(i.price for i in items)`), or is a snapshot of the code's own output never checked. Expected values come from the spec, an AC or a worked example (`assert total([10, 5]) == 15`).
- **Coupled to the implementation:** it mocks the app's own internal parts, tests private functions, asserts on call counts or order, or checks through a side door (querying the database instead of reading the record back through the interface). The tell: it fails after a refactor that changed no behaviour. Mock only what is outside the app.
- **Vague:** it asserts "did not crash" or "returned something" where the AC names a result.

## Where tests run
- Every check runs in a **clean container** from the template's `verify` parts in `factory/templates.json` (`factory/scripts/verify.py`), never against a running stack or database (POL-05).
- The real stack is run before the audit for anything with a server, and the result recorded.
- External services are exercised only when a test says so; otherwise they are mocked, and the report says which. Below tier 3 the app itself runs against stand-ins for the systems it integrates with (DEF-24).

## How results are reported (POL-03)
Each verification report states: the commands or suites run, the environment and versions, pass/fail/skip counts, the tests **not run** and why, static and security checks done, known failures, whether the app was started clean, and whether integrations were real or mocked. Passing tests are evidence, not proof of conformance.

It also has a **Claims and evidence** table: one row for each claim the report or its gate makes (story or epic done, bug fixed, finding fixed, checks clean, started clean), with the evidence `../stages/build.md` "Every claim needs evidence" asks for. A claim with no row is not made.

| Claim | Evidence (command, result) |
|---|---|
| US-001 done | `verify.py --parts app/verify.json`: backend 42 passed, TEST-001 and TEST-002 among them |
| F-01 fixed | The finding's check re-run: `scripts/check_secrets.py`, 0 findings |

## The factory's own tests
`python -m pytest factory/scripts/tests` (fast, no Docker). Tests marked slow need `FACTORY_SLOW=1` and Docker. `python factory/scripts/check_factory.py` checks the factory's files agree with each other.
