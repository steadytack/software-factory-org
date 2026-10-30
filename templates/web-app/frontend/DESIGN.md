# Design system

How this app looks and why. Read it before writing or changing UI; follow it so new screens match the old ones. Everything is token-driven: **colours, sizes, radii, shadows and motion come from `src/styles.css`, never from literals in feature code.** If a value you need does not exist, add a token there first.

The feel: a professional tool used all day. Calm, precise, dense but breathable. Restraint over decoration: one accent colour, quiet chrome, clear hierarchy, finished states.

## 1. Principles

1. **Hierarchy from weight and colour, not just size.** Three text tiers (primary, secondary, tertiary) and no more than three weights.
2. **One accent.** Brand blue is for the primary action, selection, focus and the active nav item. Links, icons, badges and charts stay neutral or semantic.
3. **Depth from surfaces.** Canvas, raised, sunken and overlay surfaces with hairline borders; shadows are soft and low-opacity.
4. **Every state is designed:** hover, focus-visible, active, disabled, loading, empty, error.
5. **Accessible by default.** WCAG AA contrast, 44px touch targets on touch devices, visible 2px focus ring, reduced motion respected.

## 2. Colour (`src/styles.css`, light `:root` and `.dark`)

| Role | Tokens | Use |
|---|---|---|
| Surfaces | `--background` (canvas), `--card` / `--popover` (raised), `--muted` (sunken) | Page, cards and menus, table heads and wells |
| Text | `--foreground` (primary), `--muted-foreground` (secondary), `--text-tertiary` (`text-tertiary`) | Body; labels and meta; helper text, chart ticks, section labels, quiet icons |
| Borders | `--border` (hairline), `--input` (field border) | Regions; form fields (must stay 3:1) |
| Accent | `--primary`, `--ring` | Primary buttons, links on hover, focus ring, selection |
| Semantic | `--success`, `--warning`, `--destructive`, `--info` plus `-subtle`, `-border`, `-fg` | Solid = fills and buttons. Subtle/border/fg = badges, alerts, chips (`text-success-fg` on `bg-success-subtle`) |
| Chart | `--chart-cat-1…8` (categorical), sequential ramp (`--chart-1…5`), `--chart-div-1…5` (diverging), `--chart-draft`, `--chart-done` | Charts only; always use these, never raw hex |
| Sidebar | `--sidebar*`, `--sidebar-active` | App shell |

Rules:
- No pure black or white text. No raw palette classes (`bg-blue-500`) and no `#hex` or `rgb()` in components.
- Status is never colour alone: pair it with a dot, icon or text (`StatusBadge`).
- Contrast pairs that are close to the limit and must not get lighter: chip text on its tint (~4.7:1), the light-mode field border on white (3.2:1). Fields sit on white (`--card`), not on the canvas.
- Anything MapLibre or canvas code draws (it cannot read CSS variables) takes its colours from `src/components/map/layers/colors.ts`, whose values mirror these tokens.

## 3. Typography

Inter Variable (UI), JetBrains Mono (IDs, codes, coordinates). Numbers always get `tnum`.

| Class | Size / line | Use |
|---|---|---|
| `text-numeral` | 32 / 36, 600, tight | KPI figures |
| `text-hero` | 40 / 44, 650 | Sign-in headline only |
| `text-display` | 24 / 30, 650, −0.02em | Page title |
| `text-title` | 18 / 26, 650 | Large section titles |
| `text-subtitle` | 15 / 22, 600 | Card titles |
| `text-sm` (body) | 14 / 22 | Reading text |
| `text-dense` | 13 / 20 | Controls, table body, nav items, tabs, and every menu, select, command and list row |
| `text-xs` | 12 / 16 | Form and field labels (secondary colour), segmented controls, small buttons, captions, table headers, helper text |
| `text-micro` | 11 / 16 | Badges, kbd chips, tracked section labels |

Weights: 400, 500, 600 (650 only in the display, title and hero tokens). No 700. Every number uses `tnum`: tables, KPI figures, counts, times (`RelativeTime`) and the header meta line already do, so keep it on any new number. Use `font-mono` at 12–13px in the secondary colour for coordinates and IDs.

## 4. Spacing, size, shape

