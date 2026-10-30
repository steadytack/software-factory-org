/** UTF-8 byte-order mark — Excel needs it to read the file as UTF-8. */
export const BOM = "﻿";

/** Text a global search should match for one cell value.
 *
 *  whitespace-normalised and accent-folded, so "Regents" matches
 *  "Regent's Park" and a stray double space does not defeat a search. The
 *  audit recorded the absence of both.
 */
export function searchableText(value: unknown): string {
  return (
    String(value ?? "")
      .normalize("NFD")
      // Strip combining marks (é → e) so an accented name is findable from a
      // plain-ASCII keyboard.
      .replace(/[̀-ͯ]/g, "")
      .replace(/[‘’']/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

const PLAIN_NEGATIVE_NUMBER = /^-\d+(\.\d+)?$/;

export function csvCell(value: string): string {
  // Guard against CSV formula injection: a cell starting with =, +, - or @
  // could execute as a formula when opened in a spreadsheet app. A plain
  // negative number ("-0.12", a western longitude) is just a number and is
  // left alone — prefixing it turned it into text (audit R2-EXP-1).
  if (/^[=+\-@]/.test(value) && !PLAIN_NEGATIVE_NUMBER.test(value)) {
    value = "'" + value;
  }
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
