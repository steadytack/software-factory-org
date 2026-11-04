# Web App Template

Starter for a map-capable web app, implementing `standards/PRINCIPLES.md` and `STANDARDS.md`: FastAPI + React 19 + PostGIS, single-admin auth (with an optional multi-user mode with roles), and one worked example domain — **sites** (a point on a map) with **surveys** (visits to a site) — plus a MapLibre map page, comments, file attachments (photos stripped of EXIF), a notification bell, a changelog, a recycle bin and offline working.

The example domain is deliberately small. It exercises every layer (model → repository → service → endpoint → page → test) and the parent/child relation; replace it with your own (see *Starting a new project* below).

## Single-user vs multi-user

Set `MULTI_USER_ENABLED` in `.env`:

- **`false` (single-user app)** — the common case for a personal project. Only the bootstrap admin (from `ADMIN_EMAIL`/`ADMIN_PASSWORD`) can sign in; user-management endpoints return 404 and the Admin page shows no Users panel. Any authenticated user is treated as an admin.
- **`true` (multi-user)** — admins create accounts, give each a role, disable access and set passwords via `/api/users` and the Admin page. Disabling an account or resetting its password signs it out everywhere on its next request. The bootstrap admin is env-managed: its password is re-synced from `.env` at startup and it cannot be deactivated, demoted or password-changed through the API.

### Roles

| Role | Can |
|---|---|
| **Viewer** | Read everything, comment, upload files |
| **Editor** | …and add and edit sites and surveys |
| **Admin** | …and delete records, manage users, use the Admin page |

The server enforces these (`require_role` in `backend/app/core/auth.py`); the UI only hides what a role can't use.

## Run locally

```bash
cp .env.example .env          # then edit values
docker compose up --build
```

- Backend: http://localhost:8001 (OpenAPI docs at `/docs`)
- Frontend: http://localhost:5174

Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`.

## Layout

```
backend/app/    api/endpoints, services, repositories, models, schemas, core
frontend/src/   components, pages, hooks, api, types, routes
docker/         Dockerfiles + nginx config
```

## Development

- Backend tests: `cd backend && pytest` (needs the compose `db` running — tests use `localhost:$DB_PORT/app_test`, default `5434`; the suite recreates that database's tables, so it never touches the app database)
- Lint and format: `cd backend && ruff check app tests migrations && ruff format --check app tests migrations` (ruff replaces black and isort)
- Frontend tests: `cd frontend && npm test`
- Browser journeys (Playwright): with the stack up and `MULTI_USER_ENABLED=true`, `cd frontend && set -a && . ../.env && set +a && PLAYWRIGHT_BASE_URL=http://localhost:5174 npx playwright test`. They create `e2e-*` users and `E2E Site ...` records; CI runs them against a fresh stack. Specs import `test` from `tests/e2e/fixtures.ts`, which fails a journey on a browser console error, an uncaught page error or a 5xx (a test that expects one sets `test.use({ allowedErrors: /.../ })`); `accessibility.spec.ts` runs axe (WCAG 2.1 A and AA) on the login page and each main page, so add a new page to its list.
- Frontend lint: `cd frontend && npm run lint`
- Regenerate API types after changing endpoints: `cd frontend && npm run generate:types` (expects the backend on port 8001)
  - The running container has the code it was built with. To regenerate from your working tree without rebuilding, dump the schema from the app object and feed that file to `openapi-typescript` (`backend/.venv/Scripts/python -c "import json; from app.main import app; json.dump(app.openapi(), open('openapi.json', 'w'))"`, then `node node_modules/openapi-typescript/bin/cli.js ../backend/openapi.json -o src/types/openapi.d.ts`).
- Migrations: `cd backend && alembic upgrade head`, then `alembic check` — it must say "No new upgrade operations detected". CI does both on a fresh database. Alembic looks only at the `public` schema, so the PostGIS `tiger` and `topology` tables in the development database do not show up as drift.

## Operations

### Backups

The `backup` compose service writes a `pg_dump` of the database and a tarball of the uploads volume to `./backups` once a day, keeping `BACKUP_RETENTION_DAYS` (default 14) days. **Copy `./backups` off this machine as well** — a backup on the same disk doesn't survive losing the disk.

- Take one now: `docker compose run --rm -e BACKUP_ONCE=1 backup`
- Restore the database (replaces current data):
  ```bash
  docker compose stop backend
  docker compose exec -T db dropdb -U $POSTGRES_USER $POSTGRES_DB
  docker compose exec -T db createdb -U $POSTGRES_USER $POSTGRES_DB
  docker compose exec -T db pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --no-owner < backups/db-<stamp>.dump
  docker compose start backend
  ```
