# 00 — Context (Prompt 1: spec conformance, web-app template)

Run: 2026-10-13. Git base: `main` @ 5474446 (merge of PR #7).

## Classification
- **Monorepo-style full-stack web application**: FastAPI backend (`backend/app`), React 19 / Vite frontend (`frontend/src`), PostgreSQL + PostGIS, nginx, plus a `scheduler` job container and a `backup` container.
- Also: worker/scheduled jobs (`app.scheduler`, `app.purge_trash`, `app.reconcile`, `app.backfill_locations`, `app.seed`).
- Not an agent, CLI product or library.

## Entry points and public surface
- HTTP API: 43 paths under `/api` (list in `harness.log`): auth, users, sites, surveys, comments, attachments, changelog, notifications, stats, map, admin, feedback, health.
- Screens (frontend routes): Login, Dashboard, Sites, Site detail, Surveys, Survey detail, Map, Profile, Admin.
- Jobs: scheduler (daily recycle-bin purge), `python -m app.reconcile`, `python -m app.backfill_locations`, `python -m app.seed`, `python -m app.purge_trash`, backup service (`docker/backup.sh`).

## Execution access in this session
- Can: use the running preview stack (compose project `web-app-template`: web :5194, api :8031, db :5465), call the API with curl/cookies, drive the UI with Playwright (headless Chromium), run Vitest and the 12 Playwright journeys, exec into the backend container, read logs.
- Cannot / constraints: the backend `pytest` suite needs a database at `localhost:$DB_PORT/app_test` (default 5434), and 5434 belongs to the user's own app (`app-template-v2`), which must not be touched. Backend tests are therefore NOT run unless a throwaway database is approved (see STATE.md question Q-1). SMTP is not configured, so email sending can only be verified up to "not sent".

## Harness status (STEP 0c) — see `harness.log`
- Backend healthy (`/api/health` 200, database ok); frontend 200; 5 compose services up.
- Frontend: 231 Vitest tests pass; 12 Playwright journeys pass.
- No environment failures found.
- Preview `.env` is throwaway (SEED_ENABLED/MULTI_USER settings differ from production defaults); noted where it matters.

## Prior logs used
- `audits/runs/2026-10-09-4-ui-polish/` (UI audit; out of scope here).
