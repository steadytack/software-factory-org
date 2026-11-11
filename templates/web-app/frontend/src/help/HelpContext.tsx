import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type HelpTab = "guides" | "report";

/** The tab Help opens on: Guides, or Feedback when an app has no guides. */
// feature:help.guides:start
const FIRST_TAB: HelpTab = "guides";
// feature:help.guides:else
// const FIRST_TAB: HelpTab = "report";
// feature:help.guides:end

interface HelpContextValue {
  open: boolean;
  openHelp: (topicId?: string) => void;
  /** Open on the Feedback tab. */
  openFeedback: () => void;
  closeHelp: () => void;
  initialTopicId: string | null;
  initialTab: HelpTab;
}

const HelpContext = createContext<HelpContextValue | null>(null);

/** Provides the Help drawer's open state. The guides themselves are
 *  markdown files (help/guides/*.md), chosen by route in the drawer. */
export function HelpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialTopicId, setInitialTopicId] = useState<string | null>(null);
  const [initialTab, setInitialTab] = useState<HelpTab>(FIRST_TAB);

  const openHelp = useCallback((topicId?: string) => {
    setInitialTopicId(topicId ?? null);
    setInitialTab(FIRST_TAB);
    setOpen(true);
  }, []);
  const openFeedback = useCallback(() => {
    setInitialTopicId(null);
    setInitialTab("report");
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      open,
      openHelp,
      openFeedback,
      closeHelp: () => setOpen(false),
      initialTopicId,
      initialTab,
    }),
    [open, openHelp, openFeedback, initialTopicId, initialTab],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelpContext(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelpContext must be used within HelpProvider");
  return ctx;
}
