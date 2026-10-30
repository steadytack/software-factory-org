# Audit Log Protocol (shared by Prompts 1–4)

All four audit prompts write their findings to disk as they go. This file is
the single source of truth for how. Each audit prompt references it; the
protocol itself is deliberately short so it can be re-read cheaply at the
start of any audit session.

## Why

Chat memory is lost between sessions. An audit that lives only in the
conversation cannot be resumed, cross-referenced by a later audit, or trusted
as a record. The log folder is the durable artefact; the chat is just the
driver.

## Location and structure

All audit runs live under `audits/runs/` (create it if missing). One folder
per run:

```
audits/runs/<YYYY-MM-DD>-<audit-number>-<short-name>/
    00_context.md        system classification, execution access, harness status
    01_traceability.md   (Prompt 1) spec items, statuses, evidence
    01_findings.md       (Prompts 2–4) findings tables as they are built
    02_out_of_spec.md    (Prompt 1) reverse-trace register
    03_report.md         final report for the run
    STATE.md             checkpoint: current step, items done, pending decisions
    harness.log          raw output of harness/startup commands (STEP 0c)
```

Use the file names that apply to the audit in question; do not create empty
files for sections that audit doesn't have.

## Rules

1. **Set up before tracing.** At the very start of an audit (before STEP 0
   output), check for an existing run folder for this audit. If one exists
   and `STATE.md` shows it incomplete, RESUME it: read `STATE.md` and the
   existing files, confirm with the user, and continue from the checkpoint.
   Otherwise create the folder and `STATE.md` immediately.
2. **Write as you go.** After completing each STEP, append its findings to
   the relevant log file before moving to the next step. Never hold a whole
   audit in chat memory and dump it at the end. A session that dies mid-audit
   must lose nothing already established.
3. **Capture evidence at the moment you find it.** Record `file:line`
   references and command outputs into the log when you find them, not when
   writing the final report. This avoids re-searching the codebase later.
4. **`STATE.md` is the resume point.** Keep it current: current step, spec
   items / findings completed so far, open questions awaiting user decisions,
   and (for re-runs) the git diff base or last-run date used for delta mode.
5. **Append-only history.** Never edit or delete findings in a previous
   run's files. Corrections to an earlier audit are written as a dated note
   appended to that run's `03_report.md`, plus recorded in the current run's
   own report.
6. **Cross-audit reads.** Prompts 2, 3 and 4 must read the most recent
   completed Prompt 1 log (and Prompt 2's log for Prompt 4's deferred list)
   before starting, and record in `00_context.md` which prior logs they used.
   Reuse prior results instead of re-deriving them (see each prompt's
   efficiency notes).
7. **Harness output goes to `harness.log`.** Save raw startup/build/test
   command output there during STEP 0c; summarise environment failures in
   `00_context.md`, keeping them separate from code findings.
8. **Final hand-off.** When the report is approved, append the PROGRESS.md-
   style summary entry (date, scope, headline number, highest-risk items) to
   the project's `NOTES.md (Done list)`, and mark the run complete in `STATE.md`.
## Findings discipline (all four audits)

Ported from Anthropic's published code-review practice (claude.dev, "Solving code review at Anthropic", read 2026-10-27); recorded in `CHANGELOG.md`.

1. **Verify before it counts.** A finding enters the report only after a second, independent look: re-trace it from the evidence (or, with helpers available, give each finding to a separate helper that has not seen the first pass's reasoning and votes confirmed / not confirmed). Unconfirmed findings go in a short "not confirmed" list with the reason, not in the counts.
2. **Drop noise.** Style, naming and cleanup-only observations are not findings; keep at most 3 as nits, below the line. Each finding cites `file:line` and, for a behaviour claim, the input or command that shows it. A name is not evidence.
3. **Severity and origin.** Every finding is tagged Important (wrong, unsafe or unspecified behaviour), Nit, or Pre-existing (present before this build or change request: reported, never blamed on it). Pre-existing items do not block the gate.
4. **Every finding is answered.** Fixed, or closed with a written reason (owner decision, accepted limitation, not reproducible). Open Important findings block Gate 3. Record each answer in `01_findings.md` or `01_traceability.md` against the finding's reference.
5. **Round cap.** Re-runs after fixes review only the new diff and the previously open items, and do not repost findings already raised. After the third round, stop and reconsider the approach (is the spec wrong? is a whole class of bug being fixed one instance at a time?) and put that to the owner. When a bug class repeats, fix the class and add a test or check for it.
6. **Summary first line is a count.** `03_report.md` opens with the number of confirmed Important findings (and says "0 findings" plainly when there are none).
7. **Misses become test cases.** A defect found later (after Gate 3, in use, or in a later audit) that an earlier audit should have caught is added to `factory/audits/known-misses.md` with the item it escaped and what would have caught it; reuse them as known-bad cases when tuning an audit prompt. An item is Verified only on evidence from the real input it will receive; fixtures alone make it Partially verified, with the gap named.
