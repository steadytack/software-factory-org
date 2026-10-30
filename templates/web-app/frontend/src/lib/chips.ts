/** Shared status/severity chip — replaces the copy-pasted Tailwind class
 *  triples in SitesPage, SiteDetailPage, DashboardPage, PageCapBanner and
 *  ManagedDataTable. `TONES` is the single source for each tone's color
 *  classes; `chipClass` wraps it into a pill, `toneClass` is used as-is by
 *  banners/inline badges that need the color without the pill shape. */

export const TONES = {
  success: "border-success-border bg-success-subtle text-success-fg",
  warning: "border-warning-border bg-warning-subtle text-warning-fg",
  info: "border-info-border bg-info-subtle text-info-fg",
  destructive: "border-destructive-border bg-destructive-subtle text-destructive-fg",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

export type ChipTone = keyof typeof TONES;

export function chipClass(tone: ChipTone): string {
  return `rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`;
}

/** Raw tone color classes (border + bg + text), no pill shape — for banners
 *  and inline badges that supply their own layout classes. */
export function toneClass(tone: ChipTone): string {
  return TONES[tone];
}

/** Site status → chip tone. */
export function siteStatusTone(status: string): ChipTone {
  return status === "active" ? "success" : "neutral";
}

/** Survey status → chip tone. */
export function surveyStatusTone(status: string): ChipTone {
  return status === "completed" ? "success" : "warning";
}

