# 03 — Report (Prompt 4, UI polish) — STEP 3, awaiting approval

Nothing in `frontend/` has been changed yet. Evidence: `01_findings.md`. Deferred screens (Prompt 1): none.

## Bottom line
Accessibility and structure are already good (AA contrast everywhere, no overflow at 320 px, every control named,
one `<h1>` per page, 202 + 12 tests green). What makes it read as *generated* rather than *designed* is not a lack of
polish in the details — it is **sameness**: one blue, one border style, one text size, one radius soup. A
product that looks premium has a clear order of importance (big numbers, quiet chrome), surfaces that sit at
different heights, restraint in colour, and a handful of considered signature touches. The plan below gets there
**without a new dependency, a new component library or any behaviour change**, by working in the tokens first so
most of the lift comes from changing ~40 lines of `styles.css`.

## Findings
Severity = effect on the "premium / not-generated" goal and on usability. Risk = chance of regressions.

### A. Premium & identity (subjective → options in "Decisions")
| ID | Issue | Where | Sev | Proposed fix | Risk |
|---|---|---|---|---|---|
| P1 | **Flat type hierarchy.** Body 14, page title 20, KPI numeral 20 vs 12 px label; everything is Inter 14/500. Nothing leads the eye. | `styles.css:224-237`; `PageHeader.tsx`; `ui/stat-card.tsx:58`; dashboard | High | New scale (below): page title 24/30, KPI numeral 32/36 tabular, section 15/22, body 14/22, tracking −0.02 em on headings ≥ 18 px. Drop `font-bold`, keep 400/500/600/650. | Low |
| P2 | **Structure is all outlines.** White cards on a white page, 1 px border on every region, sidebar tinted blue; no surface hierarchy, so the UI feels "wireframe". | `--background/--card/--border`; `card.tsx`; `DetailsCard.tsx`; `ManagedDataTable`; `AppSidebar` | High | Three surfaces: **canvas** (page), **raised** (cards, tables, white + soft shadow), **sunken** (table heads, inset wells). Hairline drops from ~14 % to ~8 % ink. Sidebar becomes neutral. Fields stay on white (keeps 3:1). | Med (visual only; touches every card) |
| P3 | **Electric default blue used for large areas** (login half-screen `#0c64df`, bars, KPI icon chips, focus). Reads as "SaaS template". | `LoginPage.tsx`; `--primary`; `dashboard-charts.tsx` | Med | Reserve brand colour for primary actions, selection and focus. Option A/B/C in Decisions. | Low |
| P4 | **Charts look like library defaults:** one neon blue for both *Draft* and *Completed*, −45° x-labels, dashed grid, hollow dot markers, 10–11 px axis text, draw-in animation on every visit. | `dashboard-charts.tsx:37-61`; `ui/chart.tsx`; `DashboardPage.tsx:248` | High | Semantic bar colours (draft = amber ramp, completed = green ramp), horizontal labels, hairline solid grid, 4 px bar tops, soft area fill under the line, 12 px ticks, glass tooltip, animate once. | Low–Med |
| P5 | **Table toolbar = 7 identical unlabeled icon buttons** and a primary `+` icon; table card stretches to the viewport with ~480 px of empty bordered white under 6 rows. | `ui/ManagedDataTable.tsx`, `SitesPage.tsx`, `SurveysPage.tsx` | Med | Group: search + filter left; **View** (columns, density, settings) as one menu; bulk-edit/export/saved-views grouped; primary becomes labelled **Add site**. Table card hugs its content; empty area is plain canvas. **Changes layout, not behaviour — needs your OK.** | Med |
| P6 | **Login is generic:** flat blue half-screen, stock wave lines, narrow card with a heavy border. | `LoginPage.tsx`, `components/brand/*` | Med | Deep-ink panel with inline-SVG topographic contour lines that echo the product (maps), larger heading, card without box border. No new assets. | Low |
| P7 | **Active nav item is signalled three ways** (blue tint + left bar + filled pill) and the brand lock-up truncates ("Web App Templ…"). | `AppSidebar.tsx:38,74-78`; `ui/sidebar.tsx:475` | Low | One signal (soft filled pill + primary text); wrap/shorten the subtitle. | Low |
| P8 | **Radius soup** — see inventory. 5 common radii + 6 arbitrary, resolving to 1.2/3.2/5.2/7.2/11.2 px. | `styles.css:62,202-221`; `button.tsx:25-32`; `input-group.tsx`; 250 `rounded*` uses | Med | Four steps: `sm 6`, `md 8` (controls), `lg 12` (cards, popovers), `xl 16` (dialogs, sheets); `full` for pills and avatars. Map plain `rounded` → `md`. | Low |
| P9 | **Elevation is nearly invisible in light mode** (1 px-line "raised" shadow) so cards look flat. | `styles.css:65-66` | Low | Two soft layered shadows (below); keep dark mode's inset highlight. | Low |
| P10 | **Icon stroke 2 px at 16 px** looks heavy beside 14 px text. | all `lucide-react` | Low | `svg.lucide { stroke-width: 1.75 }` in base layer. | Low |
| P11 | **Motion is minimal and uneven:** colour transitions only; chart draw-in replays each visit (screenshots <1 s after load show a half-drawn line); skeleton/loading treatment not audited this pass. | `dashboard-charts.tsx`; `--duration-*` | Low | Add `--duration-slow 300 ms`; animate charts once; subtle 150 ms surface/hover transitions; keep reduced-motion handling (already present). | Low |

