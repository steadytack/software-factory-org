# Testing

## What is tested
- **A test per functional requirement** (FR), at the level that proves it: unit for a rule or calculation, API or integration for behaviour across a boundary.
- **An end-to-end journey** for each user journey that crosses the UI.
- **Negative and edge cases** from the acceptance criteria (empty, huge, duplicate, malformed, unauthorised).
- **Module tests travel with the module:** a composed app runs each catalogue asset's own tests in the merged tree, as evidence the composition works.
- Tier scales the depth (`tiers.md`): tier 1 the main path; tier 2 the main path and what the people trying it will do; tier 3 a test per FR, the journeys and permissions, and recovery from a backup; tier 4 all of this plus concurrency, failure and load where the spec sets thresholds, and abuse cases. Security and privacy tests follow the protection level (`security.md`), whatever the tier.

## Where tests run
- Every check runs in a **clean container** from the template's `verify` parts in `factory/templates.json` (`factory/scripts/verify.py`), never against a running stack or database (POL-05).
- The real stack is run before the audit for anything with a server, and the result recorded.
- External services are exercised only when a test says so; otherwise they are mocked, and the report says which.

## How results are reported (POL-03)
Each verification report states: the commands or suites run, the environment and versions, pass/fail/skip counts, the tests **not run** and why, static and security checks done, known failures, whether the app was started clean, and whether integrations were real or mocked. Passing tests are evidence, not proof of conformance.

## The factory's own tests
`python -m pytest factory/scripts/tests` (fast, no Docker). Tests marked slow need `FACTORY_SLOW=1` and Docker. `python factory/scripts/check_factory.py` checks the factory's files agree with each other.