- **4px grid.** Use whole steps (`1, 2, 3, 4, 6, 8`). Half-steps (`1.5`, `2.5`) are for nudging inside a fixed-height control only.
- **Spacing follows the Interface density setting** (Profile → Display) through tokens, never fixed numbers: `--card-pad` (card padding, 16px compact / 20px comfortable), `--card-gap` (title to content, 12 / 16px), `--page-gap` (between sections and cards, 16 / 24px), `--kv-py` (key/value rows, 8 / 12px) and `--setting-h` (settings rows, 40 / 48px) and `--field-gap` (a form label to its field, 6 / 8px). Use `p-(--card-pad)`, `gap-(--page-gap)` and so on in new code. Compact is the default on a mouse; comfortable on touch.
- **Control heights:** `sm` 28, `default` 32, `lg` 36 (and `xs` 24). Buttons, inputs, selects and tabs in the same row must match. A segmented control is 24px inside a 28px track. On touch (`pointer-coarse:`) every control is 44px.
- **Radius:** `rounded-sm` 6 (chips, kbd), `rounded-md` 8 (controls), `rounded-lg` 12 (cards, popovers, dialogs, sheets), `rounded-full` (pills, avatars). Nested radius = outer − padding.
- **Table rows:** 40px by default (the density setting maps to 40 / 44 / 52); sticky 32px header on `--muted`.

## 5. Elevation

`--shadow-raised` for cards, `--shadow-overlay` for menus, popovers, dialogs and sheets. Controls are flat. In dark mode, depth comes from lighter surfaces and an inner highlight, not heavier shadows. Frosted surfaces use `glass` (floating phone controls), `glass-sheet` (bottom sheets) and `map-panel` (everything floating on the map).

## 6. Motion

120ms (`--duration-fast`), 160ms (`--duration-normal`), 200ms (`--duration-slow`). Enter with `--ease-out`, leave with `--ease-in`. Animate opacity and transform only. Buttons scale to 0.98 on press; popovers and menus scale from their origin; skeletons shimmer. All of it is zeroed under `prefers-reduced-motion`. Charts do not animate in.

## 7. Components and recipes

