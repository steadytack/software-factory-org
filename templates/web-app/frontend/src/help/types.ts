import type { ReactNode } from "react";

/** A single topic shown in the Help drawer. */
export interface HelpTopic {
  /** Unique identifier. */
  id: string;
  /** Short heading shown in the list and search results. */
  title: string;
  /** Body content — plain text or JSX. */
  body: ReactNode;
  /** Grouping label; topics with the same group appear under one heading. */
  group: string;
  /** Extra keywords used when filtering. */
  keywords?: string[];
  /** Optional badge label, e.g. "New". */
  badge?: string;
  /** Sort order within the group (lower = first). Defaults to 50. */
  order?: number;
}
