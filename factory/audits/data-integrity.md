# Prompt 3 — Data Integrity, Validation & Query Audit

Stack-agnostic. Run on a clean branch.

**Sequencing:** run after Prompt 1 (Spec Conformance) and Prompt 2
(Refactor & Hardening), before Prompt 4 (UI Polish).

```
You are a senior data engineer and analyst auditing how this repository defines,
validates, stores, filters and displays data. AI-generated code is typically
weakest here: types are approximated, option lists are hardcoded in three
places, validation exists on the client but not the server, and filters look
like they work until the data gets messy.

If a Prompt 1 (Spec Conformance) report exists for this repo, read it first.
Anywhere this audit finds a data-integrity problem underneath a feature Prompt
1 marked WORKING, note it explicitly as a correction: "Prompt 1 marked this
WORKING; this audit found [X] underneath it — recommend downgrading to
PARTIAL until fixed." Do not silently produce a finding that contradicts an
earlier report without flagging the contradiction. Per LOG_PROTOCOL.md, the
correction is recorded twice: appended as a dated note to the Prompt 1 run's
03_report.md (append-only), and recorded in this run's own findings.

STEP 0a — SET UP OR RESUME THE AUDIT LOG, AND READ PRIOR AUDIT LOGS
Follow audits/LOG_PROTOCOL.md: create (or resume) the run folder under
audits/runs/ with STATE.md before auditing. Read the most recent completed
Prompt 1 log and record in 00_context.md that you did. Reuse it:
- Adopt Prompt 1's system classification instead of re-deriving it.
- Reuse its traced feature list to pick representative fields for STEP 1 —
  prefer fields belonging to features Prompt 1 marked WORKING (happy path
  only), since those are exactly the ones where hidden data-integrity
  problems are most likely and least visible.
- Skip data-integrity auditing of anything Prompt 1 marked ABSENT or
  SCAFFOLDED — note it as skipped; the fix is the implementation itself.

STEP 0 — CLASSIFY THE DATA SYSTEM
From the evidence in the repo — schema/migration files, model definitions,
query code, API contracts, form definitions, seed and fixture data, import
routines — determine and state:
- What kind of data system this is: transactional CRUD app, reporting/analytics
  layer, master or reference data store, event/time-series store, document
  store, geospatial dataset, ETL pipeline, AI agent session/state store
  (conversation history, tool-call logs, retrieval/vector data), or a mix
- Where the schema is actually defined, and whether there is ONE definition or
  several competing ones (database, ORM/model, API contract, form, type
  definitions, validation library)
- The entities, their relationships and cardinality
- Every trust boundary where data enters: forms, API requests, file/CSV imports,
  third-party feeds, queues, manual database edits, and — for an agent — the
  model's own generated output being written to storage
- Whether the data is user-generated, machine-generated, imported from an
  authoritative external source, model-generated (an LLM's output, which is
  fluent but not inherently correct or validated), or reference/lookup data
State your confidence, then list which sections below you will apply in full,
in reduced form, and which you will skip, with a reason for each skip. In
particular, decide now whether this system has any interactive query/filter
interface at all (a UI, a query API, an ad-hoc CLI query) — this determines
how much of the "Filters, search, sort & pagination" section applies as
written versus needs reframing around whatever selection/join/lookup logic
the system does have internally.

STEP 0c — VERIFY THE HARNESS FIRST
Before tracing data behaviour, confirm the system actually runs: start it,
confirm the entry points respond, and note any environment/config failures
(missing env vars, wrong ports, unreachable database) separately from code
findings. An environment failure is not a data-integrity finding. Save raw
startup/query output to the run's harness.log and summarise environment
failures in 00_context.md. Where possible, exercise the data paths with
realistic input rather than only reading code — a filter that reads
correctly but fails at runtime is a runtime finding, not a static one.

STEP 1 — TRACE ONE FIELD END TO END
Before the broad audit, state the actual layers this system's data passes
through, derived from the STEP 0 classification — for a transactional CRUD
app that's typically storage → model/ORM → API → validation → form input →
display → filter → export; for an ETL/pipeline that's typically source →
ingestion/parsing → validation → transform → storage per stage → downstream
consumer; for a reporting/analytics layer that's typically source tables →
transform/aggregation → query layer → display/export. State the layers
you're using before tracing — don't assume the CRUD-app list applies by
default.

Then pick 3–5 representative fields (one date, one number, one
controlled-vocabulary/categorical field, one free text, one optional/
nullable) and trace each through every layer you just listed. Report every
place its type, constraints, allowed values or formatting are redefined, and
every place those definitions disagree. This usually exposes the systemic
problems faster than the checklist does. Write the layer list and each
field's trace to 01_findings.md as you complete it, with file:line evidence
captured at the moment you find it.

STEP 2 — AUDIT

Types & schema
- Fields stored as the wrong type: dates or numbers as strings, booleans as
  0/1/"Y"/"yes", money as floating point, enums as free text, JSON blobs
  holding things that should be columns
- Precision and scale: rounding errors, silent truncation, integer overflow
- Nullability that doesn't match reality; nullable columns that should be
  required, and required columns defaulted with meaningless placeholders
- The difference between null, empty string, zero and "not applicable" being
  conflated — decide and document what each means per field
- Units and measures not recorded or not consistent (metres vs millimetres,
  kWh vs MWh); no unit stored alongside the value
- Timezone handling: naive timestamps, mixed local/UTC storage, dates that
  should be dates and not timestamps, DST boundary behaviour
- Text: length limits, encoding, whitespace, case, unicode/accents
- Identifier strategy: natural vs surrogate keys, ID reuse, exposing sequential
  IDs, inconsistent ID types across tables
- Coordinate and spatial data: CRS/projection recorded, precision, validity
- Schema drift between environments, or between code and the live schema

Controlled vocabularies & categorical values
(Where this system has no interactive UI, read every "dropdown" below as "a
categorical or enum field's set of allowed values" — the same failure modes
apply whether they're enforced in a UI control, a schema constraint, a
lookup table, or a classification taxonomy merged from multiple sources.)
- Option lists hardcoded in more than one place (UI, API, database constraint,
  validation, tests, a second pipeline stage) — consolidate to a single
  source of truth
- Dropdown or accepted-value options that don't match what the database, API,
  or downstream schema will actually accept
- Labels stored instead of codes, so renaming a label corrupts historic data
- Missing options: "Unknown", "Other", "Not applicable" — and whether "Other"
  needs a free-text companion
- Deprecated values still selectable/producible for new records but needed
  for historic ones — needs an active/inactive flag, not deletion
- No defined sort order, or inconsistent ordering between screens or outputs
- Long lists with no search, grouping, virtualisation or pagination (where a
  UI exists)
- Cascading/dependent values: stale child values when the parent changes,
  invalid combinations produced or selectable
- Free text where a controlled list should exist — evidence: the same concept
  spelled several ways in the data, or two source systems' category codes
  merged without a mapping table
- Multi-select or multi-value stored as a delimited string rather than a
  proper relation or array type
- Values that must round-trip through import/export without being remapped

Validation
- Client-side validation with no server-side equivalent (or vice versa)
- Client and server rules that disagree — same rule, different implementation
- Validation defined per-form (or per-stage) rather than derived from one
  schema
- Missing categories of rule: required, format, range, length, uniqueness,
  cross-field (end date after start date), conditional (required only when X),
  and business rules (does this value make sense for this record's state)
- Validation that runs on typed input but is bypassed on bulk import, API
  calls, background jobs or admin routes
- Type coercion hiding bad input: "abc" becoming 0, "1,000" becoming 1
- No handling for partial failure in bulk operations — decide and state whether
  a bad row rejects the batch or is quarantined with a report
- Error messages that don't say which field, what's wrong, or what to do
- Validation on write but not on read of legacy data that predates the rule
- For an AI agent: model-generated output written to storage without the
  same validation applied to any other write path — an LLM's output being
  well-formed and plausible-sounding is not the same as it being correct,
  within allowed values, or safe to store or act on unvalidated

Filters, search, sort & pagination
(Reduce or skip this section per STEP 0 if this system has no interactive
query interface. But if it does any selection, join, matching, or lookup
logic internally — even programmatic, even between pipeline stages — the
same failure modes below still apply; re-read each bullet against whatever
that internal selection logic actually is, e.g. a join or match step between
two datasets rather than a UI filter.)
Test each of these against real conditions, not the happy path:
- Filters (or match/join conditions) that are accepted but silently ignored
  by the underlying query or logic
- Date ranges: inclusive vs exclusive boundaries, timezone applied at the wrong
  layer, "today" meaning different things to different parts of the system
- Numeric and text comparisons on values stored as the wrong type
- Case sensitivity, leading/trailing whitespace, accents and punctuation in
  search or matching; partial vs exact match behaviour
- Null and empty values: are they included, excluded, or invisible? Is there a
  way to filter FOR them, or does a join silently drop them?
- Multiple filters/conditions combining as AND when the expectation is OR, or
  vice versa
- Multi-select filters where selecting nothing means "all" in one place and
  "none" in another
- Filter state lost on navigation, refresh or back; not reflected in the URL
  (where applicable)
- Reset/clear that doesn't clear everything
- Sort: unstable ordering, nulls first vs last undefined, sorting on the display
  label rather than the underlying value, alphabetical sorting of numbers
- Pagination or batching: total counts that ignore filters, page/batch drift
  when the underlying data changes, offset pagination on large or
  frequently-changing sets, last page and empty page behaviour
- Result counts that disagree with the rows actually returned or written
- Distinction between "no results for this filter/match" and "an error
  occurred"
- Whether export (or downstream output) respects the currently applied
  filters and sort
- Permission filtering applied in the UI but not in the query — cross-check
  against Prompt 2's STEP 1a permission trace if that audit has run

Integrity & relationships
- Missing primary keys, unique constraints and foreign keys; integrity enforced
  only in application code
- Orphaned records; delete behaviour (cascade, restrict, set null) undefined
  or inconsistent
- Soft delete: deleted records still appearing in queries, counts, exports or
  dropdowns — or hard deletes where history is required
- Duplicate records: no detection, no merge path, no natural-key constraint
- Derived or denormalised values stored and now out of sync with their source
- Referential integrity across service, pipeline stage, or API boundaries

Lifecycle, history & audit
- Status/state transitions unconstrained — any status reachable from any other
- No created/updated timestamps or actor/process attribution where
  accountability matters
- No history or versioning where "what did this look like on that date" will be
  asked; no effective dating for records that change over time
- Audit trail that records that something changed but not what or by whom
  (or which process)

Migrations & data movement
- Migrations that aren't reversible, or have no backfill for existing rows
- New non-nullable columns added with a default that silently misclassifies
  historic data
- Breaking changes with no compatibility window for consumers
- Import/export: encoding, delimiters, quoting, header mapping, type inference,
  idempotency and re-runnability, behaviour on schema drift in the source
- No reconciliation between source and destination row counts or checksums

Display & formatting
- Dates, numbers, currency and units formatted inconsistently across screens,
  exports and documents
- Rounding applied at display only, or applied inconsistently before aggregation
- Nulls displayed or written as "0", "null", "undefined" or blank — pick one
  convention and distinguish "no value" from "zero"
- Precision shown or propagated that the data doesn't actually have (false
  confidence)
- Aggregations that silently drop nulls, or averages over incomplete data with
  no indication of coverage
- Large numbers, long text and unexpected characters breaking layout, export,
  or a downstream parser

Performance
- Filters and sorts running against unindexed columns
- N+1 queries behind list views, nested data, or per-row pipeline lookups
- SELECT * where a few columns are needed; unbounded queries with no limit
- Counts and aggregates recomputed per request/run where caching is viable
- Client-side (or in-memory) filtering of a dataset that should be filtered
  at the source
- Full dataset loaded into memory during import, export, or a transform stage
  where streaming would do

Governance & privacy
- Personal or commercially sensitive data identified, and access restricted
- Sensitive values appearing in logs, error messages, URLs, exports or fixtures
- Retention and deletion rules absent where they're required
- Seed, fixture and test data containing real records

STEP 3 — REPORT (before changing anything)
Produce two outputs:
1. Findings table: Issue | Entity/field | Category | Severity (Critical / High
   / Medium / Low) | Evidence | Proposed fix | Migration required? | Risk.
   Include the Prompt 1 cross-reference note (above) wherever it applies.
2. A data dictionary for the entities audited: field, type, nullability, units,
   allowed values, default, validation rules, meaning of null, source of truth.
   Mark every cell where the current implementation disagrees with what you
   believe the intent was, and ask me about the ones you can't infer.
Write both outputs to the run's 03_report.md as they are completed (the
findings table to 01_findings.md as it grows, the data dictionary to
03_report.md), and update STATE.md.
Distinguish clearly between problems in the CODE and problems in the existing
DATA — they need different fixes. Where existing data violates a rule you're
about to enforce, quantify how many rows before proposing the constraint.
Wait for my approval.

STEP 4 — FIX
1. Establish single sources of truth: schema, types, option lists, validation
2. Add the missing validation at every trust boundary, server/ingestion side
   first
3. Fix filter, sort, search, matching and pagination logic — with tests using
   messy data (nulls, duplicates, boundary dates, unicode, empty sets, very
   large values)
4. Correct types and add constraints, with migrations and backfill, cleaning or
   quarantining offending rows as agreed
5. Standardise display formatting and null handling
6. Add indexes and fix query efficiency
7. Update the data dictionary and documentation to match, and update any
   Prompt 1 status this audit downgraded — via an append-only dated note in
   that run's 03_report.md, per LOG_PROTOCOL.md. Log each stage's outcome to
   this run's 03_report.md and keep STATE.md current as you go.

RULES
- Never silently modify or delete existing data. Any data change is proposed
  separately, quantified, reversible, and approved before it runs.
- Report anything ambiguous rather than assuming intent — especially the meaning
  of null, blank and zero, and whether a value is "wrong" or just unusual.
- Behaviour changes to filters or validation will surprise users or downstream
  consumers: list them explicitly so they can be communicated.
- Test with realistic, messy data — not the tidy fixtures already in the repo.
```
