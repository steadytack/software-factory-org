/** One formatting module, used everywhere.
 *
 *  date and number formatting was inconsistent across screens
 *  and exports — a raw ISO `2026-09-10` on the site detail page, `relTime()`
 *  ("3d ago") in comments/changelog/notifications, `toLocaleDateString("en-GB")`
 *  on the dashboard, and raw ISO again in the CSV. No shared formatter
 *  existed; `lib/utils.ts` had only `relTime` and `formatSize`.
 *
 *  The rule this module commits to:
 *
 *  * **`formatDate`** — a calendar date a user reads (`10 Sep 2026`). Used for
 *    `survey_date`, `due_date` and anything else day-granular.
 *  * **`relTime`** (in `lib/utils.ts`, unchanged) — how long ago something
 *    happened. Right for activity feeds, wrong for a record's own data,
 *    because "3d ago" cannot be compared, sorted or filed.
 *  * **`formatDateTime`** — a timestamp with the time, when the time matters.
 *  * **`formatForExport`** — ISO for a CSV, deliberately: a spreadsheet and a
 *    downstream parser both want `2026-09-10`, not `10 Sep 2026`.
 *
 *  A fixed `en-GB` locale, not the browser's: the value is day-first
 *  throughout the UI, and a US-locale browser silently swapping to
 *  month-first would make `09/10/2026` ambiguous with no way to tell which
 *  reading applies.
 */

const LOCALE = "en-GB";

const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** The on-screen token for "no value". Kept here so the UI and the CSV
 *  export agree about it (DSP-4/EXP-2: the export dropped the `—`, so "no
 *  address" and "empty address" collapsed into the same blank cell). */
export const NO_VALUE = "—";

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  // A bare `YYYY-MM-DD` is parsed as UTC midnight by the Date constructor,
  // which in a negative-offset timezone renders as the PREVIOUS day. Anchor
  // it to local midnight instead.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A calendar date a user reads: `10 Sep 2026`. */
export function formatDate(value: string | null | undefined): string {
  const date = parse(value);
  return date ? DATE_FORMAT.format(date) : NO_VALUE;
}

/** A timestamp with the time: `10 Sep 2026, 14:05`. */
export function formatDateTime(value: string | null | undefined): string {
  const date = parse(value);
  return date ? DATE_TIME_FORMAT.format(date) : NO_VALUE;
}

/** Weekday only, for a chart axis: `Thu`. */
export function formatWeekday(value: string): string {
  const date = parse(value);
  return date ? date.toLocaleDateString(LOCALE, { weekday: "short" }) : value;
}

/** A coordinate, at the 4dp (~11 m) precision every screen already used. */
export function formatCoordinate(value: number): string {
  return value.toFixed(4);
}

/** A number a user reads, with thousands separators. */
export function formatNumber(value: number): string {
  return value.toLocaleString(LOCALE);
}

/** A signed delta for a KPI tile: `+3`, `-2`, `0`. */
export function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** The value a CSV cell should carry.
 *
 *  ISO for dates (a parser and a spreadsheet both want `2026-09-10`), and an
 *  explicit token for null so "no value" and "empty string" are
 *  distinguishable in the file — which they were not: both exported blank
 *. An empty string still exports empty, which is now the
 *  *only* thing an empty cell means.
 */
/** Today as `YYYY-MM-DD` in the user's own timezone. `toISOString()` gives
 *  the UTC date, which is yesterday just after midnight during BST. */
export function localIsoDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatForExport(value: unknown): string {
  if (value === null || value === undefined) return NO_VALUE;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return String(value);
  return String(value);
}
