import { useEffect } from "react";

import { useHelpContext } from "./HelpContext";
import type { HelpTopic } from "./types";

/** Registers help topics while the calling component is mounted.
 *  Mirrors the search-registry pattern: pass a memoized topic list. */
export function useRegisterHelpTopics(topics: HelpTopic[]): void {
  const { registerTopics } = useHelpContext();
  const serialized = topics.map((t) => t.id).join("|");
  useEffect(() => {
    return registerTopics(topics);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, registerTopics]);
}
