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

## Security

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
- Frontend: Vitest for components/units, Playwright for the critical user journeys only (not exhaustive e2e coverage).
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
