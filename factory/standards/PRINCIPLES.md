# Principles for the factory's apps

Applies to every app the factory builds: fast to build, easy to pick up after months away, protected for the data it holds, and with no more process than its tier needs. The stack-specific choices (tools, security model, structure) are in `STANDARDS.md` at the project root; read both. A project that mixes types (a web app with an agent inside) follows every stack that applies.

## 1. Tier

Set per idea (the factory records it in `state.json` and the spec; `factory/standards/tiers.md`). It decides how much of the rest applies. The data it uses and the protection that data and its users need are decided separately and apply at every tier (`security.md`).

| Tier | For | Treatment |
|---|---|---|
| 1 Spike | One question, fast | Normal stack (so it can grow), the main path tested, no scanning or formal docs. Decide up front what would make you grow, keep or bin it |
| 2 Prototype | People using it and reacting, to refine the idea | Per-user login, secrets out of the repo, tests per requirement and for permissions, data integrity and tricky logic, backups it can be recovered from, one README. Simple underneath (one instance, simple storage) |
| 3 Production app | Being relied on | Add: hardening, monitoring, tested recovery, firmer test coverage (failure, concurrency, load where the spec sets it), a runbook, a named owner and support |

## 2. Code rules

- Simple over clever. No speculative config, abstractions or extensibility for a second use that does not exist (YAGNI).
- Functions target ~20 lines, ~50 is the hard ceiling; files ~100–200 lines. A function you cannot describe in one sentence without "and" should be split.
- Abstract on the third repetition, not the first or second.
- Name things with specific verbs and nouns (`calculate_total_tax`, not `calc`). If a comment explains *what*, rewrite the code; comments explain *why*.
- Types are mandatory, in whatever form the language supports.
- Composition over inheritance. No global mutable state. Specific exceptions. No boolean flag parameters.
- Latest stable packages; remove unused ones. Before adding one, confirm on its registry that it exists under that exact name and is maintained and widely used (`security.md`): never install a name you have not checked. Prefer changing existing code to writing a parallel version.
- Before writing code, take the first option that fully works: not needed at all; already in this codebase (a helper, component, pattern), used as the surrounding code uses it; the standard library or a native platform feature (`<input type="date">` before a date-picker); a dependency already installed; only then the minimum new code. Never add a dependency for a few lines. Lazy about the solution, never about its scope: the callers, tests and fixtures the change breaks are part of it, and validation, security, data-loss handling and accessibility are never cut.
- A known limit taken on purpose gets a one-line comment `shortcut: <the limit>, <when to upgrade>` (for example `shortcut: loads the whole file, stream it past ~100 MB`). Audits treat it as a recorded decision, not a finding, unless the expected load already crosses it.
- Document public interfaces and anything non-obvious. Skip the obvious.

## 3. Architecture

- Entry points (API handlers, CLI commands, pipeline orchestration, an agent loop) parse input, call logic, format output. The logic lives elsewhere and is testable alone.
- Storage and external integrations (database, filesystem, third-party APIs, LLM providers) sit behind adapters or services, so the logic can be tested without them and a stand-in (DEF-24) can take their place. Do not thin-wrap a good library or the ORM just so it could be swapped, and use the database's own features where they help: a swap that is not planned is not a requirement.
- Dependencies point one way: entry point → logic → data access → storage.
- Configuration is injected, read from environment variables or an uncommitted `.env`, and validated at startup (fail fast).
- Make code testable without live infrastructure: a mockable adapter beats a hard-coded call.
- An app that calls a language model (or another trained model) while it runs also follows `standards/ai-features.md`.

## 4. Practices

- **Logging and errors:** structured logging, no bare `print`/`console.log`. Do not swallow exceptions; wrap third-party ones where useful. User-facing messages stay safe, diagnostic detail goes to logs. (Agents are an exception: log tool calls and decisions, see `STANDARDS.md`.)
- **Data:** UUIDv7 keys by default (serial ints for small tables); created/updated timestamps where "when" matters; parameterised queries always; indexes only where data is large or hot; reversible migrations where practical.
- **Testing:** no coverage target. Test security- and credential-sensitive code, anything that could write data incorrectly, and genuinely tricky logic. Write a requirement's test from its acceptance criterion before the code, with expected values from the spec, never copied from the code's output; never weaken a test to make it pass. Tools are in `STANDARDS.md`.
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
