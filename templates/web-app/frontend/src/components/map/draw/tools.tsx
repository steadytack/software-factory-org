/** The drawing and measuring tools, shared by the map's draw rail
 *  (desktop), the Draw tab and the bar shown while a tool is active. */
import type { ReactNode } from "react";

import type { DrawTool } from "./types";

export interface DrawToolInfo {
  tool: Exclude<DrawTool, null>;
  /** Button tooltip / accessible name, e.g. "Draw line". */
  title: string;
  /** Short label under the icon in the Draw tab. */
  label: string;
  /** How to use it, shown while it's active. */
  hint: string;
  icon: ReactNode;
}

export const DRAW_TOOLS: DrawToolInfo[] = [
  {
    tool: "point",
    label: "Marker",
    hint: "Tap the map to place a marker.",
    title: "Add marker",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 4.5a2.5 2.5 0 0 1 0 5z" />
      </svg>
    ),
  },
  {
    tool: "line",
    label: "Line",
    hint: "Tap to add points; tap the last point again to finish.",
    title: "Draw line",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M4 20L20 4" />
      </svg>
    ),
  },
  {
    tool: "polygon",
    label: "Shape",
    hint: "Tap to add corners; tap the first corner to close it.",
    title: "Draw polygon",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
        <path d="M12 3l9 6-3 12H6L3 9l9-6z" />
      </svg>
    ),
  },
  {
    tool: "circle",
    label: "Circle",
    hint: "Tap the centre, then tap again to set the size.",
    title: "Draw circle",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    tool: "measure-distance",
    label: "Distance",
    hint: "Tap to add points; tap the last point again to finish.",
    title: "Measure distance",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M3 21L21 3" />
        <path d="M8 16l2 2M12 12l2 2M16 8l2 2" />
      </svg>
    ),
  },
  {
    tool: "measure-area",
    label: "Area",
    hint: "Tap to add corners; tap the first corner to close it.",
    title: "Measure area",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
        <path d="M12 3l9 6-3 12H6L3 9l9-6z" />
        <path d="M12 3v18M3 9l18 0" opacity={0.5} />
      </svg>
    ),
  },
];


export function drawToolInfo(tool: DrawTool): DrawToolInfo | undefined {
  return DRAW_TOOLS.find((t) => t.tool === tool);
}
