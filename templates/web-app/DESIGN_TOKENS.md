# Design Tokens

<!-- Web-app projects only — skip for static sites, CLIs, pipelines, and agents. -->

The single place to check "what's the token for X" — colours, type, spacing, theme — instead of it being implicit in shadcn's defaults or scattered across components. Fill this in once per project (or once for the template, then adjust per spin-off) and keep it in sync if you change a token.

Delete the placeholder values once you've picked real ones.

## Colours

| Token | Value | Used for |
|---|---|---|
| `primary` | `[hex]` | Primary actions, navigation, key headers |
| `secondary` | `[hex]` | Secondary actions, links |
| `success` | `[hex]` | Positive status, confirmations |
| `warning` | `[hex]` | Caution states |
| `danger` | `[hex]` | Destructive actions, errors |
| `info` | `[hex]` | Neutral informational status |
| `background` | `[hex]` | Page background |
| `surface` | `[hex]` | Card/panel background |
| `border` | `[hex]` | Dividers, input borders |
| `text` | `[hex]` | Body text |
| `text-muted` | `[hex]` | Secondary/helper text |

Rule: colour is never the sole identifier of a status — pair it with a label or icon.

## Typography

| Token | Value |
|---|---|
| Font family | `[e.g. Inter, system-ui fallback]` |
| Base size | `[e.g. 16px]` |
| Scale | `[e.g. 12 / 14 / 16 / 20 / 24 / 32px]` |
| Weights used | `[e.g. 400 regular, 600 semibold]` |
| Line height | `[e.g. 1.5 body, 1.2 headings]` |

## Spacing & Layout

| Token | Value |
|---|---|
| Spacing scale | `[e.g. 4 / 8 / 12 / 16 / 24 / 32 / 48px]` |
| Border radius | `[e.g. 6px default, 12px cards]` |
| Shadow | `[e.g. one subtle elevation level, used sparingly]` |
| Breakpoints | `[e.g. 640 / 768 / 1024 / 1280px]` |

## Theme

- **Modes supported:** `[light / dark / system-following]`
- **Dark mode approach:** `[e.g. invert surface/background, keep brand colours, adjust for contrast]`

## Verification

Turns "looks fine" into a checkable claim — a mode or page not listed here has
not been verified.

- [ ] Every page checked in **light** mode (date: `____`)
- [ ] Every page checked in **dark** mode (date: `____`)
- [ ] Focus-visible indicators confirmed on keyboard navigation (date: `____`)
- [ ] Reduced-motion behaviour checked (date: `____`)

## Product-Specific Notes

Anything that deviates from shadcn's defaults, or a rule specific to this project (e.g. "status colours are reserved for status only, never decoration").

- `[note]`
