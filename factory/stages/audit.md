# Stage 3 (end): Audit and verification report

Prove what was built against the approved spec, honestly. Output: the audit run in `app/audits/runs/`, `ideas/<slug>/verification.md`. Ends at **Gate 3**.

## Steps
1. **Spec conformance audit** (`factory/audits/spec-conformance.md`), as written, against `spec/` (the spec is supplied; never reconstruct one). Every item gets one of the five outcomes: verified, partially verified, not verified, failed, not applicable. Include the composition check (each component and version in `composition.json` against the code) and tests expected (doc 11) against tests run.
2. Apply the findings discipline in `factory/audits/LOG_PROTOCOL.md`: verify each finding before it counts, tag it Important, Nit or Pre-existing, and answer every one (fixed, or closed with a reason). Fix failed items that the spec requires and re-run (delta only, three rounds at most, then reconsider the approach with the owner) until none remain, or record each one left with the owner's decision. Open Important findings block Gate 3.
3. **Other audits** (`factory/audits/README.md`): refactor and hardening is recommended at tier 3 and above and before publishing anything public; UI polish after UI work; data integrity when the data matters. Offer them at the gate; run when asked.
4. **Verification report** (`verification.md`, `factory/standards/testing.md`): commands and suites run; environment and versions; pass/fail/skip counts; tests **not run** and why; static and security checks; known failures and defects; conformance gaps; manual checks still needed; whether the app started clean; whether integrations were exercised or mocked; the recommended next action. Passing tests are evidence, not proof. Update `state.json` `last_verification`.
5. **Lessons and reuse:** candidate reusable assets and lessons from this build (factory spec 9.6). Each goes through the catalogue's validation and approval later; none becomes trusted by being proposed. Learned choices go into `learned.md`.
6. Write `gates/gate-3.md`, set `state.json`, stop.

## Gate 3 shows
**Done:** what was built and how to run it. **Results exactly as run** (each run or not run). **Audit:** the confirmed-Important count first ("0 findings" if none); counts by outcome; failed and not-verified items first; findings not confirmed and pre-existing ones listed separately; rounds taken. **Recommended:** readiness, and whether to run more audits. **Decisions for you:** deferred items, accepted limitations, reuse candidates. **Risks.** **Next:** Publish.
