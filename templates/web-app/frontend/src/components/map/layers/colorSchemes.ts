/** Built-in colour schemes for colouring a record layer by a field (site type, status…). A scheme gives
 *  each value of the field a colour; people can then change any one. MapLibre can't read CSS variables, so
 *  these are literal hex values, chosen to read on light and dark basemaps (the categorical set mirrors the
 *  chart tokens in styles.css). */
import type { ColorField } from "./pointLayers";
import { RULE_GREY, STATUS_DONE, STATUS_DRAFT } from "./colors";

/** Eight clearly different hues: the default for a field with no meaning to its order. */
export const DISTINCT = ["#3b6fd0", "#2a9470", "#c4852a", "#c25048", "#7461c9", "#23869e", "#b04f86", "#6e7b90"];
/** Okabe–Ito, designed to stay distinguishable with the common kinds of colour blindness. */
const COLOUR_BLIND = ["#0072b2", "#e69f00", "#009e73", "#d55e00", "#cc79a7", "#56b4e9", "#f0e442", "#999999"];
/** Softer, for maps with a lot else going on. */
const MUTED = ["#5b7db1", "#7fa37f", "#c9a15a", "#b5776e", "#8b7db5", "#6fa5a5", "#b58aa8", "#8f98a6"];

/** What a value of a status-like field means, so a status scheme can colour it without knowing its name. */
export type Tone = "good" | "pending" | "quiet";
export const TONE_COLOR: Record<Tone, string> = { good: STATUS_DONE, pending: STATUS_DRAFT, quiet: RULE_GREY };

export interface ColorScheme {
  id: string;
  label: string;
}

const PALETTES: Record<string, string[]> = { distinct: DISTINCT, colourblind: COLOUR_BLIND, muted: MUTED };

const SCHEMES: ColorScheme[] = [
  { id: "status", label: "Status: green, amber, grey" },
  { id: "distinct", label: "Distinct colours" },
  { id: "colourblind", label: "Colour-blind safe" },
  { id: "muted", label: "Muted" },
];

/** A field can use the status scheme when every one of its values has a meaning. */
const isStatusLike = (field: ColorField) => field.categories.every((c) => c.tone);

/** The schemes that make sense for a field. */
export function schemesFor(field: ColorField): ColorScheme[] {
  return SCHEMES.filter((s) => s.id !== "status" || isStatusLike(field));
}

/** The one a field starts with. */
export function defaultSchemeFor(field: ColorField): string {
  return isStatusLike(field) ? "status" : "distinct";
}

/** A colour for each value of the field, from the scheme (palettes wrap round if the field has more values). */
export function schemeColors(schemeId: string, field: ColorField): Record<string, string> {
  const palette = PALETTES[schemeId] ?? DISTINCT;
  return Object.fromEntries(
    field.categories.map((c, i) => [
      c.value,
      schemeId === "status" && c.tone ? TONE_COLOR[c.tone] : palette[i % palette.length],
    ]),
  );
}
