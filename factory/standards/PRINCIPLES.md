# Principles for Personal Projects

Applies to any personal project: fast to build, easy to pick up after months away, secure enough to expose, and free of process that only pays off with a team. The stack-specific choices (tools, security model, structure) are in `STANDARDS.md` at the project root; read both. A project that mixes types (a web app with an agent inside) follows every stack that applies.

## 1. Hardening level

Set per project (the factory writes it in `SPEC.md`). It decides how much of the rest applies.

| Level | For | Treatment |
|---|---|---|
| Prototype | Spike or proof of concept | Normal stack (so it can be promoted), minimal tests (enough to show the concept works), no scanning or formal docs, mocks as thin as possible. Decide up front what would make you keep, rework or bin it |
| Personal (default) | One user, kept running | Everything below. Auth on, secrets out of the repo, tests for security, data integrity and tricky logic, one README |
| Shared | Several real users, untrusted uploads, or handed to someone else | Add: per-user accounts and roles, upload scanning, rate limiting, audit trail, runbook and firmer test coverage. Enterprise identity (Entra ID/OAuth2) and monitoring stacks (OpenTelemetry/Prometheus) are still dropped unless truly needed |

## 2. Code rules

- Simple over clever. No speculative config, abstractions or extensibility for a second use that does not exist (YAGNI).
- Functions target ~20 lines, ~50 is the hard ceiling; files ~100–200 lines. A function you cannot describe in one sentence without "and" should be split.
- Abstract on the third repetition, not the first or second.
- Name things with specific verbs and nouns (`calculate_total_tax`, not `calc`). If a comment explains *what*, rewrite the code; comments explain *why*.
- Types are mandatory, in whatever form the language supports.
- Composition over inheritance. No global mutable state. Specific exceptions. No boolean flag parameters.
- Latest stable packages; remove unused ones. Prefer changing existing code to writing a parallel version.
- Document public interfaces and anything non-obvious. Skip the obvious.

## 3. Architecture

- Entry points (API handlers, CLI commands, pipeline orchestration, an agent loop) parse input, call logic, format output. The logic lives elsewhere and is testable alone.
- Storage and external integrations (database, filesystem, third-party APIs, LLM providers) sit behind adapters or services, so a swap touches one place.
- Dependencies point one way: entry point → logic → data access → storage.
- Configuration is injected, read from environment variables or an uncommitted `.env`, and validated at startup (fail fast).
- Make code testable without live infrastructure: a mockable adapter beats a hard-coded call.

## 4. Practices

- **Logging and errors:** structured logging, no bare `print`/`console.log`. Do not swallow exceptions; wrap third-party ones where useful. User-facing messages stay safe, diagnostic detail goes to logs. (Agents are an exception: log tool calls and decisions, see `STANDARDS.md`.)
- **Data:** UUIDv7 keys by default (serial ints for small tables); created/updated timestamps where "when" matters; parameterised queries always; indexes only where data is large or hot; reversible migrations where practical.
- **Testing:** no coverage target. Test security- and credential-sensitive code, anything that could write data incorrectly, and genuinely tricky logic. Tools are in `STANDARDS.md`.
- **Performance:** avoid needless queries and O(n²); paginate or stream large data; profile before optimising.
- **Docs:** one `README.md` per project: setup, running, tests, deployment, gotchas.
- **Containers** (when the project has real dependencies): Docker Compose, non-root, official base images, multi-stage where it helps. A periodic manual image check is enough unless the project is public-facing with real credentials.

## 5. Working with an AI assistant

**Before a task:** confirm which stack applies; read `NOTES.md` for the current task; check the actual code, not just the notes (the code is the source of truth); read anything the task references.

**Ask before:** changing architecture or layering; adding a technology or dependency not in the stack; touching a security or data boundary (auth, what is exposed, how sensitive data is stored or logged); changing a public contract (API shape, function signature others use, a schema others depend on). The factory is the exception: it decides, logs the decision in the project's `decisions.md`, and asks only for the cases in `factory/README.md`.

**Precedence if instructions conflict:** the user's current instruction; this file and `STANDARDS.md`; decisions recorded in `NOTES.md`; the code's established pattern. Ask if two at the same level disagree.

**Loop:** plan (large tasks) → implement → quick validation → update `NOTES.md` → review.
- A task touching more than ~5 files needs a short plan first: files, order, and the exact checks that define done.
- Quick validation fits the change: lint and a manual check for most things; the relevant tests for anything security- or data-sensitive.
- Leave the project working after every task. Summarise what changed, how to verify it, and anything worth knowing.

**Working efficiently:** read each file once and batch reads; summarise what you know before a multi-step change; if the same call fails twice for the same reason, change approach; if you notice you are looping, say so and summarise before continuing; end by running the exact checks that define done and report their actual output.

**Resuming after a gap:** before coding, establish what is verified by code or tests (not just claimed in notes), the real state of the current task, and the single safest next action. A paragraph is enough.

**Never:** delete functionality without checking; rewrite working code outside the task; change a public interface silently; ignore a failing test; mark something done before confirming; claim a check ran when it did not.

## 6. Tracking work

One file, `NOTES.md` at the project root, with three parts: **Current** (task, status, last updated), **Gotchas** (non-obvious environment facts: ports, env vars, flaky tests; written once, never debugged twice) and **Done** (newest first, one line per finished piece). No IDs, milestones or planning phases.

## 7. Periodic audits

Four prompts in `factory/audits/` are pasted whole into a fresh session for deeper checks, in this order: spec conformance, refactor and hardening, data integrity, UI polish (skip for headless systems). Run them before showing a project to anyone or when something feels off. They are not part of the normal task loop.