- Restore the files: `docker compose run --rm -v "$PWD/backups:/backups" --entrypoint sh backup -c "tar -xzf /backups/uploads-<stamp>.tar.gz -C /uploads"` (drop `:ro` from the backup service's uploads mount first).

### Recycle bin and export

Deleting a survey moves it (and anything recorded under it) to the **recycle bin** in Admin, where an admin can restore it or delete it permanently. Items older than `TRASH_RETENTION_DAYS` (default 30) are purged by `python -m app.purge_trash`. Sites are archived rather than binned; deleting a site is permanent and admin-only.

Admin › Export downloads every table as CSV in one ZIP (password hashes are never included), optionally with the uploaded files. The files start with a UTF-8 byte-order mark so Excel shows accents correctly, and text that starts with `=`, `+`, `-` or `@` is prefixed with an apostrophe so a spreadsheet shows it instead of running it (plain negative numbers are left alone).

### On site: installable and offline

The production build is an installable app (web manifest + service worker via `vite-plugin-pwa`; not active in `npm run dev`). It caches the app and recent API reads, so pages open without signal. Writes made offline (new or edited sites, surveys, comments, and photo uploads) are kept in an on-device outbox (`frontend/src/lib/outbox.ts`) and sent in order when the connection returns; the cloud chip in the header shows what's waiting, with Send now / Discard. A change the server refuses (for example the record was deleted meanwhile) is kept and listed there, and is only sent again when you choose Send now; a server hiccup retries by itself. Queued changes only send for the user who made them, from one tab at a time, and they stay on the device after sign-out (signing out clears the cached records, not the waiting changes). Service workers need HTTPS (or localhost).

### Photos and quotas

JPEG/PNG/WebP uploads are re-encoded: rotation fixed, all EXIF metadata (GPS, device) removed, long edge capped at 3000 px, and a thumbnail made. Uploads are limited by `UPLOAD_QUOTA_MB_PER_USER` and `UPLOAD_QUOTA_MB_TOTAL`.

### Scheduled jobs

The `scheduler` compose service runs the daily jobs at `SCHEDULE_AT` (default 07:00, `APP_TIMEZONE`): the recycle-bin purge. Add your own jobs to `run_jobs` in `backend/app/scheduler.py` (for example a sweep that calls `services.notification.notify()` for each active user). Run the jobs once by hand with `docker compose run --rm -e NOTIFY_ONCE=1 scheduler`. The individual jobs:

- `docker compose exec -T backend python -m app.reconcile` — report on attachment files vs rows.
- `docker compose exec -T backend python -m app.backfill_locations [--apply]` — fill missing postcodes/addresses from each site's pin (one-off).

### Health

`GET /api/health` runs `SELECT 1` and returns 503 when the database is unreachable; the backend container's healthcheck uses it and the frontend waits for it.

### Dependencies

`backend/poetry.lock` pins every backend dependency; the Docker build installs exactly that. To upgrade, run `poetry lock` **inside a Linux container on a copy of the two files** — never with `backend/` mounted, or poetry can replace your local `.venv` with a Linux one — and commit the lock:

```bash
mkdir -p /tmp/lock && cp backend/pyproject.toml backend/poetry.lock /tmp/lock/
docker run --rm -v /tmp/lock:/src -w /src -e POETRY_VIRTUALENVS_CREATE=false python:3.12-slim sh -c "pip install -q 'poetry>=2,<3' && poetry lock"
cp /tmp/lock/poetry.lock backend/poetry.lock
```

`APP_TIMEZONE` (default `Europe/London`) decides which calendar date is "today" for the dashboard's weekly counts.

## Starting a new project

1. Copy this folder, give the compose file a new `name:` and set `DB_PORT` / `BACKEND_PORT` / `FRONTEND_PORT` in `.env` so it can run beside other stacks. Replace the display name in `frontend/src/lib/brand.ts`, `frontend/index.html` and `frontend/vite.config.ts`, and the `webapp` prefix on browser storage keys (search for `webapp`) so projects on one origin never share cached data.
2. Replace the example domain with your own: models, schemas, repositories, services, endpoints, tests and the baseline migration (`backend/migrations/versions/0001_baseline.py` — delete it and `alembic revision --autogenerate` a new one). The generic CRUD factory (`api/endpoints/crud.py`, `repositories/base.py`, `services/base.py`) and the frontend `createCrudHooks` factory make a new entity a short declaration. Surveys show the child-of-site pattern; to bin another entity see the notes at the top of `services/recycle_bin.py`, and to map one see `components/map/layers/pointLayers.ts`.
3. Update `frontend/src/routes`, the pages and nav, or delete the map page.
4. Regenerate the OpenAPI types (below).
5. Fill in `DESIGN_TOKENS.md` and `COMPONENT_CATALOGUE.md` (they are in this folder).
6. **Regenerate all credentials in `.env`** (DB password, `ADMIN_PASSWORD`, `JWT_SECRET`) — never ship the template's values into a new project. Only `.env.example` should be committed; `.env` is gitignored but travels with folder copies.

## Gotchas

- Cookies are scoped to the frontend origin through the nginx proxy (`/api/`) — don't call the backend origin directly from the browser.
- `COOKIE_SECURE` must be `false` for local http:// development (browsers drop Secure cookies on plain HTTP) and `true` in any HTTPS deployment. The backend logs a loud warning at startup when it is `false` — never ignore it in a deployed environment.
- `DOCS_ENABLED` defaults to `true` for local development. Set it to `false` in any deployment reachable from the internet so the OpenAPI schema isn't publicly exposed.
- All compose ports are bound to `127.0.0.1` (db 5434, backend 8001, frontend 5174 by default; set `DB_PORT` / `BACKEND_PORT` / `FRONTEND_PORT` to change them) so nothing is reachable from the LAN. Remove the `127.0.0.1:` prefix only when you deliberately want external access.
- The login rate limiter keys on the client IP; the backend runs with `--proxy-headers` (trusting only private/docker addresses) and nginx **sets** `X-Forwarded-For` to the connecting address, so it sees the real client and a client can't spoof one. A locked account still lets the correct password in from an address that hasn't been failing, so an attacker can't lock the real user out.
- `ENVIRONMENT=production` forces `COOKIE_SECURE=true`, `DOCS_ENABLED=false` and `SEED_ENABLED=false`, and the backend refuses to start with a short or placeholder `JWT_SECRET` / `ADMIN_PASSWORD`.
- Attachment uploads are restricted to an allowlist of content types (`ALLOWED_CONTENT_TYPES` in `backend/app/core/storage.py`) and capped at 10 MB.
- Alembic migrations run automatically on backend container start; create new ones with `alembic revision --autogenerate -m "..."`.
- Rotating `JWT_SECRET` invalidates all existing sessions (users must log in again). Rotating the database password requires updating `.env` **and** the Postgres role inside the volume (or recreating the volume with `docker compose down -v`).
- **Reads require authentication.** Every list/get endpoint (sites, surveys, comments, attachments, changelog, stats) returns 401 to an anonymous caller; writes additionally require a role (see Roles). This is enforced at the router level, so new routes inherit it.
- **The changelog is append-only and system-written.** There is no delete endpoint and no manual-create endpoint — entries are recorded by the services with the real actor. An admin-writable audit log is not an audit log.
- **Notifications are system-generated.** Your code creates them with `services.notification.notify()` (deduplicated by `link`); there is no manual-create endpoint (an app cannot forge its own alerts). Mark-read / mark-all-read / delete are user-scoped — a user only ever sees and modifies their own rows.
- **The demo seeder is opt-in and admin-gated.** `POST /api/admin/reseed` and `python -m app.seed` both require `SEED_ENABLED=true`; it defaults to **false**, so demo data is not reachable in a deployment just because the caller is an admin (it returns 403). It seeds only domain rows (never users), writes through the same Pydantic schema → service → repository path the API uses (so seeded rows are validated and appear in the changelog, attributed to the actor `seed`), and marks every row `is_demo = true`. Idempotency is **per site**, matched on the normalised name — a database holding real sites can still be seeded, and a half-seeded database can be repaired.
- **`DATABASE_URL` is composed from the `POSTGRES_*` parts** unless you set it explicitly (an explicit value always wins, for a managed database with its own connection string). This keeps the password in one place; it used to be written twice in `.env`, so rotating one copy broke the backend silently.
- **Blank text is stored as `NULL`, never `""`.** Optional text is trimmed and a blank result becomes null; required text rejects blank with a 422, on `PATCH` as well as `POST`. An explicit `null` on a *required* field is a 422 (it used to fall through to the NOT NULL constraint and surface as a misleading 409).
- **Every list query carries `id DESC` as a sort tiebreaker.** Postgres freezes `now()` per transaction, so rows written together share a `created_at` exactly, and offset pagination over `ORDER BY created_at DESC` alone returns some rows twice and makes others invisible — while `total` stays correct, so nothing looks wrong. Add the tiebreaker to any new list query.
- **Attachment file bytes are reconciled with their rows by `python -m app.reconcile`** (dry run by default; `--delete` removes orphan files). `DELETE /api/admin/orphans` only works rows→files, so a file whose row is already gone is unreachable by it. `GET /api/admin/storage-reconciliation` reports the counts both ways, read-only.
- **The bootstrap admin is seeded in the app lifespan**, not via `asyncio.run()` at import time — the latter creates a second event loop and breaks the asyncpg pool ("Future attached to a different loop").
