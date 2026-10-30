/** Every colour the map draws that cannot be a CSS variable. MapLibre style objects, canvas drawing
 *  and the print sheet cannot read `--primary` and friends, so the literals live here, named, and
 *  nowhere else in the map code. Keep the brand and ink values equal to `styles.css`. */

/** `--primary` (light theme). */
export const BRAND_BLUE = "#1556c0";
/** Brand blue, darker: outlines and hatching on a brand-blue fill. */
export const BRAND_BLUE_DEEP = "#0f3f91";
/** `--foreground` / `--muted-foreground` (light theme): map text and print-sheet ink. */
export const INK = "#172b4d";
export const INK_MUTED = "#44546f";
/** `--input`: neutral rules and "no data" markers. */
export const RULE_GREY = "#8590a2";
export const WHITE = "#ffffff";
/** Dark label chip and its halo (white labels on photography and dark base maps). */
export const LABEL_BG = "#111827";
export const LABEL_HALO = "rgba(10,15,28,0.9)";
/** Light halo behind dark labels. */
export const HALO_LIGHT = "rgba(255,255,255,0.8)";
export const TRANSPARENT = "rgba(0,0,0,0)";
/** Survey status markers (brighter than the text tokens, which must meet 4.5:1 on white). */
export const STATUS_DRAFT = "#e2a03f";
export const STATUS_DONE = "#22a06b";
export const STATUS_DANGER = "#c3352b";
/** What a new sketch is drawn in. Existing sketches keep the colour stored on them. */
export const DRAW_DEFAULT = BRAND_BLUE;

/** Colours offered to stacked data layers, after the first (which takes `--primary`): the app's
 *  semantic hues rather than Tailwind defaults, each with a darker stroke. */
export const LAYER_PALETTE = [
  { fill: BRAND_BLUE, stroke: BRAND_BLUE_DEEP },
  { fill: "#22a06b", stroke: "#14573b" },
  { fill: "#e2a03f", stroke: "#9a5f10" },
  { fill: "#c3352b", stroke: "#8a2018" },
  { fill: "#8270db", stroke: "#5b49a8" },
  { fill: "#ae4787", stroke: "#7f2f62" },
  { fill: "#0e7490", stroke: "#0a5568" },
] as const;
