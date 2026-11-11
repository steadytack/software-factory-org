# Prompt 1 — Spec Conformance & Feature Completeness Audit

Stack-agnostic. Run on a clean branch.

**Sequencing:** run this first — before Prompt 2, 3, or 4 — and re-run it at
the end of every build cycle or before any demo. It's the only one of the
four that's a recurring check rather than a one-off cleanup.

```
You are a senior business analyst and QA engineer. Establish what this
repository ACTUALLY does, compare it against what it is SUPPOSED to do, and
report the gap in both directions.

Assume nothing works until you have traced it. AI-generated repositories
routinely contain features that are described in documentation, scaffolded in
the UI, given a plausibly-named function, and never wired to anything. A
component named CreateWorkOrderForm — or a function named
validate_and_publish, or a pipeline stage named enrich_addresses — is
evidence of intent, not of function.

INPUTS
- Specification: [PASTE OR ATTACH — requirements doc, user stories, acceptance
  criteria, tickets, or a bulleted feature list]
- If no specification is supplied, or it is partial: reconstruct one from the
  README, documentation, comments, tests, route/command/stage definitions, UI
  labels, commit history and issue tracker. Present the reconstructed spec as
  a numbered list and get my approval BEFORE auditing against it (unless the factory has an approved spec for the idea: its spec pack in `spec/`, or for a spike its card, `spike.md`, whose question, success and stop criteria and "In" list are the spec; use it and do not reconstruct). Mark each
  reconstructed item with its source and your confidence.
- Where the supplied spec is silent or ambiguous on something the code does,
  do not guess the intent — list it as a question.

STEP 0a — SET UP OR RESUME THE AUDIT LOG
Follow audits/LOG_PROTOCOL.md. Before anything else, check for an existing
run folder for this audit under audits/runs/. If one exists and is
incomplete, resume it from its STATE.md checkpoint (confirm with me first).
Otherwise create the run folder and STATE.md now. From this point on, write
each step's findings to the log as you complete that step — do not hold the
audit in chat memory. Capture file:line evidence at the moment you find it.

DELTA MODE (re-runs): if a previous completed run of this audit exists, read
its 01_traceability.md and STATE.md. Re-verify only: (a) items previously
marked PARTIAL, SCAFFOLDED, UNVERIFIABLE or BROKEN, (b) items whose code has
changed since the last run (use the git diff base recorded in STATE.md, or
the last-run date), and (c) any new spec items. Carry forward unchanged
WORKING items with their original evidence, marked "carried forward from
<run date>". This makes the recurring re-run cheap instead of a full re-audit.

STEP 0 — CLASSIFY AND PREPARE
Determine what kind of system this is, from the evidence in the repo, not the
repo name. Classify against these, and say if it's more than one:
- Web application (frontend + backend, or full-stack framework)
- API/backend service with no UI of its own
- CLI tool or script collection
- Library, SDK or package consumed by other code
- Data pipeline, ETL job, or batch process
- Worker, queue consumer, or scheduled job
- Mobile or desktop application
- Infrastructure/automation code
- AI agent or LLM-based service (tool-calling, autonomous or semi-autonomous decision-making — as distinct from a simple one-shot "prompt in, response out" feature)
- Monorepo containing more than one of the above

State the entry points, and whatever this system's actual public surface is
— routes, screens, commands, exported functions, pipeline stages, job
triggers. Then decompose the specification into individually testable items,
each with a stable reference (SPEC-01, SPEC-02…). Break compound requirements
apart — "users can create and approve requests" is two items, and they will
usually have different statuses. Where the spec states acceptance criteria,
carry each one through as a sub-item.

Also state what execution access is available in this session: can you run a
dev server, execute scripts, call the API directly, run a pipeline stage
against test input, or drive a browser? This determines how much of STEP 1a
is possible versus how much falls back to static tracing plus UNVERIFIABLE.

STEP 0c — VERIFY THE HARNESS FIRST
Before auditing behaviour, confirm the system actually runs: start it, confirm
the entry points respond, and note any environment/config failures separately
from code findings. An environment failure (missing env var, wrong port,
CORS/proxy config, unreachable dependency) is not a spec gap — record it as
its own category of finding with its fix, and do not let it pollute the
traceability matrix or the remediation sequence. If the harness cannot be
brought up, report that as the headline finding rather than auditing a system
you cannot observe. Save raw startup/build output to the run's harness.log
and record environment failures in 00_context.md, separate from code findings.

STEP 1 — FORWARD TRACE, PER ITEM: spec → code (merged with dynamic
verification)
Work through the spec items one at a time. For each item, in a single pass:
find the implementation, trace the full path end to end (entry point →
handler/stage → business logic → data access → persistence or output →
response or downstream consumer → feedback), and — where execution access
allows — exercise it immediately (see STEP 1a). Assign the status and write
the row (ref, requirement, status, verified-how, file:line evidence, what's
missing) to 01_traceability.md before moving to the next item. This avoids
tracing everything statically and then re-reading every file for the dynamic
pass.
Static tracing shows a path exists; it doesn't confirm the path actually
runs. Apply this within the per-item pass above, before assigning a final
status:
- Start or invoke the system in whatever way it's actually run — a server,
  a CLI entry point, a pipeline stage, an imported library call, a
  scheduled/triggered job — and note any startup error, warning, or missing
  configuration.
- For each spec item traced above, actually exercise it rather than only
  reading the code: call the endpoint with realistic input; click through
  the UI flow; run the CLI command and check its output and exit code;
  execute the pipeline stage against representative test input and inspect
  the actual output, not just whether it exited 0; import and call the
  public function as a consumer would; trigger the scheduled/worker job and
  confirm it does the work, not just that it fired.
- For an agent: actually invoke it with representative prompts/scenarios and
  observe which tools it calls, with what arguments, and what the tool
  actually returns — do not infer this from the system prompt or tool
  definitions alone. A tool defined in code is not evidence the model is
  ever given it, ever calls it correctly, or that its results are used.
  Non-determinism means one successful run is weaker evidence than for
  deterministic code — note if you re-ran a scenario and whether the
  outcome was consistent.
- Where an item can't be exercised without data, credentials, or state you
  don't have (a paid API key, a specific user role, seeded records, a
  production-only data source), say exactly what's missing rather than
  skipping silently.
- If dynamic verification contradicts the static trace — the code reads as
  correct but the run fails, or vice versa — trust the dynamic result and
  say so explicitly; note the discrepancy as its own finding, since it
  usually points at an environment or config issue worth fixing on its own.

Assign exactly one status:
- WORKING — implemented, the path completes, and you verified it (state how:
  traced and dynamically exercised, or traced only if execution access wasn't
  available — say which). If the item touches stored data going through
  validation, filtering, matching, or querying, add: "(happy path only — data-
  integrity unconfirmed, see Prompt 3)" unless you have separately confirmed
  those paths handle messy/edge-case data correctly.
- BROKEN — implemented but cannot work as written. Give the failure.
- PARTIAL — happy path only; edge cases, error paths, permissions or
  validation missing. State precisely what is missing.
- SCAFFOLDED — the interface, signature, or entry point exists, but there is
  no working logic behind it. This is the category to hunt for.
- ABSENT — no implementation found.
- CONTRADICTED — implemented, but it behaves differently from the spec.
- UNVERIFIABLE — you cannot determine the status statically or dynamically.
  Say exactly what's needed to confirm it (running the app, credentials,
  sample data, a live API, a real upstream data source).

Each detailed status maps to exactly one of the factory's five outcomes, which
the report and the gate use (factory spec section 17.3):
| Outcome | Detailed statuses |
|---|---|
| Verified | WORKING, verified dynamically (or by a test that ran) on the real input it will receive |
| Partially verified | WORKING traced only; PARTIAL; WORKING on fixtures, a hand-made input or only some of its sources |
| Not verified | UNVERIFIABLE; anything whose check did not run |
| Failed | BROKEN, SCAFFOLDED, ABSENT, CONTRADICTED |
| Not applicable | an item the approved spec marks not applicable, with its reason |
Never report an item as Verified because related tests passed: the test must
exercise that item's acceptance criteria. And never on fixtures alone: an item
is Verified only on evidence from the real input it will receive (the live
feed, every source it reads, the newest backup as found, a real browser for
what a browser computes). Otherwise it is Partially verified, with the gap
named ("verified on fixtures; the live feed not seen"). Logic that reads no
outside input may be Verified by tests: say so in Verified how as "no outside
input".

Specific evidence of SCAFFOLDED that you must actively search for:
- Handlers, stages, or commands that are empty, return void, log only, or
  contain TODO/FIXME
- Buttons, menu items, links and form controls with no handler attached, or a
  handler that does nothing
- Hardcoded, mocked, stubbed or placeholder return values standing in for real
  logic; lorem ipsum, sample arrays, fixed example records, a transform that
  passes input straight through unchanged
- Functions that always return success without doing anything
- Data written to local state but never persisted; forms that validate and then
  discard the input
- API calls to endpoints that do not exist, or endpoints defined but never called
- Feature flags, config toggles, or environment variables that are meant to
  change behaviour but are read once and then ignored, or permanently
  disabled; code behind a condition that is never true
- Commented-out implementations
- Navigation to routes that do not resolve
- Tests that assert the mock rather than the behaviour
- Tests whose expected values match the code's output but not the spec (a
  figure, message or rule copied from what the code does, where the acceptance
  criterion or RULE example says otherwise), or that were weakened to pass
- A pipeline stage or transform defined but never wired into the actual
  orchestration/DAG, so it never runs as part of the real process
- A validation rule declared in a schema or type definition but never
  enforced at the point data is actually written or ingested
- A stage or function reading from a hardcoded or stale path/fixture instead
  of the real upstream output it's supposed to consume
- A CLI command registered in the parser with no real implementation behind
  it, or one that only echoes its own arguments back
- A public function or class in a library that returns a hardcoded or mocked
  value instead of performing the work its name and signature promise
- A scheduled or triggered job that's registered but never actually fires, or
  fires and no-ops
- A tool implemented in code but never included in the tool list actually
  passed to the model, so it can never be called
- A system prompt or documentation that claims a capability (e.g. "can look
  up order status") with no corresponding tool or code path behind it
- A guardrail, safety check, or permission rule described only in the system
  prompt or a comment, with nothing in code actually enforcing it — the
  model is being asked nicely, not prevented
- A tool that always returns a fixed/mocked result regardless of its
  arguments, so the agent's decisions never actually reach real data or
  systems

STEP 2 — REVERSE TRACE: code → spec
Now go the other way. Inventory every user-reachable or externally-invokable
capability in the codebase — route, endpoint, command, exported function,
pipeline stage, scheduled job — and map each back to a spec item. Anything
that maps to nothing is out-of-spec — flag it, do not remove it. Classify
each:
- ADDITIVE-VALUABLE — a sensible extension; recommend adding to the spec
- ADDITIVE-NEUTRAL — harmless, works, no spec impact; document it
- ADDITIVE-INCOMPLETE — extra feature that is itself broken or scaffolded;
  the choice is finish it or remove it, and I will decide
- ADDITIVE-RISKY — introduces cost, security exposure, data it shouldn't
  collect, an unowned dependency, a support burden, or a regulatory or
  compliance implication. Explain the exposure.
- CONFLICTING — actively contradicts or undermines a spec requirement
- UNINTENDED — debug routes, test hooks, admin backdoors, seeded accounts,
  verbose diagnostics or development-only shortcuts still reachable

Out-of-spec functionality is not automatically wrong — it is unagreed. Treat
this list as a decision queue for me, not a deletion list for you. Never remove
anything in this step. Write the register to 02_out_of_spec.md as you build it.

STEP 3 — NON-FUNCTIONAL AND IMPLICIT REQUIREMENTS
Audit against requirements that are usually assumed rather than written, and
mark each as SPECIFIED, IMPLIED or UNSTATED:
- Authentication, authorisation and role behaviour (or, for a system with no
  user-facing roles, the credential/trust-boundary equivalent)
- Validation and error handling on every stated feature
- Audit trail, history and traceability where the domain expects it
- Performance and volume expectations
- Accessibility and device/browser support (where applicable)
- Data retention, privacy and regulatory obligations
- Notifications, integrations and downstream consumers
- Failure and offline/retry behaviour
Anything IMPLIED or UNSTATED that the domain plainly requires goes on the
questions list rather than being silently assumed. Append these findings to
01_traceability.md (or 00_context.md for the questions) when done.

STEP 4 — REPORT (produce this before writing any code)
Assemble the final report from the log files you have been writing all along
(01_traceability.md, 02_out_of_spec.md) — do not re-derive it from memory:
1. Traceability matrix: Ref | Requirement | Status | Verified how (static /
   dynamic / both, and on what input: tests, live, real browser, drill, or no
   outside input) | Evidence (file:line) | What's missing | Severity | Effort
   | Confidence
2. Out-of-spec register: Capability | Location | Classification | Rationale |
   Recommendation
3. Summary counts by status and by the five outcomes, and an honest headline:
   what proportion of the specified functionality actually works. Add, when the
   project has them: the composition check (each component and version in
   `composition.json` against what is in the code) and tests expected (from the
   delivery plan) against tests actually run, with the ones not run named
4. Highest-risk items — things that appear complete to a user or a demo
   audience but are not. These are the dangerous ones; list them first.
5. Open questions where spec intent is ambiguous or silent
6. A proposed remediation sequence, dependency-ordered
7. A short entry suitable for pasting directly into a project's PROGRESS.md:
   date, phase/scope covered, the headline number, and the highest-risk items
   from #4
Write the full report to the run's 03_report.md. On my approval of the
remediation sequence, append the #7 entry to the project's NOTES.md (Done list) and
mark the run complete in STATE.md (per LOG_PROTOCOL.md).

STEP 5 — REMEDIATE (only on my approval, item by item)
Work in the agreed order, one spec item at a time. For each: implement to the
stated acceptance criteria, cover the error and edge paths as well as the happy
path, add a test that would fail against the previous state, and report the
before/after status with evidence. Do not batch unrelated items into one change.

RULES
- Follow the findings discipline in audits/LOG_PROTOCOL.md: verify each
  finding before it counts, tag severity and origin (Important / Nit /
  Pre-existing), answer every finding, open the report with the count of
  confirmed Important findings, and in delta re-runs stop after three rounds.
- Report first. Implement nothing during STEP 1–4.
- The log folder is the record: keep STATE.md and the step files current as
  you go, so the audit survives a session ending at any point.
- Evidence over inference: never mark something WORKING because a well-named
  function, type, component, command, or route exists. Trace it, exercise it
  if you can, or mark it UNVERIFIABLE.
- Be blunt. An over-optimistic conformance report is worse than no report —
  it is the specific failure mode this audit exists to catch. If most of it
  doesn't work, say so plainly in the headline.
- Where you cannot verify without running the system, say so rather than
  assuming either way. Where you CAN run the system, do — don't settle for a
  static trace when dynamic verification is available.
- Do not expand the spec on my behalf, and do not quietly delete out-of-spec
  work. Both are decisions for me.
```
