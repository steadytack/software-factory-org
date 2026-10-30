/** Single source of truth for product naming and marketing copy. */
export const BRAND = {
  name: "Web App Template",
  // Say what the product does today; no promises it can't back up.
  tagline: "Every site and survey in one place.",
  description:
    "Record sites and surveys, see them on a map, and keep working when the signal drops.",
} as const;

export function pageTitle(title?: string): string {
  return title ? `${title} · ${BRAND.name}` : BRAND.name;
}
