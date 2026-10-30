import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { HelpTopic } from "./types";

interface HelpContextValue {
  open: boolean;
  openHelp: (topicId?: string) => void;
  /** Open on the Feedback tab. */
  openFeedback: () => void;
  closeHelp: () => void;
  topics: HelpTopic[];
  registerTopics: (topics: HelpTopic[]) => () => void;
  initialTopicId: string | null;
  initialTab: "guides" | "report";
}

const HelpContext = createContext<HelpContextValue | null>(null);

/** Provides the help-topic registry and drawer open state. Topics are
 *  registered by pages via useRegisterHelpTopics (mirrors the search
 *  registry pattern). */
export function HelpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [registered, setRegistered] = useState<HelpTopic[]>([]);
  const [initialTopicId, setInitialTopicId] = useState<string | null>(null);
  const [initialTab, setInitialTab] = useState<"guides" | "report">("guides");

  const openHelp = useCallback((topicId?: string) => {
    setInitialTopicId(topicId ?? null);
    setInitialTab("guides");
    setOpen(true);
  }, []);
  const openFeedback = useCallback(() => {
    setInitialTopicId(null);
    setInitialTab("report");
    setOpen(true);
  }, []);

  const registerTopics = useCallback((topics: HelpTopic[]) => {
    setRegistered((prev) => {
      const ids = new Set(topics.map((t) => t.id));
      return [...prev.filter((t) => !ids.has(t.id)), ...topics];
    });
    return () => {
      const ids = new Set(topics.map((t) => t.id));
      setRegistered((prev) => prev.filter((t) => !ids.has(t.id)));
    };
  }, []);

  const value = useMemo(
    () => ({
      open,
      openHelp,
      openFeedback,
      closeHelp: () => setOpen(false),
      topics: registered,
      registerTopics,
      initialTopicId,
      initialTab,
    }),
    [open, openHelp, openFeedback, registered, registerTopics, initialTopicId, initialTab],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelpContext(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelpContext must be used within HelpProvider");
  return ctx;
}
