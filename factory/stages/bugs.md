# A bug in a built app

A bug is the app doing something other than what its approved spec says (for a spike, its card, `spike.md`). The spec stands and the code is fixed, so nothing is re-approved. When the spec is wrong or says nothing, it is not a bug: it is a change request (`changes.md`). Fix a bug in a session of its own (DEF-18): `/factory resume <slug>` with the report.

```
Assess ─(a bug)→ ISS recorded → a failing test → the fix → the delta checks → the verdict
       └(a spec gap)→ changes.md    └(not reproduced, or elsewhere)→ ISS left open with its owner
```

## Steps
1. **Assess.** Read the report, `state.json`, `NOTES.md` and the spec items it touches. Reproduce it against the app: in the clean container (`verify.py`), or against a stack this run started when it needs one (POL-05). Then decide what it is:
   - **A bug:** an AC, RULE, PERM, NFR, SEC or INT says what should happen and the app does something else. Name the IDs.
   - **A spec gap:** the spec says nothing, is wrong, or the fix would change what it says. That is a change request (`changes.md`), and this route stops here.
   - **Not reproduced:** record what was tried and ask the reporter one question. The bug stays open.
   - **Elsewhere:** an outside system that does not behave as documented, data that is not what the brief said, the environment. That is an issue with its owner, not a code fix.
2. **Record it** as an issue `ISS-nnn` in spec `09` (a spike: in `decisions.md`): what was reported, by whom and when, the IDs it breaks, what it blocks (none, build, release), the owner, status `open`. A bug in a published app that blocks `release` is told to the owner at once, not at the next gate.
3. **Test first** (`testing.md`, "Tests come from the spec"): write a test that reproduces the bug and names what it proves (`US-004-AC2`, `ISS-007`). Run it and see it fail for the reason reported, not a nearby one; then cut inputs, data, config and steps one at a time until removing anything more makes it pass. Where a test cannot reach it yet, another check that fails on the bug comes first (an HTTP request against the stack, the CLI with a fixture diffed against known-good output, a replayed captured request, `git bisect run`), made fast and repeatable (fix the clock, seed the randomness). With no check at all, stop and say what is needed; do not guess a cause. The expected value comes from the spec, never from the code. Where no automated test can reach it, record the manual steps that reproduce it and say why in `NOTES.md`.
4. **Fix** at the cause. List three to five likely causes, each with what it predicts, and test one prediction per probe (debug logs carry one unique prefix, `[DEBUG-a4f2]`, so all can be removed). Before editing, search every caller of what the fix touches, and fix the shared code once, not the one caller that showed it. Make the smallest change that makes the test pass; remove the debug logs and throwaway harnesses, and state the cause in the commit message. No other test is changed to make it pass. An existing test that now fails is either a second bug or two parts of the spec that disagree: a Q and a change request, not an edit to the test.
5. **Check the delta.** Run `python factory/scripts/check_spec.py <slug> --impact <IDs>` to list what else rests on the broken IDs. Re-run their tests and the app's checks in the clean container. For a PERM or SEC, also re-run the independent permission tests and any hardening checks that apply.
6. **Verdict**, in the ISS row and under "Bug fixes" in `verification.md`, with results exactly as run (POL-03):
   - **verified:** the reproduction test failed before the fix and passes after it, and the delta checks pass. The ISS is `closed`.
   - **partially verified:** fixed for the case reported, but something named is left (a related case, a check not run). The ISS stays `open` with its next action.
   - **failed:** not fixed. Say what was learned and the next approach. The ISS stays `open`. Stop after three failures without a new approach (POL-08).
7. **Lessons.** Say which planned test (doc 11) or independent test should have caught it. If the spec's tests could not have caught it, add a lesson with `learned.py add`, naming the standard or stack rule it would change. None is a valid answer.
8. **Release.** A fix to an app that is not yet published is shown at its next gate. A published app gets the fix only through the commit and push the owner approves (POL-01): show a short report first, with the ISS, the IDs it broke, the test, the diff in summary, the verdict and the results as run.

A run of bugs against the same requirements, or one bug whose fix touches the architecture, is a sign the spec or the design is wrong. Raise it as a change request (`changes.md`) rather than patching one bug at a time.
