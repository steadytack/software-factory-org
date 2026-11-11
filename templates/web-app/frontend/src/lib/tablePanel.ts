/** A table inside a page that scrolls on its own, header in view, once it is taller than this. A short
 *  table takes only the height it needs (the panel is a column that may shrink its table). Put the
 *  table in a `<div className={TABLE_PANEL}>` and do not set `autoHeight` on it. */
export const TABLE_PANEL = "flex max-h-[min(34rem,70vh)] flex-col";
