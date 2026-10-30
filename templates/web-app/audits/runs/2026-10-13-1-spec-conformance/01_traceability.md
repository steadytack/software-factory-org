# 01 Traceability: web-app (run 2026-10-13-1)

Status key: WORKING / BROKEN / PARTIAL / SCAFFOLDED / UNVERIFIABLE. "Dyn" = exercised against the running preview stack or a throwaway container; "Static" = read from code only. Evidence is by file (line numbers given where pinned down). Sev = H/M/L, Effort = S/M/L.

| Ref | Requirement | Status | Verified how | Evidence | Missing / note | Sev | Eff | Conf |
|---|---|---|---|---|---|---|---|---|
| SPEC-01 | Admin signs in with bootstrap credentials | WORKING | Dyn (68-check script) | api/endpoints/auth.py, core/auth.py | | | | High |
| SPEC-02 | HttpOnly cookie JWTs, refresh, logout revokes | WORKING | Dyn | auth.py | Secure flag only in production/COOKIE_SECURE (by design) | | | High |
| SPEC-03 | Password change needs current password | WORKING | Dyn | auth.py | | | | High |
| SPEC-04 | Login rate limit (ip + account buckets, 429) | WORKING | Dyn | core/rate_limit.py | Attacker blocked, clean address still gets in | | | High |
| SPEC-05 | Multi-user admin (create/disable/reset) | WORKING | Dyn | endpoints/users.py | Disable and reset revoke live sessions | | | High |
| SPEC-06 | Bootstrap admin protections | WORKING | Dyn | users.py | | | | High |
| SPEC-07 | Roles viewer/editor/admin | WORKING | Dyn | core/auth.py, endpoints | Full role matrix passes | | | High |
| SPEC-08 | Single-user mode | WORKING | Dyn (audit-single container) | users.py | /api/users 404, any user admin | | | High |
| SPEC-09 | Every read needs auth | WORKING | Dyn (17 anonymous GETs 401) | | | | | High |
| SPEC-10 | Sites CRUD | WORKING | Dyn | endpoints/sites.py | | | | High |
| SPEC-11 | Archive / delete admin-only | WORKING | Dyn | | | | | High |
| SPEC-12 | Surveys | WORKING | Dyn | | | | | High |
| SPEC-13 | Recycle bin, restore, purge by age | WORKING | Dyn incl. 40-day-old purge | services/recycle_bin.py, purge_trash.py | Purge removes rows, comment, original and thumbnail files | | | High |
| SPEC-14 | Comments | WORKING | Dyn | | | | | High |
| SPEC-15 | Attachments allowlist and quota | WORKING | Dyn (415/413/422 paths) | core/storage.py | | | | High |
| SPEC-16 | Photo re-encode, EXIF strip, thumbnail | WORKING | Dyn | core/images.py | 3000 px cap, rotation applied | | | High |
| SPEC-17 | Append-only change log | WORKING | Dyn | | Read-only, actor recorded | | | High |
| SPEC-18 | In-app notifications | SCAFFOLDED | Dyn + grep | services/notification*.py, endpoints/notifications.py | List/read/dismiss/delete work; nothing calls `notify()`. scheduler.py docstring says projects add the producing jobs, so this looks intentional | M | M | Medium |
| SPEC-19 | Dashboard + APP_TIMEZONE | WORKING | Dyn | | Counts consistent | | | High |
| SPEC-20 | Stable list queries | WORKING | Dyn (135 sites paged once each) | | | | | High |
| SPEC-21 | Blank to NULL, 422 on bad input | WORKING | Dyn | | | | | High |
| SPEC-22 | Map page | PARTIAL | Vitest + e2e journeys pass; map UI not re-driven in this run | frontend/src map components | Visual and print output was checked in earlier sessions, not by this audit | L | S | Medium |
| SPEC-23 | Offline / PWA outbox | WORKING | e2e offline journeys pass; vitest outbox | frontend outbox | Not re-driven independently | L | S | Medium |
| SPEC-24 | Admin export (ZIP) | WORKING | Dyn | export_all.py | BOM, formula neutralisation, no hashes | | | High |
| SPEC-25 | Seeder opt-in | WORKING | Dyn | | Production forces off (403); idempotent | | | High |
| SPEC-26 | Storage reconciliation | BROKEN | Dyn | reconcile.py build_report (~111-156), endpoints/admin.py ~200-220 | Thumbnails (`*.thumb.jpg`) reported as orphans: 55 false of 57 reported; `--delete` would remove valid thumbnails | H | S | High |
| SPEC-27 | Admin page: health, stats, settings, test email | WORKING | Dyn | endpoints/admin.py | Test email returns 502 with plain message when SMTP absent | | | High |
| SPEC-28 | Feedback with screenshot | WORKING | Dyn | endpoints/feedback | Fake and non-image screenshots refused | | | High |
| SPEC-29 | Backups | WORKING | Dyn (`BACKUP_ONCE=1` produced dump + uploads archive, 2.9M) | docker/backup.sh | Restore not tested | L | S | Medium |
| SPEC-30 | Scheduler | WORKING | Dyn (`NOTIFY_ONCE=1` ran and exited) | scheduler.py | Only the purge job exists | | | High |
| SPEC-31 | Health 200 / 503 | WORKING | Dyn (503 with DB stopped, 200 after restart) | main.py ~274 | | | | High |
| SPEC-32 | Production hardening | WORKING | Dyn (audit-prod, audit-weak) | core/config.py | Weak secrets refuse to start | | | High |
| SPEC-33 | DATABASE_URL composed | WORKING | Static + preview runs without it | config.py | | | | High |
| SPEC-34 | Container / nginx security | PARTIAL | Dyn | docker/nginx.conf, backend.Dockerfile | Backend runs as uid 1000; ports bound to 127.0.0.1; CSP, nosniff, frame deny, XFF overwritten with `$remote_addr`. nginx master process is root (workers are `nginx`) | L | S | High |
| SPEC-35 | Migrations / `alembic check` | WORKING | Dyn | alembic | Single head `0001_baseline`, no drift | | | High |
| SPEC-36 | Input validation, secrets not logged | PARTIAL | Static grep | | No raw SQL beyond fixed `SELECT 1` / `PostGIS_Version()`. User emails are logged on password events (PII, not secrets) | L | S | Medium |
| SPEC-37 | OpenAPI types in sync | WORKING | Dyn (regenerated from live API, 0-line diff) | frontend/src/types/openapi.d.ts | `generate:types` script points at port 8001 (the other app), not this stack's 8031 | L | S | High |
| SPEC-38 | Tests exist and pass | BROKEN | Dyn | backend/tests/test_features.py (~458) | **SyntaxError: backend suite cannot be collected.** With a patched copy 252 backend tests pass; 231 vitest + 12 e2e pass | H | S | High |
| SPEC-39 | Living docs filled in | PARTIAL | Static | README.md:115 | `DESIGN_TOKENS.md` and `COMPONENT_CATALOGUE.md` exist only in `templates/shared`, not in web-app; `frontend/DESIGN.md` is current | L | S | Low |

Not verified: real SMTP delivery (none configured), backup restore, large-scale performance.