### B. Consistency / drift
| ID | Issue | Where | Sev | Fix | Risk |
|---|---|---|---|---|---|
| C1 | **Map/draw colours hard-coded in JS** — 39 distinct hex values, seven blues, Tailwind-default palette and maplibre-draw defaults that don't match the brand or the status tokens. | `useMapLayers.ts:68-81`, `maplibreAdapter.ts:119,125`, `useMapDraw.ts:62,559`, `pointLayers.ts:73-74,292`, `overlay.ts:70-247`, `engine.ts:163-263`, `types.ts:66` | Med | Read colours from the same tokens (`getComputedStyle` once, theme-aware); keep the user-pickable layer palette but derive it from the new ramp. | Med (map rendering; covered by e2e map tests) |
| C2 | Off-scale type `text-[13px]`, `text-[11px]`, `text-[0.8rem]` | `Header.tsx:89`, `AppSidebar.tsx:78`, `calendar.tsx:93,102` | Low | → `text-xs` / `text-micro`. | Low |
| C3 | Three "bold"s (`font-bold` ×11, `font-semibold` ×43, 650 in title/display tokens) | see inventory | Low | One: 600 for UI, 650 for headings. | Low |
| C4 | Spacing rhythm: 24 `gap` values, 31 padding combos, ~120 half-step uses | repo-wide | Low | 4 px grid; allowed steps 1, 1.5, 2, 3, 4, 6, 8; cards `p-5` desktop / `p-4` phone; page gutter 24/32. Snap only where visibly off. | Low |
| C5 | Literal `bg-white` | `slider.tsx:51`, `AttachmentPreviewDialog.tsx:109` | Low | → `bg-background` / token. (Scrims and the swatch-contrast helper stay.) | Low |
| C6 | Inline `style={{}}` ×17 | `RecordFormDialog.tsx:117`, `AdminPage.tsx:166`, … | Low | Review; keep where values are dynamic. | Low |

### C. Responsive / touch / a11y (measured)
| ID | Issue | Where | Sev | Fix | Risk |
|---|---|---|---|---|---|
| R1 | Dashboard "Recent surveys" on phone: sort headers 16 px tall, site links 17 px | `DashboardPage.tsx`, `ManagedDataTable` header buttons | Med | `tap-area` utility (already exists) or compact card list under `sm`. | Low |
| R2 | Surveys list rows 298×40 on phone | `SurveysPage.tsx` list item | Low | `min-h-11`. | Low |
| R3 | Map side-pill buttons 36×36 (deliberate in last PR to keep the pill slim) | `MapPage.tsx:632,656` | Low | 40 px with 2 px gap, or keep — your call. | Low |
| R4 | 20 text nodes < 12 px on Dashboard (chart ticks) | `chart.tsx`, `dashboard-charts.tsx` | Low | 12 px ticks (part of P4). | Low |
| R5 | **Pass:** AA contrast both themes; no overflow 320/390/1440; unique `<h1>`; zero unnamed controls; zero `<img>` without alt. | — | — | Keep; new tokens must preserve the two tight margins (chip text 4.68, light input border 3.23). | — |

