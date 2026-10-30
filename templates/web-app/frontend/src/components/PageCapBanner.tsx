import { PageMessage } from "./ui/page-message";

/** Honesty banner for a silently-capped list.
 *
 *  the comments and attachments tabs search and sort a set the
 *  server silently capped at its default limit of 100, with no indication
 *  that more rows exist — even though the server returns `total` and this
 *  exact banner already existed inside `ManagedDataTable`. Extracted so both
 *  the table and the record tabs tell the same truth in the same words. */
export function PageCapBanner({
  loaded,
  total,
  noun,
}: {
  loaded: number;
  /** Server-side total. `undefined` while loading. */
  total: number | undefined;
  /** Plural noun for the message, e.g. "comments". */
  noun: string;
}) {
  if (total == null || total <= loaded) return null;
  return (
    <PageMessage tone="warning" className="mb-2">
      Showing {loaded} of {total} {noun} — search and sorting cover only the
      loaded {noun}.
    </PageMessage>
  );
}
