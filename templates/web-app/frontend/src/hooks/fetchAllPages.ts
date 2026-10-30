/** The API caps a page at 200 rows. Views that filter and count on the client
 *  (the Surveys table, a site's survey list) need every row, so
 *  they walk the pages up to `cap` — and report the server total, so a view
 *  that did hit the cap can say so instead of silently showing a subset. */
export const PAGE_SIZE = 200;
export const DEFAULT_CAP = 2000;

export async function fetchAllPages<T>(
  fetchPage: (offset: number, limit: number) => Promise<{ total: number; items: T[] }>,
  cap = DEFAULT_CAP,
): Promise<{ total: number; items: T[] }> {
  const first = await fetchPage(0, PAGE_SIZE);
  const items = [...first.items];
  const target = Math.min(first.total, cap);
  while (items.length < target) {
    const page = await fetchPage(items.length, PAGE_SIZE);
    if (page.items.length === 0) break;
    items.push(...page.items);
  }
  return { total: first.total, items: items.slice(0, cap) };
}
