import type { CSSProperties } from "react";

/** Per-column options, set on `ColumnDef.meta`: inline editing plus
 *  layout. Cells never wrap by default, so a value like "51.5, -0.12"
 *  stays on one line; columns size to their content unless told otherwise. */
export interface EditableColumnMeta {
  editable?: boolean;
  type?: "text" | "select";
  options?: readonly string[];
  /** "shrink" hugs the content (checkboxes, icon actions); a CSS length
   *  sets a minimum width (e.g. "14rem" for a name column). */
  width?: "shrink" | string;
  /** Long free text: cap the column at this width and truncate with an
   *  ellipsis (full value in the tooltip). */
  maxWidth?: string;
  /** Allow this column's cells to wrap instead of truncating. */
  wrap?: boolean;
  align?: "left" | "right";
}

export function columnStyle(meta: EditableColumnMeta | undefined): CSSProperties | undefined {
  if (!meta?.width) return undefined;
  return meta.width === "shrink" ? { width: "1%" } : { minWidth: meta.width };
}