### D. Environment
| ID | Issue | Fix |
|---|---|---|
| H-1 | A freshly started stack is empty (seeding is opt-in and isn't run at startup), so a first preview looks broken. | README "Run it" step: `docker compose exec backend python -m app.seed` (documentation only; no behaviour change). |

## Proposed target token set (derived from what exists; nothing new to install)
**Colour — light** (semantic roles unchanged; values refined)
| Token | Now | Proposed | Notes |
|---|---|---|---|
| `--background` (canvas) | `#ffffff` | `#f6f7f9` | page |
| `--card` / `--popover` (raised) | `#ffffff` | `#ffffff` | + soft shadow |
| `--muted` (sunken) | `#f1f2f4` | `#eef0f4` | table heads, wells; muted text 6.7:1 on it |
| `--border` | ink 14 % | ink **8 %** `#0f1b3314` | decorative hairline |
| `--input` (field border) | `#8590a2` | `#8590a2` | **unchanged** — 3.23:1 on white; fields stay on white |
| `--foreground` / `--muted-foreground` | `#172b4d` / `#44546f` | unchanged | 14.1 / 7.6 |
| `--primary` | `#0c64df` | **Option A** `#1556c0` (6.72:1, chip 5.77) | see Decisions |
| `--success / --warning / --destructive` | `#1d7953 / #a54800 / #c3352b` | unchanged | all ≥ 5.37:1 |
| `--sidebar` | blue-tinted | `#f6f7f9` (= canvas) + hairline | active item: `#e8ecf3` fill, primary text |
| charts | 5-step blue | semantic: `--chart-draft` amber ramp, `--chart-done` green ramp, `--chart-1` brand, `--chart-grid` = hairline | |

**Colour — dark:** `--background #14171f`, `--card #1a1f2a`, `--popover #1e2430` (unchanged), `--sidebar #11141b`; primary `#579dff`
and all text tokens unchanged (verified 5.4–13.5:1). Chip/semantic colours unchanged.

**Type** (Inter Variable, already installed): micro 11/16 · xs 12/16 · **body 14/22** (was 14/20) · base 16/24 ·
section 15/22 600 · title 18/26 650 −0.01 em · **page 24/30 650 −0.02 em** · **numeral 32/36 600 tabular −0.02 em**.
Weights: 400 / 500 / 600 / 650 (no 700). Optional: Inter `cv11` single-storey *a* for a less default feel (preview first).

**Radii:** `sm 6` · `md 8` (buttons, fields, badges) · `lg 12` (cards, popovers, tables) · `xl 16` (dialogs, sheets, phone pill) · `full`.
(The phone pill I rounded in the last PR moves from `xl` 11 px to this `xl` 16 px.)

**Shadows:** raised `0 1px 2px #1018280d, 0 1px 3px #1018280f` · overlay `0 12px 32px -8px #1018282e, 0 2px 6px #1018280f`;
dark keeps the inset highlight with stronger alpha. Controls stay flat.

**Spacing:** 4 px base; allowed steps 1, 1.5, 2, 3, 4, 6, 8; card padding 20 (desktop) / 16 (phone); page gutter 24/32; section gap 24.
**Breakpoints:** unchanged — `sm 640`, `md 768` (phone ↔ desktop shell), `lg 1024`, `xl 1280`, plus `pointer-coarse`.
**Motion:** `--duration-fast 100` · `--duration-normal 200` · new `--duration-slow 300` · `--ease-standard` unchanged; reduced-motion zeroing kept.
**Icons:** stroke 1.75. **Z-index:** unchanged.

## Decisions I need from you (subjective)
1. **Brand colour** — *A (recommended)*: same blue family, deeper and calmer `#1556c0`; *B*: ink-teal `#0b6b73`, a new
   identity that suits maps/survey work; *C*: keep `#0c64df`. A and B both clear every contrast limit above.
2. **Toolbar regrouping (P5)** — group into Search/Filter · View · Actions + labelled primary, or leave the seven icons.
3. **Login (P6)** — contour-line ink panel (recommended) or keep the blue panel with the new tokens only.
4. **Map side pill (R3)** — 40 px buttons or keep 36.
5. **Inter `cv11`** — preview it or skip.
Reply with e.g. "A, yes, yes, 40, skip" or "go with your recommendations".

## How I will apply it (STEP 4, pausing after each stage, one commit per stage)
1. Tokens in `styles.css` only (colour, radii, shadows, type, motion).
2. Replace hard-coded values with tokens (map JS colours C1, C2, C5) — no visual change intended.
3. Consolidate variants/states (button, card, badge, field, tabs on the new radii and surfaces; sidebar P7).
4. Responsiveness/touch (R1–R3, table card hugging content).
5. Contrast/a11y re-check on every changed pair (script re-run; must stay ≥ the numbers above).
6. Microcopy/formatting (sample pass; toolbar labels if approved).
7. Final polish: KPI cards, charts (P4), login (P6), motion, icon stroke.
After each stage: `tsc`, `eslint`, vitest, Playwright, and before/after screenshots (desktop + phone, light + dark).

---
## Decisions received (2026-10-10): "go with your recommendations"
Brand A `#1556c0` · toolbar regrouped · contour-line login · map pill 40 px · no `cv11`.

## STEP 4 log
### Stage 1 — tokens in one place (done 2026-10-10)
Changed: `styles.css` only, plus `Card` radius `xl`→`lg` (so cards are 12 px under the new scale, not 16).
- Colour: canvas `#f6f7f9`, raised `#ffffff`, sunken `#eef0f4`, hairline `#0f1b3314`, primary `#1556c0` (+ info, sidebar-primary/accent-foreground), sidebar = canvas tone with `#e8ecf3` selected item. Dark: canvas `#14171f`, card `#1a1f2a`, sidebar `#11141b`.
- Radii: whole-pixel scale `4 / 6 / 8 / 12 / 16 / 20 / 24 / 28`, `--radius` 0.5rem.
- Shadows: two soft layered shadows (light), stronger layered + inset highlight (dark).
- Type: body 14/22; section 15/22; title 18/26 −0.01em; page title 24/30 −0.02em (`text-display`); new `text-numeral` 32/36 (used in stage 7).
- Motion: `--duration-slow 300ms`. Icons: `svg.lucide` stroke 1.75.
Left alone: component classes other than `Card`; map JS colours; chart palette (stages 2 and 7).
Checks: tsc, eslint, vitest 202, Playwright 12 — see the commit. Screenshots: scratchpad `ui/s1/` (desktop light/dark, phone light).
Contrast: unchanged semantic colours; primary now 6.72:1 on white, chip text 5.77:1 (both better than before).

### Stage 2 — hard-coded values to tokens (done 2026-10-10)
Changed: map colours now come from one module, `components/map/layers/colors.ts` (named: brand, ink, muted ink, rule grey, label chip/halo, status draft/done/danger, `DRAW_DEFAULT`, `LAYER_PALETTE`). 13 map files import from it; the 39 distinct literals are gone from the map code except white-alpha strokes in `images.ts`, `#000/#fff` in the swatch picker and `map.css` shadow. MapLibre styles and canvas code can't read CSS variables, so constants (kept equal to `styles.css`) are the right mechanism there.
- New sketches draw in brand blue (was maplibre-draw's `#3388ff`/`#3bb2d0`); existing sketches keep their stored colour.
- Stacked data layers use app hues (brand, green, amber, red, violet, pink, teal) instead of Tailwind defaults.
- Print sheet grid/ink/danger use the same constants (`#d32f2f` → `#c3352b`).
- Off-scale type: `text-[13px]`→`text-sm` (Header), `text-[11px]`→`text-micro` (sidebar), `text-[0.8rem]`→`text-xs` (calendar). `font-bold`→`font-semibold` everywhere; the page `<h1>` now uses `text-display` (24/30, 650, −0.02em).
Left alone: `bg-white` on the slider thumb and the attachment image preview (white is the point there); `bg-black` scrims; swatch contrast helper; chart.tsx recharts selectors (`#ccc`/`#fff`).
Checks: tsc, eslint, vitest 202, Playwright 12 (incl. map journeys) all pass; map screenshot shows brand-blue pins.

### Stage 3 — variants and states consolidated (done 2026-10-10)
Changed: `Card` is now one recipe — 12 px radius, 8 % hairline, raised shadow — so the per-page `border border-border shadow-none` overrides in `DetailsCard` and `SiteSurveysPanel` are gone. Popover, dropdown (and sub-menu) and select content use the 12 px radius (controls stay 8). Sidebar: the active item is one signal (filled pill + primary colour + semibold; the 3 px inset bar is removed — still not colour alone), width 12→13 rem so the brand name no longer truncates (P7).
Left alone: dialogs/sheets (already 16 px), tooltips (8 px), badge pill, button radii (8 px via token), `StatCard` and the login card (rebuilt in stage 7).
Checks: tsc, eslint, vitest 202; screenshots `ui/s3/`.

### Stage 4 — responsiveness and touch (done 2026-10-10)
Changed: data tables hug their rows instead of stretching to the viewport (`flex-1`→`flex-initial` on the scroll wrapper; the page keeps its height, the card doesn't), table header on the sunken tone with a 1 px rule, table card raised; phone list cards `min-h-11` (Sites and Surveys); map side-pill buttons 36→40 px (decision 4).
**Correction to R1:** the dashboard's sort headers and site links already carry the `tap-area` utility (hit area extended to ~48 px with a pseudo-element). The probe measured the visible box only, so those were false positives; no change made. R4 (chart ticks < 12 px) moves to stage 7 with the charts.
Checks: tsc, eslint, vitest 202, Playwright 12 (incl. the 360 px map-panels journey), screenshots `ui/s4/`.

### Stage 5 — contrast and accessibility re-check (done 2026-10-10)
Re-ran the contrast script against the *new* tokens on all three surfaces (canvas, card, sunken) in both themes: **38 pairs, 0 failures.** Tightest: success/destructive text on their own tint 4.69 / 4.68 (light); field border on card 3.23 (light) — both unchanged and still above the limit. Focus ring `#388bff` is 3.33:1 on a card and 3.11:1 on the canvas (≥ 3:1); dark ring ≥ 8:1. Primary text improved 5.38 → 6.72 on white. Structural probe on the live app: no overflow at 320/390/1440, one `<h1>` per page, zero unnamed controls, zero images without alt.
One fix from the probe: phone list rows for Sites and Surveys put the 44 px minimum on the link itself (it was on the card, leaving the link 40 px). Remaining "small" boxes are `tap-area` elements (hit area extended), the 1 px skip-link, a hidden select, and the 40 px map buttons (approved).

### Stage 6 — microcopy and toolbar (done 2026-10-10)
Changed: table toolbar (`ManagedDataTable`) is regrouped: search · **View** group (filter & sort, columns, display, focus) · divider · **Actions** group (edit, export, saved views) · labelled primary button ("Add site" / "Add survey"; icon-only stays on phone). Both groups carry `role="group"` and a name. Handlers, the `n` shortcut (`data-primary-action`), tooltips and accessible names are untouched.
Scoped down from the report's proposal: I did **not** merge the separate menus into one "View" menu — that would rewrite three components' behaviour; grouping gives most of the clarity at none of the risk.
Microcopy sample (reduced scope): dates are consistent ("10 Oct 2026"), status vocabulary and button verbs are consistent (Add / Edit / Export), sentence case throughout. Nothing to change beyond the label above.
Checks: tsc, eslint, vitest 202, Playwright 12; screenshots `ui/s6/`.

### Stage 7 — final polish (done 2026-10-10)
Changed:
- **KPI cards (P1):** `StatCard` — 32 px tabular numeral (`text-numeral`), quiet 12 px label, plain tinted icon instead of a coloured circle, 16 px padding, raised.
- **Charts (P4, R4):** area chart with a soft gradient fill; solid hairline grid; 12 px ticks; horizontal x-labels; Draft and Completed bars in the status colours the map markers use (`--chart-draft`, `--chart-done`, new tokens, both themes); 4 px bar tops; no draw-in animation (it replayed on every visit and showed a half-drawn line when screenshotted).
- **Login (P6):** deep-ink panel (`--brand-ink`, `brand-panel` utility) with the brand blue glowing from the corner, 20 fading contour lines (every fifth heavier) generated in inline SVG, 40 px hero headline (`text-hero`), white text fixed (it no longer follows the theme), logo inverted uses fixed colours; form card is raised (`--shadow-overlay`), left-aligned heading, no box border. No new assets or dependencies.
- **Motion (P11):** `--duration-slow` token added in stage 1; the only motion removed is chart draw-in. No new animation was added: the audit counts gratuitous motion as a defect, and the existing transitions (colour, sheets, dialogs) are already consistent and reduced-motion-safe.
Left alone: the Inter `cv11` feature (decision 5: skip).
Checks: tsc, eslint, vitest 202, Playwright 12; screenshots `ui/s7/` (desktop light/dark, phone light).

## Outcome vs. the findings
P1 type hierarchy ✔ · P2 surfaces ✔ · P3 brand colour ✔ · P4 charts ✔ · P5 toolbar ✔ (grouped, not merged) · P6 login ✔ · P7 sidebar ✔ · P8 radii ✔ · P9 elevation ✔ · P10 icon stroke ✔ · P11 motion ✔ (reduced) · C1–C3, C5 ✔ · C4 spacing: not snapped (no visible drift found; left) · C6 inline styles: reviewed, dynamic values, left · R1 false positive · R2, R3 ✔ · R4 ✔ · H-1: README note still to add.
Not done: spacing snap (C4), the H-1 README line, light-mode phone screenshots of every screen were not all reviewed by eye (dark phone and light desktop/dark desktop were).