- **Button sizes:** `default` (32px, 13px label) for a form's submit button, the save bar, error pages and dialog buttons; `sm` (28px) is the quiet one, a 12px label and a 14px icon, for page-header actions, toolbars, panels and actions inside a card. Touch is 44px either way.
- **Button** (`ui/button.tsx`): one `default` (primary) per page region (in a tab's toolbar it is the blue `+` icon button, the rest are outline icon buttons); `outline` (hairline surface) for secondary; `ghost` for quiet; `destructive` is the subtle red. Detail pages mark their main action with `primary` in `DetailPageActions`.
- **Icon-only controls always have a tooltip.** Use `IconButton` (`ui/icon-button.tsx`). If it cannot be an `IconButton` (a drag handle, a swatch, a clear button inside a field), wrap it in `WithTooltip` (`ui/with-tooltip.tsx`). Never use a native `title` alone.
- **Card** (`ui/card.tsx`): surface, hairline border, raised shadow, 12px radius, density-driven padding, and a 14px semibold title with no icon. There is one recipe: no "small" variant and no per-page padding. Every titled block on a page is a card (a table's header and its "View all" link sit in the card's header, the table running edge to edge with `bare`), not a bare heading with a rule. **ChartCard** frames charts (title, one-line subtitle).
- **Badges and chips:** `StatusBadge` / `chipClass` from `lib/chips.ts` (dot + text on the subtle tint). **CountBadge** for tab counts. **RequiredMark** after a required field's label.
- **Key/value panels:** `DetailsCard` (label left, value right, hairline dividers).
- **Page structure:** every page renders into the app's own page column (left-aligned, max width, `--page-gap`): never a second centred wrapper. Every page has the same header: a title row (actions on the right) and one muted meta line (the Dashboard's date and freshness, a record's type and status); a page with nothing worth saying there, like Profile and Admin, has none. The page column is at most 1600px wide, so a large monitor is used. Use `SETTINGS_COLUMNS` (`components/SettingsLayout.tsx`) for settings pages (cards in one, two or three balanced columns by width) and `DetailLayout` for a record with a side panel.
- **Settings-style pages** (Profile, Admin): `PanelCard` (title, optional one-line description, optional `action` such as the "Saved" status) in `SETTINGS_COLUMNS`; wide content (a table) is its own full-width card.
- **Settings:** a list of `SettingRow`s (label left, control right, hairline dividers), every row the same `--setting-h`: a `Segmented` control for one-of-a-few (the current choice has a hairline ring) and a `SettingToggle` for on/off (a light track with a ring when off, blue when on). Settings that belong together share a card (Display, Tables). No hint line under a self-explanatory control.
- **Confirming:** an action that changes data and cannot be undone by the user asks first: `DeleteConfirmDialog` for deletes, `ConfirmDialog` for anything else (one sentence of what will happen, a confirm button that names the action).
- **Saving preferences:** a personal setting saves itself, on change for choices and on leaving the field for text, and says "Saved" in a line that is always reserved. Use a Save button only when several fields must be submitted together.
- **Table toolbar:** icon buttons only, in a View group and an Actions group with no divider; the primary action is a plain `+`. On a phone the search is the first icon in the same row and expands in place.
- **Record pages** (Site, Survey): both open on an **Overview** tab (Site: the editable form and location; Survey: the Details card and Summary), then Surveys (site only), Comments, Attachments and History. On a phone: the breadcrumb trail is one back link to the parent, the type pill is hidden, the title shares a row with the actions, header meta is the essentials (status and type or surveyor), the tab row (`RecordTabsList`) is pinned under the header, and a primary action that the bottom bar already does (Add survey on a site) or that is only an icon (Edit survey) is not repeated as a labelled button.
- **Tab toolbars** (Surveys, Comments, Attachments, History): one card holds the toolbar and the list, and the toolbar is the same on every tab, left to right: the add buttons (a blue `+`; Attachments has upload and camera), `SearchToggle` (opens the field in its own row, a dot while a search applies), an `IconSelect` filter, an `IconSelect` sort, and the count at the right. History has no add button. Every button is a 32px square (44px on touch) with a tooltip. Where a tab has nothing worth filtering or sorting, leave that button out rather than disable it.
- **Sidebar:** a step darker than the page in light mode. Items are in the secondary colour with 16px icons, so only the current page stands out. The current page is a lifted chip (raised surface, hairline, soft shadow) with an accent icon and normal-colour text, not a coloured slab. Group labels are quiet 12px sentence case in the tertiary colour. The Account group is anchored to the bottom.
- **Phone tab bar:** the four main pages as icon-only, equal-width tabs (nothing to configure); the current page is a same-size capsule with `aria-current`. Search lives in the header, not the tab bar.
- **Tables:** `ManagedDataTable`. 13px body at one weight (the name link is regular weight too; phone cards keep a medium title), tertiary row actions that strengthen on row hover, destructive actions red on hover, empty cells show `—`, long text truncates with a tooltip. Fit 1440px without horizontal scroll.
- **Forms:** one rhythm everywhere (the map's Export tab is the reference): a label sits `--field-gap` above its field, fields are `--card-gap` apart in both directions (`gap-(--card-gap)` for a grid, `space-y-(--field-gap)` around a label and its field), two columns from `sm`, wide fields span both. Labels are 12px medium in the secondary colour (quiet: the value is what stands out), switches stay small (28 × 16), card descriptions are 12px; helper text in `text-xs text-tertiary`, errors inline in `text-destructive-fg`. Technical values in mono.
- **Data views have all three states:** a skeleton that matches the layout (`Skeleton`, `TableSkeleton`, `ListSkeleton` for lists of rows), an empty state (`EmptyState`: icon, headline, one line, any existing action) and an error state (`LoadError` with `onRetry` set to the query's `refetch`).
- **Toasts** (`sonner`, styled in `ui/sonner.tsx`): glass surface above the bottom pill on phones. Sentence case, end with a full stop, no exclamation marks, no quote marks round names.

## 8. Maps

One surface for everything floating on the map: `map-panel` (90% popover, blur, hairline border, overlay shadow, 8px radius) with a 10px inset from the edges. Zoom and cursor readout bottom-left; attribution small, bottom-right, clickable. The default basemap is muted grey and follows the theme (`defaultLayerFor`), with `maxzoom` set so high zooms stretch instead of going blank. Markers show a ring on hover. The Layers, Draw and Export tabs use the form rhythm above, with groups split by a hairline and quiet 12px labels; their buttons are `sm`. Record layers (sites, surveys) are one colour or coloured by a field (`Colour by`), with built-in schemes (`layers/colorSchemes.ts`) and a colour per value; add a field to a layer in `layers/pointLayers.ts` and the editor, legend, filter and popups follow. Search placeholders are plain language.

**Draw and export.** Sketches are kept in the browser, can be ticked and styled or deleted together, and snap to every other kind of sketch as well as to sites, surveys and data layers. Print sheets draw symbols at their screen size at any resolution, keep the sheet's scale, credit every layer's licence, and write text the PDF font cannot as part of the image. **Location:** "Use my location" (site form) and "Nearest site" (survey form, within 500 m) ask for the position only when tapped, and say how accurate it is (`lib/geolocate.ts`).

## 9. Copy and icons

Say less. Do not add a card description that restates the title, a page subtitle that restates the page name, or a hint under a control that explains itself. Keep text that prevents a mistake ("Signs you out on your other devices") or explains why something is disabled, and put longer detail in a tooltip.

Sentence case; short, plain microcopy; verbs on buttons (Add, Edit, Export); no exclamation marks; singular and plural handled. Icons are `lucide-react` only: 16px inline, 18px in nav, stroke 1.75 (set globally).

Spacing note: the only half-steps left (`0.5`, a 2px nudge) sit inside fixed-height controls, chips and badges; layout spacing is whole steps. Third-party shadcn internals (`ui/chart.tsx`, `calendar`, `switch`, sidebar badges) are left as generated.

## 10. Before you ship UI

Run `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, and the Playwright journeys. Check light and dark at 375, 768, 1280 and 1920px; confirm no horizontal page scroll, every icon-only button has a tooltip, and every new data view has loading, empty and error states.
