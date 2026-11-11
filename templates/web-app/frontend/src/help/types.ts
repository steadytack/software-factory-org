/** A single section shown in Help → Guides (one `##` heading of a guide file). */
export interface HelpTopic {
  /** Unique identifier: the heading's `{#id}`, or a slug of file and title. */
  id: string;
  /** Short heading shown in the list and search results. */
  title: string;
  /** Body, as markdown. */
  body: string;
  /** Grouping label; topics with the same group appear under one heading. */
  group: string;
  /** Extra keywords used when filtering. */
  keywords?: string[];
  /** Optional badge label, e.g. "New". */
  badge?: string;
  /** Sort order within the group (lower = first). */
  order?: number;
  /** Route patterns this topic belongs to; none means every page. */
  pages?: string[];
}
