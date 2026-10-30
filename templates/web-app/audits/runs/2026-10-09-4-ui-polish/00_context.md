# 00 — Context (Prompt 4, UI polish)

Date: 2026-10-09 · Branch: `ui-polish` (off `main@f86de81`) · Surface: `templates/web-app/frontend`

## Prior audit logs read
None exist (`audits/runs/` was empty). So there is **no Prompt 1 deferred list**: nothing is marked BROKEN / SCAFFOLDED /
CONTRADICTED. Functional sanity was checked instead: 202 unit tests and 12 Playwright journeys pass on this stack,
and every screen below rendered with seeded data. Two things looked suspicious and are flagged in the report, not
styled: the dashboard line chart appears broken in screenshots taken <1 s after load (Recharts draw animation —
settles later; see UI-P11).

## STEP 0 — Classification
| | |
|---|---|
| Type | **Responsive web app + installable PWA** (offline outbox, service worker), with a **map-heavy** surface (MapLibre) and a **light dashboard** (Recharts). Single surface. Confidence: high. |
| Evidence | `package.json` (React 19, Vite 5, vite-plugin-pwa, maplibre-gl, recharts, Tailwind 4, shadcn/radix); `routes/`, `layout/MobileNav.tsx` + `AppSidebar.tsx` (phone and desktop shells); `pointer-coarse:` used 30×; e2e covers an offline journey. |
| Framework / styling | React + Tailwind v4 utilities; custom `@utility` blocks; shadcn/ui components in `components/ui/`; CSS variables in `styles.css` mapped through `@theme inline`. |
| Design system | **Yes, partial.** Palette comes from the Atlassian Design System (comments cite ADS tokens), light + dark, one density system (`--control-h`, `--row-py`, `--card-p`), type scale (`text-micro … text-display`), z-index and duration tokens. Radius and shadow scales exist but are not used consistently. |
| Screens | Login · Dashboard · Sites (table) · Site detail (Overview/Surveys/Comments/Attachments/History) · Surveys (table) · Survey detail · Map (+ panel/sheet) · Profile · Admin · help drawer, command palette, dialogs, sheets. |
| Shared layout primitives | `AppLayout`, `Header`, `AppSidebar` (desktop), `MobileNav` (phone), `PageHeader`, `PageSection`, `DetailLayout`, `DetailsCard`, `ManagedDataTable`, `StatCard`, `EmptyState`. |

## STEP 0b — Scope
**Applied in full:** visual consistency, colour & contrast, readability, responsiveness, interaction states (sampled),
accessibility (measured), polish. **Applied reduced:** forms (sampled on site detail + login), content/microcopy
(sampled: dates and labels are consistent). **Skipped:** native-mobile/kiosk/extension/chat items (not applicable);
component-library API docs (this is an app, not a library).

Brief from the user, in addition to the prompt: *"really give the UI a polish so the app feels more premium design
and less like it was created by AI."* The prompt says "preserve the existing brand… consolidate, don't redesign" and
"if a fix is subjective, present the options". These are reconciled as follows: the semantic structure of the
palette, the density system, the component set and all behaviour are kept; the *treatment* (surface layering,
type hierarchy, radii, elevation, chart styling, login) is refined, and each subjective choice is presented in
`03_report.md` for approval before anything is changed.

## STEP 0c — Harness
See `harness.log`. Stack runs and renders. One environment finding: a fresh database is empty (seeding is opt-in and
not run at startup), so all lists and charts are blank until `python -m app.seed` is run. Not a UI finding, but it
makes a first-run preview look broken — recorded as H-1 in the report.
