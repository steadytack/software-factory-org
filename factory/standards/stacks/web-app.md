# Stack: Web Application

Use alongside `standards/PRINCIPLES.md`. This covers a project with both a frontend and a backend — a dashboard, an internal tool, a service with a UI.

## Technology Stack

- **Backend:** Python, FastAPI
- **Frontend:** TypeScript, React 19, Vite, shadcn/ui
- **Database:** PostgreSQL with PostGIS (when geospatial is needed)
- **Containerisation:** Docker and Docker Compose for local dev and deployment

### Backend

| Area | Technology |
|---|---|
| API | FastAPI |
| ORM / migrations | SQLAlchemy 2.0 (async), Alembic |
| Validation / config | Pydantic 2, pydantic-settings |
| Dependency management | Poetry |
| HTTP client | httpx |
| Logging | structlog (basic structured logging, not a full observability stack) |
| Tools | ruff, black, isort, pytest, coverage |

### Frontend

| Area | Technology |
|---|---|
| Framework | React 19, TypeScript, Vite |
| Routing | React Router |
| UI components | shadcn/ui |
| Data fetching | TanStack Query |
| Type sync | openapi-typescript + openapi-fetch, generated from FastAPI's OpenAPI schema |
| Mapping | MapLibre GL JS |
| Tools | eslint, prettier, Vitest, Playwright |

Dropped from the enterprise stack as unnecessary weight for solo projects: Redux Toolkit (TanStack Query covers most state needs), MapServer (MapLibre GL JS is lighter and does the job), MSAL/Entra ID (see Security below).

## Architecture checks

The rules in `standards/PRINCIPLES.md` 2 and 3 are checked by the template's own lint, so a change that breaks them fails `verify.py` rather than waiting for a review:
- **Backend layering** (`lint-imports`, import-linter; contracts in `backend/pyproject.toml`): `api` → `services` → `repositories` → `models`, never upward; `core` and `schemas` never import `api`, `services` or `repositories`.
- **Backend code rules** (ruff): complexity at most 12 (`C90`), at most 50 statements per function (`PLR0915`), no `global` (`PLW0603`), no boolean positional parameters (`FBT001`, `FBT002`: make them keyword-only).
- **Frontend layering** (eslint `no-restricted-imports`, `frontend/eslint.config.js`): `api` imports none of the layers above it; `hooks` no components, pages, layout or routes; `components` no pages, layout or routes.
- **An exception** is named where it is made, with its reason: a `# noqa: <rule> -- why` line, or an `ignore_imports` entry with a comment. Never a blanket ignore.
- **SBOM** (protection C and D, `security.md`): `cyclonedx-py requirements backend/requirements-dev.txt -o sbom-backend.cdx.json` (the `cyclonedx-bom` package; the file lists the runtime packages first, then the dev tools) and `npx @cyclonedx/cyclonedx-npm --output-file sbom-frontend.cdx.json` in `frontend/`; commit both before the Publish dry run.
- **Not linted:** React component length (most pages and panels are long JSX). The refactor and hardening audit looks at it instead.


Security still matters even when you're the only user — the app may sit on the open internet.

- **Auth:** single-admin-user model. Password hashed with bcrypt or argon2. Short-lived JWT access token + refresh token via PyJWT. HTTP-only, secure cookies. HTTPS even in local dev.
- Secrets never hardcoded — environment variables or a secret store.
- All external input validated; parameterised SQL always.
- HTML output escaped; least privilege applied throughout.
- Secrets and credentials never logged.
- Containers run as non-root, least privilege, no unnecessary exposed ports.

Dropped: full OAuth2/Entra ID enterprise identity — that solves a multi-user, multi-tenant problem you don't have. Revisit if this project ever gets multiple real users with their own accounts.

## Testing

- Backend: pytest.
- Frontend: Vitest for components/units, Playwright for the critical user journeys only (not exhaustive e2e coverage). Every spec imports `test` and `expect` from `tests/e2e/fixtures.ts`, so a journey fails on a console error, a page error or a 5xx; a test expecting one says so with `test.use({ allowedErrors: /.../ })`. A new page is added to `tests/e2e/accessibility.spec.ts`.
- See `standards/PRINCIPLES.md` section 4 (Testing) for what to prioritise testing.

## Project Structure

```
backend/
  app/
    api/
      endpoints/
    external/
    services/
    repositories/
    models/
    schemas/
    core/
  tests/
frontend/
  src/
    components/
    pages/
    hooks/
    api/
    types/
    routes/
  tests/
docker/
scripts/
```

## Living Reference Documents

Two living documents live in `templates/web-app/`, separate from this file because they get updated constantly as you build (unlike this stack list, which is mostly static):

- **`templates/web-app/COMPONENT_CATALOGUE.md`** — every reusable component/block: purpose, states, variants, and which pages use it. Update it whenever you add or change a block.
- **`templates/web-app/DESIGN_TOKENS.md`** — colours, typography, spacing, and theme. Fill in once per project (or once for the template, then adjust per spin-off).

Copy both into a new project alongside this file.
