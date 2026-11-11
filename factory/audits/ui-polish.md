# Prompt 4 — UI Polish & Consistency Audit

Stack-agnostic. Run on a clean branch.

**Sequencing:** run this last, after Prompt 1 (Spec Conformance), Prompt 2
(Refactor & Hardening), and Prompt 3 (Data Integrity). Polishing a screen
that doesn't actually work, or that's about to be restructured, is wasted
effort — worse, it makes a broken feature look finished. If Prompt 1's
report is available, read it first and treat anything it marked BROKEN,
SCAFFOLDED, or CONTRADICTED as out of scope for polish until it's fixed;
flag those screens rather than making them look better.

No change needed for non-UI systems: STEP 0 below already classifies the
system first, and STEP 0b already instructs the assistant to stop and
report only on CLI/log/API-response formatting if there's no UI at all,
rather than inventing UI work. That's the correct behaviour for a pipeline,
library, or headless service — leave it as is.

**Change (logging & efficiency):** findings are written to a persistent run
folder under audits/runs/ as the audit proceeds (audits/LOG_PROTOCOL.md),
with a STATE.md checkpoint so the audit is resumable. Prompt 1's deferred/
broken screen list is read from its log and reused directly.

```
You are a senior product designer and front-end engineer. Audit and then polish
the user interface of this repository.

Before starting, check whether a Prompt 1 (Spec Conformance) report exists for
this repo. If it does, read it — from its run folder under audits/runs/ per
LOG_PROTOCOL.md, not from chat memory. Do not polish any screen, route, or
component that report marked BROKEN, SCAFFOLDED, or CONTRADICTED — list those
as "deferred, pending functional fix" in your own report instead of styling
them. If no such report exists, proceed, but flag in STEP 3 any screen you
suspect is non-functional so it can be checked before you spend effort on it.

STEP 0a — SET UP OR RESUME THE AUDIT LOG
Follow audits/LOG_PROTOCOL.md: create (or resume) the run folder under
audits/runs/ with STATE.md before auditing. Record in 00_context.md which
prior audit logs you read. Reuse Prompt 1's log directly: its BROKEN /
SCAFFOLDED / CONTRADICTED items become your deferred list verbatim, and its
system classification saves re-deriving it. Also read Prompt 3's log if it
exists — its display & formatting findings overlap with this audit's
content/formatting sections; don't re-report what it already found, just
reference it.

STEP 0 — CLASSIFY THE SYSTEM
Before anything else, determine what kind of system this is by reading the
evidence in the repo — manifest and lock files, dependency list, entry points,
build config, directory structure, routing, deployment/CI config — not by
guessing from the repo name. State your conclusion and the evidence for it,
and say how confident you are.

Classify against these, and say if it's more than one:
- Responsive web app (multi-device browser UI)
- Desktop-only web app or internal tool (fixed viewport, dense data)
- Mobile web / PWA
- Native or cross-platform mobile app
- Desktop application (Electron, native shell)
- Static site, marketing site or documentation site
- Server-rendered app with templates
- Embedded/kiosk/large-format display UI
- Component library or design system consumed by other projects
- Data/BI dashboard or visualisation-heavy app
- Browser extension
- Conversational/chat interface for an AI agent (web, mobile, or embedded)
- CLI, API, service, library, data pipeline, or headless AI agent with no
  chat UI of its own — i.e. NO user interface

Then state:
- The framework/platform and the styling approach in use (CSS, CSS modules,
  utility classes, CSS-in-JS, native stylesheets, template engine, etc.)
- Whether a design system, token file, theme config or component library exists
- The set of screens/pages/views and the shared layout primitives

STEP 0b — SCOPE THE AUDIT TO THE SYSTEM TYPE
Before auditing, list which sections below you will apply IN FULL, which you
will apply in REDUCED form, and which you will SKIP — with a one-line reason
for each skip. Use judgement; guidance:
- No UI at all → stop and tell me. Do not invent UI work. Report only on
  CLI output formatting, log readability, generated docs or API response
  shape if those exist, then hand over to the refactor prompt.
- Desktop-only internal tool → responsiveness reduced to sensible min/max
  widths, zoom and window resizing; skip touch targets and mobile navigation.
  Weight density, keyboard efficiency and table/form ergonomics heavily.
- Native/cross-platform mobile → replace browser breakpoints with device
  classes, orientation, dynamic type, platform HIG conventions, safe areas
  and gesture/touch ergonomics. Skip hover states.
- Kiosk/large-format → fixed target resolution, viewing distance, legibility
  at range, no keyboard. Skip responsive breakpoints and hover.
- Static/marketing/docs site → weight typography, reading measure, content
  hierarchy, layout shift and image handling. Reduce interaction-state work.
- Component library → audit the components and their variant/state matrix,
  token API, documentation and examples. Skip page-level layout and IA.
- Dashboard/visualisation-heavy → add chart legibility, colour-blind-safe and
  ordered palettes, axis/label/tooltip consistency, data density, and
  responsive behaviour of charts and tables.
- Browser extension → constrained popup/sidebar dimensions, host-page style
  leakage and isolation, theme inheritance.
- Conversational/chat interface → weight message legibility and grouping,
  streaming/typing-indicator states, clear distinction between the agent's
  output and tool-call/system activity the user shouldn't mistake for a
  direct answer, error and retry affordances when a model or tool call
  fails, and an obvious way to see or interrupt a long-running action.
  Standard form/table ergonomics mostly don't apply unless the chat surface
  embeds them.
- Monorepo or multiple surfaces → classify each surface separately and audit
  each on its own terms; note anything that should be shared between them.

Adapt everything below to the conventions ALREADY in this repo. Do not
introduce a new styling paradigm, framework or component library.

STEP 0c — VERIFY THE HARNESS FIRST
Before auditing the UI, confirm it actually renders: start the dev server (or
build), load the screens, and note any environment/config failures separately
from design findings. Save raw dev-server/build output to the run's
harness.log and summarise environment failures in 00_context.md. A blank
screen caused by a proxy port or missing env var is an environment finding,
not a UI finding — fixing the harness comes first, and polishing must wait
until screens actually render.

STEP 1 — INVENTORY
Extract and tabulate every distinct value currently used for:
- Colours (hex/rgb/named, including near-duplicates)
- Font families, sizes, weights, line-heights, letter-spacing
- Spacing/padding/margin values, border radii, border widths
- Shadows, z-index values, transition durations and easings
- Breakpoints
Flag near-duplicates (e.g. #3B82F6 vs #3b82f7, 15px vs 16px) — these are the
main symptom of AI-generated UI drift. Write the inventory table to
01_findings.md as you build it, with file:line evidence captured at the
moment you find each value.

STEP 2 — AUDIT
Review against these dimensions and record every issue found:

Visual consistency
- Ad-hoc/hardcoded values that should be tokens or variables
- Colours used inconsistently for the same semantic meaning (primary, success,
  warning, danger, info, muted, borders, surfaces)
- Typography scale sprawl; inconsistent heading hierarchy
- Inconsistent spacing rhythm, alignment, and optical balance
- Icon sizing, stroke weight and style mismatches
- Component variants that look almost-but-not-quite the same (buttons, inputs,
  cards, badges, modals, tables, tabs, alerts)

Colour & contrast
- Text contrast below WCAG AA (4.5:1 body, 3:1 large text and UI boundaries)
- Meaning conveyed by colour alone (add icon/text/pattern)
- Dark mode: missing, incomplete, or inconsistent parity with light mode
- Hardcoded colours that break theming

Readability
- Line length outside a comfortable measure (~45–75 characters)
- Line-height too tight for body copy; cramped or over-dense layouts
- Insufficient visual hierarchy — everything competing for attention
- Poor grouping/proximity; missing separation between logical sections

Record data (web-app stack: `factory/standards/stacks/web-app.md`, "Record data is in managed tables")
- Records shown as a plain table, a list of rows or a card grid instead of the
  managed table (outside the exceptions that standard names)
- A table whose columns miss fields of its record, or that shows them all by
  default instead of a relevant few with the rest in Columns
- A column a person would narrow by with no filter button in its header; a
  header filter with no accessible name or not reachable by keyboard
- A table that forgets its columns, order, sort or filters on reload, or a
  per-record table that carries one record's filters to the next

Responsiveness (mobile → desktop)
- Horizontal overflow at 320px width
- Inconsistent or arbitrary breakpoints; non-mobile-first assumptions
- Touch targets under ~44px; controls too close together
- Tables, charts, wide forms and long labels on small screens
- Navigation, modals, drawers and dropdowns at small sizes and in landscape
- Fixed heights/widths that should be fluid; missing clamp/fluid type
- Layout at 200% browser zoom; safe-area insets on notched devices
- Hover-only affordances that are unreachable on touch devices

Interaction states
- Missing or inconsistent states: default, hover, focus, active, disabled,
  loading, selected, error, read-only
- Visible focus indicators for keyboard users
- Loading treatments (skeleton vs spinner vs nothing) applied inconsistently
- Empty states, zero-result states, and first-run states missing
- Error and success feedback missing, inconsistent, or non-actionable
- Destructive actions without confirmation or undo

Forms
- Label placement, required markers, help text and validation timing
- Errors not associated with their field; unclear error copy
- Missing input types, autocomplete attributes, or sensible defaults
- Submit button state during in-flight requests

Accessibility
- Non-semantic markup where semantic elements exist
- Missing labels, alt text, accessible names, and landmark structure
- Keyboard operability, logical tab order, focus trapping in modals,
  focus return on close
- Motion that ignores reduced-motion preferences

Content & microcopy
- Inconsistent capitalisation (sentence vs title case), terminology, and tone
- Button labels that aren't clear verbs; vague headings
- Inconsistent date, time, number, currency and unit formatting
- Truncation and overflow handling for long user-generated content

Polish & perceived performance
- Layout shift on load; unsized images/media
- Inconsistent animation durations and easing; gratuitous motion
- Alignment to a consistent grid; rounded-corner and elevation consistency

STEP 3 — REPORT (do this before changing anything)
Produce a findings table: Issue | Location(s) | Severity (Critical / High /
Medium / Low) | Proposed fix | Risk. Mark any finding on a screen you deferred
per the note above as "DEFERRED — pending functional fix, see Prompt 1."
Assemble the table from 01_findings.md (which you have been appending to
throughout), write the finished report to 03_report.md, and update STATE.md.
Then propose a target token set — colour palette, type scale, spacing scale,
radii, shadows, breakpoints — derived from what's already there, consolidating
near-duplicates. Wait for my approval on the token set.

STEP 4 — FIX
Log each stage's outcome (what changed, why, what was left alone) to the
run's 03_report.md as you complete it, and keep STATE.md current, so the
work survives a session boundary. Apply changes in this order, pausing after
each stage:
1. Define tokens/variables/theme in one place
2. Replace hardcoded values with tokens (no visual change intended)
3. Consolidate duplicated components and standardise variants + states
4. Fix responsiveness and overflow issues
5. Fix contrast and accessibility issues
6. Standardise microcopy and formatting
7. Final polish pass

RULES
- Do not change application behaviour, data flow, routes or business logic.
- Preserve the existing brand and visual identity; consolidate, don't redesign.
- No new dependencies without asking first.
- Keep changes small and reviewable; explain what changed and why after each
  stage, and note anything you deliberately left alone.
- If a fix is subjective, present the options and let me choose.
```
