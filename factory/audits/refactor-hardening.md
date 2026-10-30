# Prompt 2 — Refactor, Hardening & Error-Handling Audit

Stack-agnostic. Run on a clean branch.

**Sequencing:** run after Prompt 1 (Spec Conformance) has established what
actually works, before Prompt 3 (Data Integrity) and Prompt 4 (UI Polish).
No point hardening a code path that's about to be rebuilt because it was
never really wired up.

```
You are a senior software engineer performing a refactor and hardening pass on
this repository. The code was largely AI-generated, so expect duplication,
inconsistent patterns, silent failure paths, and half-finished features.

STEP 0a — SET UP OR RESUME THE AUDIT LOG, AND READ PRIOR AUDIT LOGS
Follow audits/LOG_PROTOCOL.md: create (or resume) the run folder under
audits/runs/ with STATE.md before auditing. Then read the most recent
completed Prompt 1 run log (its 01_traceability.md and 03_report.md) and
record in 00_context.md that you did. Reuse it:
- Adopt Prompt 1's system classification and entry-point inventory instead
  of re-deriving them (verify nothing has changed since that run).
- Skip hardening anything Prompt 1 marked ABSENT — there is nothing there
  to harden; note it as skipped in 01_findings.md.
- Treat anything marked SCAFFOLDED or BROKEN as "fix, don't harden": the
  finding is the missing implementation, not its error handling.

STEP 0 — CLASSIFY THE SYSTEM
Determine what kind of system this is from the evidence in the repo — manifest
and lock files, dependencies, entry points, build and deployment config,
directory structure, network/database/filesystem usage — not from the repo
name. State your conclusion, the evidence, and your confidence.

Classify against these, and say if it's more than one:
- Front-end application (SPA, mobile app, desktop app)
- Server-rendered web application
- HTTP/RPC API or backend service
- CLI tool or script collection
- Library, SDK or package consumed by other projects
- Batch job, ETL or data pipeline
- Background worker, queue consumer or scheduled job
- Infrastructure/automation code
- AI agent or LLM-based service (tool-calling, autonomous or semi-autonomous
  decision-making)
- Prototype, spike or demo not intended for production
- Monorepo containing several of the above

Also state: language(s), runtime, framework(s), package manager, test runner,
build and lint setup, the existing architectural pattern, entry points, module
boundaries and the dependency graph. Identify the trust boundaries — every
point where data enters from outside (user input, network, files, queues,
environment). Identify every distinct role or permission level the system
defines (even informally — "admin", "owner", "viewer", API-key vs session
auth, a service account) and where each is checked. If the system genuinely
has no user-facing roles (a single-operator pipeline, an internal script), say
so — this doesn't remove the trust-boundary question, it changes what STEP 1a
looks for. For an AI agent, the trust boundary includes the model itself:
identify every tool it can call, what each tool is capable of doing, and
whether the model's own judgement is the only thing standing between a user
request and that action.

STEP 0b — SCOPE THE AUDIT TO THE SYSTEM TYPE
Before auditing, list which sections below you will apply IN FULL, in REDUCED
form, and which you will SKIP, with a one-line reason for each skip. Weight
the audit accordingly — the categories matter everywhere, but their priority
does not. Guidance:
- API/service → weight input validation, authorisation, idempotency, timeouts,
  retries, error responses and status codes, N+1 queries, connection/pool
  handling, structured logging, observability, graceful shutdown.
- Front-end app → weight state management, effect cleanup, stale closures,
  re-render cost, bundle size, request cancellation, optimistic updates and
  user-facing error surfaces. Reduce server-side security scope, but keep
  the client-side authorisation checks below in full — a hidden button is
  not a security control.
- CLI → weight argument parsing and validation, exit codes, stdout vs stderr
  discipline, piping and non-TTY behaviour, clear failure messages, dry-run
  and destructive-action safety. Skip web security sections.
- Library/SDK → weight public API surface and stability, semver implications,
  typed exports, tree-shakeability, peer/transitive dependencies, thrown error
  contracts and documentation. Any breaking change is Critical.
- Data pipeline/ETL → weight idempotency and re-runnability, partial-failure
  handling, checkpointing, schema drift, data validation, memory footprint on
  large inputs, streaming vs loading in full, and lineage/logging.
- Worker/scheduled job → weight at-least-once semantics, duplicate handling,
  poison messages, dead-letter paths, concurrency limits, lock/leader safety.
- Infrastructure code → weight secrets handling, idempotency, blast radius,
  state management and drift. Skip most application-level sections.
- AI agent/LLM service → weight tool-call authorisation (STEP 1a below covers
  this in depth), input validation on model-generated tool arguments,
  prompt-injection exposure from any untrusted content the model reads,
  rate/cost limits on model and tool calls, and logging sufficient to
  reconstruct a decision after the fact. Reduce or skip standard web-security
  sections that don't apply (CSRF, session cookies) unless the agent also
  exposes a normal web/API surface, in which case audit that surface too.
- Prototype/demo → report everything, but propose only the fixes that keep it
  demonstrable; say explicitly what you'd defer until it goes to production.
  Do not defer authorisation checks on anything handling real or realistic
  data, even in a prototype.
- Monorepo → classify each package separately and audit each on its own terms,
  plus cross-package duplication, version skew and boundary violations.

Follow the conventions already in this repo — do not migrate frameworks or
impose a new architecture.

STEP 0c — VERIFY THE HARNESS FIRST
Before auditing code behaviour, confirm the system actually runs: build it,
start it, confirm the entry points respond, and run the existing test suite.
Record any environment/config failures (missing env vars, wrong ports, proxy
or CORS config, unreachable dependencies) as a separate category — they are
not code findings and must not be counted as bugs in the findings table. Save
raw build/test output to the run's harness.log and summarise environment
failures in 00_context.md. If the harness cannot be brought up, fixing that
is the first remediation item, before any code change.

STEP 1 — AUDIT

STEP 1a — TRACE PERMISSIONS OR TRUST BOUNDARIES END TO END (do this before
the broad checklist)
If this system has a user-facing role or permission model, pick 2–3
representative protected actions — one that should require the highest
privilege level, one restricted to a specific role, and one restricted to
the resource's owner only (e.g. "a user can edit their own record but not
someone else's"). For each, trace enforcement through every layer it passes:
UI (is the control merely hidden, or actually blocked?) → route/page guard →
API middleware/decorator → business logic → data access query (does the
query itself scope to what the caller is allowed to see, or does it fetch
everything and filter client-side?). Report, for each action, exactly which
layers enforce the restriction and which merely assume a prior layer already
did. A permission enforced only in the UI or only in routing, with no check
in the handler or query itself, is a Critical finding regardless of how the
rest of the audit scores.

If this system has no meaningful user-facing role model — a single-operator
pipeline, an internal script, a library with no auth concept — say so
explicitly and do not invent one to audit. Instead audit whatever trust
boundary the system does have: the credentials or service account it runs
as, and whether they're scoped to the minimum access the system actually
needs (e.g. a pipeline using a superuser database connection string for
convenience where a role scoped to just its target tables would do), any
third-party API keys and their scope, and any point where this system's
output is trusted downstream without the consumer re-validating it.

If this system is an AI agent, run a dedicated trace instead of (or alongside)
the above: pick 2–3 representative tools, especially any that are

Write the results of this trace to 01_findings.md as you complete it —
permission and trust-boundary findings are the highest-severity output of
this audit and must not exist only in chat memory. Capture file:line
evidence at the moment you find it.

Correctness & broken functionality
- Code paths that cannot work: undefined variables, wrong signatures, bad
  imports, mismatched return shapes, incorrect conditionals
- Features that are stubbed, half-wired, or referenced but never implemented
- Unhandled async: floating promises, missing await, unhandled rejections
- Race conditions, stale state/closures, effects with wrong dependencies
- Off-by-one errors, boundary conditions, null/undefined/empty handling
- Resource leaks: unclosed connections, uncleaned listeners/timers/subscriptions
- Dead code, unreachable branches, unused exports, orphaned files

Error handling
- Swallowed errors (empty catch, catch-and-log-and-continue)
- Inconsistent strategies across similar code (throw vs return vs null)
- Missing handling at I/O boundaries: network, filesystem, database, third-party
- No timeouts, retries or backoff on remote calls; no cancellation
- Missing validation of external input at trust boundaries
- Errors that leak internals to users, or messages that give users no next step
- No top-level/global handler or error boundary
- Logging that is absent, excessive, or leaks sensitive values
Propose ONE consistent error strategy and apply it everywhere.

Duplication & reuse
- Blocks repeated three or more times → extract to a shared function, module,
  hook or utility
- Near-identical UI blocks → extract to a parameterised component
- Copy-pasted logic that has since diverged — reconcile the differences
  explicitly and say which behaviour you kept
- Repeated constants, magic numbers and magic strings → named constants/enums
- Repeated data-fetching, validation, formatting or auth logic → shared layer

Structure & componentisation
- Oversized files, functions and components doing several unrelated jobs
- Mixed concerns: rendering + data access + business rules in one place
- Deep prop drilling or excessive parameter lists
- Missing separation between presentation, logic and data access
- Inconsistent or unclear file/folder organisation

Standardisation
- Naming conventions for files, functions, variables, types, events, handlers
- Consistent parameter order and return shape across similar functions
- One async style throughout; one state-management approach
- Centralised configuration and environment access — no scattered env reads
- Consistent import ordering and module boundaries
- Uniform API/response/data-access patterns across similar endpoints or calls

Efficiency
- Algorithmic waste: nested loops over the same data, repeated lookups,
  work inside loops that could be hoisted
- N+1 queries/requests; missing batching, pagination or indexes
- Unnecessary re-computation or re-rendering; missing memoisation where it
  demonstrably matters
- Oversized payloads and bundles; missing lazy loading or code splitting
- Synchronous work blocking the main thread or event loop
Only optimise where there is a plausible measurable win — call out anything
you believe is premature and leave it.

Data & state
- More than one source of truth for the same data
- Derived values stored instead of computed
- Unintended mutation of shared objects
- State held further up than it needs to be

Types & contracts
- Missing/weak typing, escape hatches (any, casts, ignore comments)
- External data used without validation or parsing
- Public interfaces that are undocumented or inconsistent

Authorisation & access control
(Beyond the STEP 1a trace, sweep the rest of the codebase for the same
pattern. If STEP 1a found no role model, sweep instead for the trust-
boundary issues below.)
- Every protected action re-checked here: is enforcement server-side, or does
  it rely on the client not sending a request the UI doesn't expose?
- Roles or permissions added after initial build — these are the ones most
  likely to have been wired into the UI only, because the earlier API/query
  layer predates the concept. Actively look for permission logic that exists
  in only one layer of the stack.
- Object-level authorisation: can user A fetch or modify user B's resource by
  guessing or incrementing an ID, independent of role?
- Privilege escalation paths: can a lower-privileged user reach a
  higher-privileged action through an unguarded endpoint, a bulk operation, an
  admin route left reachable, or a parameter the handler trusts unchecked?
- Session/token/credential handling: expiry, revocation, storage (are tokens
  in localStorage where they're readable by any injected script? is a
  service-account key committed or over-broadly scoped?), refresh flow
- CSRF protection on state-changing requests where cookies are used for auth
- Rate limiting or brute-force protection on auth and other sensitive endpoints
- Debug routes, admin backdoors, seeded/test accounts, or verbose diagnostic
  endpoints reachable outside a development environment
- For an AI agent: every tool re-checked here for the same pattern —
  authorisation/validation living only in the system prompt or a docstring
  rather than the tool's own code; a tool that trusts arguments the model
  generated without validating them as if they came from an untrusted user,
  because they did; irreversible or costly actions (spending money, sending
  something externally, deleting data) with no confirmation step or human
  gate; one overly-broad credential shared across tools where per-tool
  scoping would contain a mistake

Security & hygiene
- Secrets, keys or credentials committed in code or config
- Injection risks; unsafe dynamic evaluation or raw HTML insertion
- Unused, duplicated, abandoned or vulnerable dependencies
- For an AI agent: prompt-injection exposure — any tool that feeds
  external/untrusted content (a web page, an email body, a file) back into
  the model's context with no marking or handling that distinguishes it from
  a trusted instruction; missing rate or cost limits on model/tool calls that
  could let a bug or a bad actor trigger a runaway loop of paid API calls or
  repeated external side effects

Tests & tooling
- Absent or misleading tests; tests that assert nothing
- No coverage of the bugs found in this audit, and specifically no test that
  exercises a protected action as an unauthorised caller and asserts it's
  rejected
- Lint/format/build config missing, misconfigured, or not passing
- For an AI agent: no eval/scenario tests for the model-facing behaviour, or
  no regression check against previously-working scenarios when the prompt,
  model, or tool set changes

STEP 2 — REPORT (before changing anything)
Produce a findings table: Issue | File(s)/line(s) | Category | Severity
(Critical / High / Medium / Low) | Proposed fix | Risk | Effort. Any
authorisation or trust-boundary finding from STEP 1a or the sweep is Critical
by default — downgrade only with an explicit reason. Assemble the table from
01_findings.md (which you have been appending to throughout), write the
finished report to 03_report.md, and update STATE.md. Then propose a staged
plan. Wait for my approval.

STEP 3 — EXECUTE
Log each stage's outcome (what changed, why, risk, what was left alone) to
the run's 03_report.md as you complete it, and keep STATE.md current, so the
remediation survives a session boundary. Work in this order, stopping after
each stage for review:
1. Add characterisation tests around anything you're about to change
2. Fix critical bugs, broken functionality, and authorisation gaps (behaviour
   changes — flag each)
3. Apply the unified error-handling strategy
4. Extract duplication into shared utilities and components
5. Split oversized modules; standardise naming, signatures and structure
6. Efficiency improvements
7. Types, validation and remaining security fixes
8. Remove dead code and unused dependencies
9. Update README/docs to match reality

RULES
- Behaviour-preserving refactors and behaviour-changing bug fixes must be in
  separate steps, clearly labelled.
- Keep public interfaces stable unless we agree otherwise.
- No wholesale rewrites, no framework swaps, no new dependencies without asking.
- Run the build, lint and tests after every stage and report the result.
- If you're unsure whether something is a bug or intended behaviour, ask —
  do not guess. This applies doubly to anything that changes who — or what
  service, job or credential — can see or do what; never loosen or tighten
  access as a side effect of an unrelated fix without calling it out
  separately.
- After each stage: what changed, why, what risk it carries, what you left
  alone and why.
```
