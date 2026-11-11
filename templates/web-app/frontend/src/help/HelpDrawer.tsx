import { useEffect, useState } from "react";
// feature:help.guides:start
import { useMemo } from "react";
import { ChevronDown, Search } from "lucide-react";
import Markdown from "react-markdown";
import { useLocation } from "react-router-dom";
// feature:help.guides:end

import { useHelpContext, type HelpTab } from "./HelpContext";
// feature:help.guides:start
import type { HelpTopic } from "./types";
import { guidesFor } from "./guides";
// feature:help.guides:end
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
// feature:help.guides:start
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/ui/collapsible";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
// feature:help.guides:end
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
// feature:help.feedback:start
import { FeedbackForm } from "./FeedbackForm";
// feature:help.feedback:end
// feature:help.guides:start
import { handleArrowNav } from "../lib/arrowNav";
// feature:help.guides:end

// feature:help.guides:start
const TOPIC_TRIGGER = "[data-help-topic-trigger]";

function topicMatches(topic: HelpTopic, query: string): boolean {
  const q = query.toLowerCase();
  if (topic.title.toLowerCase().includes(q)) return true;
  if (topic.group.toLowerCase().includes(q)) return true;
  if (topic.body.toLowerCase().includes(q)) return true;
  return (topic.keywords ?? []).some((k) => k.toLowerCase().includes(q));
}

function TopicCard({
  topic,
  defaultExpanded,
}: {
  topic: HelpTopic;
  defaultExpanded?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultExpanded} className="group/topic border-b border-border last:border-b-0">
      <CollapsibleTrigger data-help-topic-trigger className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50">
        <span className="flex-1 text-sm font-medium text-foreground">{topic.title}</span>
        {topic.badge && <Badge variant="secondary">{topic.badge}</Badge>}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]/topic:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="help-markdown space-y-2 px-4 pb-3 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:border [&_code]:border-border [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_li]:ml-4 [&_ol]:list-decimal [&_strong]:text-foreground [&_ul]:list-disc">
        <Markdown skipHtml>{topic.body}</Markdown>
      </CollapsibleContent>
    </Collapsible>
  );
}

// feature:help.guides:end
/** Right-hand slide-over: searchable help topics (Guides), and a form to
 *  send feedback (Feedback). */
export function HelpDrawer() {
  const { open, closeHelp, initialTab } = useHelpContext();
  // feature:help.guides:start
  const { initialTopicId } = useHelpContext();
  const { pathname } = useLocation();
  const topics = useMemo(() => guidesFor(pathname), [pathname]);
  const [query, setQuery] = useState("");
  // feature:help.guides:end
  const [tab, setTab] = useState<HelpTab>(initialTab);

  useEffect(() => {
    if (open) {
      // feature:help.guides:start
      setQuery("");
      // feature:help.guides:end
      setTab(initialTab);
    }
  }, [open, initialTab]);

  // feature:help.guides:start
  const filtered = useMemo(() => {
    const list = query.trim()
      ? topics.filter((t) => topicMatches(t, query))
      : topics;
    return [...list].sort((a, b) => {
      if (a.group !== b.group) return a.group.localeCompare(b.group);
      return (a.order ?? 50) - (b.order ?? 50);
    });
  }, [topics, query]);

  const groups = useMemo(() => {
    const map = new Map<string, HelpTopic[]>();
    for (const t of filtered) {
      const list = map.get(t.group) ?? [];
      list.push(t);
      map.set(t.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  // feature:help.guides:end
  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeHelp()}>
      <SheetContent className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[400px] data-[side=right]:sm:max-w-[400px]">
        <Tabs value={tab} onValueChange={(v) => setTab(v as HelpTab)} className="flex min-h-0 flex-1 flex-col gap-0">
          <SheetHeader className="border-b border-border pb-0">
            <SheetTitle>Help</SheetTitle>
            <SheetDescription>Guides for the page you're on, or send us feedback.</SheetDescription>
            <TabsList variant="line" className="mt-1 w-full justify-start">
              {/* feature:help.guides:start */}
              <TabsTrigger value="guides" className="flex-none px-3">
                Guides
              </TabsTrigger>
              {/* feature:help.guides:end */}
              {/* feature:help.feedback:start */}
              <TabsTrigger value="report" className="flex-none px-3">
                Feedback
              </TabsTrigger>
              {/* feature:help.feedback:end */}
            </TabsList>
          </SheetHeader>

          {/* feature:help.guides:start */}
          <TabsContent value="guides" className="flex min-h-0 flex-1 flex-col">
            <div className="relative border-b border-border p-3">
              <Search className="pointer-events-none absolute top-1/2 left-5.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search help topics…"
                aria-label="Search help"
                className="pl-8"
                onKeyDown={(e) => {
                  // ↓ from the search box drops into the topic list.
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    document.querySelector<HTMLElement>(TOPIC_TRIGGER)?.focus();
                  }
                }}
              />
            </div>
            {/* ↑/↓/Home/End move between topics; Enter/Space expand one. */}
            <div className="flex-1 overflow-y-auto" onKeyDown={(e) => handleArrowNav(e, TOPIC_TRIGGER)}>
              {groups.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No help topics match &ldquo;{query}&rdquo;.
                </p>
              ) : (
                groups.map(([group, groupTopics]) => (
                  <div key={group}>
                    <p className="px-4 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {group}
                    </p>
                    {groupTopics.map((t) => (
                      <TopicCard
                        key={t.id}
                        topic={t}
                        defaultExpanded={t.id === initialTopicId || groupTopics.length === 1}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </TabsContent>
          {/* feature:help.guides:end */}

          {/* feature:help.feedback:start */}
          <TabsContent value="report" className="min-h-0 flex-1 overflow-y-auto">
            {/* Mounted only while shown, so the screenshot is of the page as it is now. */}
            {tab === "report" && <FeedbackForm onSent={closeHelp} />}
          </TabsContent>
          {/* feature:help.feedback:end */}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
