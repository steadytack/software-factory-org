# 01 — Reconstructed specification (awaiting approval)

No specification was supplied. Reconstructed from: `README.md` (R), `standards/stacks/web-app.md` (S), `standards/principles.md` (P), `.env.example` (E), tests and endpoint definitions (T). Confidence: H / M / L.

| Ref | Requirement | Source | Conf |
|---|---|---|---|
| SPEC-01 | Sign in with the bootstrap admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) | R | H |
| SPEC-02 | Sessions: short-lived JWT access token + refresh token in HTTP-only cookies; refresh and logout work | S, R | H |
| SPEC-03 | A signed-in user can change their own password (multi-user) | T | M |
| SPEC-04 | Login rate limit keyed on the real client IP; a locked account still admits the correct password from a clean address | R | H |
| SPEC-05 | Multi-user mode: admins create accounts, set role, disable, set password; disabling or resetting signs the user out everywhere on the next request | R | H |
| SPEC-06 | Bootstrap admin is env-managed: password re-synced at startup; cannot be deactivated, demoted or password-changed through the API | R | H |
| SPEC-07 | Roles enforced by the server: Viewer reads, comments, uploads; Editor also adds/edits sites and surveys; Admin also deletes records, manages users, uses Admin | R | H |
| SPEC-08 | Single-user mode: user endpoints 404, no Users panel, any authenticated user is admin | R | H |
| SPEC-09 | Every read endpoint returns 401 to an anonymous caller (router-level) | R | H |
| SPEC-10 | Sites: create, list, get, update; point location (map pin / BNG), address, postcode, type, status | R | H |
| SPEC-11 | Sites are archived rather than binned; permanent site delete is admin-only | R | H |
| SPEC-12 | Surveys: create, list, get, update, delete as children of a site (date, surveyor, status, summary) | R | H |
| SPEC-13 | Deleting a survey moves it (and its comments/files) to the recycle bin; admin can restore or delete permanently; items older than `TRASH_RETENTION_DAYS` are purged | R | H |
| SPEC-14 | Comments on a record: add, list, delete | R | H |
| SPEC-15 | Attachments: upload (allowlist, 10 MB cap), download, thumbnail, delete; per-user and total quotas | R, E | H |
| SPEC-16 | Photo uploads are re-encoded: rotation fixed, EXIF/GPS removed, long edge capped at 3000 px, thumbnail made; GPS reported once to the caller | R | H |
| SPEC-17 | Changelog is append-only and system-written (no delete, no manual create); entries carry the real actor | R | H |
| SPEC-18 | Notifications are system-generated, de-duplicated by link; mark-read, dismiss and delete are user-scoped | R | H |
| SPEC-19 | Dashboard stats (counts, weekly series) use `APP_TIMEZONE` for "today" | R | H |
| SPEC-20 | List queries are stable and complete: `id DESC` tiebreaker, correct totals, no duplicated or hidden rows across pages | R | H |
| SPEC-21 | Blank optional text is stored as NULL; required text rejects blank (422) on POST and PATCH; explicit null on a required field is a 422 | R | H |
| SPEC-22 | Map page (MapLibre) shows sites and surveys from the geo endpoints | R, S | H |
| SPEC-23 | Installable and offline: app shell and recent reads cached; offline writes (sites, surveys, comments, photos) queue in an on-device outbox and send in order; refused changes are kept and listed; queue is per user and survives sign-out | R | H |
| SPEC-24 | Admin export: every table as CSV in a ZIP, no password hashes, optional uploaded files, UTF-8 BOM, spreadsheet-formula neutralised | R | H |
| SPEC-25 | Demo seeder is opt-in (`SEED_ENABLED`), admin-gated, idempotent per site, marks rows `is_demo`, goes through the normal service path | R | H |
| SPEC-26 | Attachment reconciliation: `/api/admin/storage-reconciliation` (read-only), `DELETE /api/admin/orphans`, `python -m app.reconcile`, `python -m app.backfill_locations` | R | H |
| SPEC-27 | Admin page: database health, data counts and storage use, feedback email setting with test email | R, T | M |
| SPEC-28 | Feedback / bug reports: any user can submit (optional screenshot); stored; emailed when SMTP is configured; admin can list them | T | M |
| SPEC-29 | Daily backups of the database and the uploads volume with retention (`BACKUP_RETENTION_DAYS`) | R | H |
| SPEC-30 | Scheduler runs the daily jobs at `SCHEDULE_AT` (recycle-bin purge) | R | H |
| SPEC-31 | `GET /api/health` runs `SELECT 1` and returns 503 when the database is unreachable; container healthcheck and frontend dependency use it | R | H |
| SPEC-32 | `ENVIRONMENT=production` forces secure cookies, docs off, seeding off, and refuses weak `JWT_SECRET` / `ADMIN_PASSWORD` | R | H |
| SPEC-33 | `DATABASE_URL` is composed from `POSTGRES_*` unless set explicitly | R | H |
| SPEC-34 | Containers run as non-root; ports bind to 127.0.0.1; nginx sets security headers/CSP and sets `X-Forwarded-For` to the connecting address | S, R | H |
| SPEC-35 | Migrations run on backend start and `alembic check` reports no drift | R | H |
| SPEC-36 | Input validated; SQL parameterised; HTML escaped; secrets never logged | S | M |
| SPEC-37 | Frontend API types match the backend OpenAPI schema | S, R | M |
| SPEC-38 | Tests exist for the above: backend pytest, Vitest, Playwright critical journeys | S, P | M |
| SPEC-39 | Living docs the README tells you to fill in (`DESIGN_TOKENS.md`, `COMPONENT_CATALOGUE.md`) exist and match the code | R, S | L |

Not spec items (checked in STEP 2 as out-of-spec): map drawing and PDF export, profile preferences, command search, keyboard shortcuts, location helpers, colour-by layers.
