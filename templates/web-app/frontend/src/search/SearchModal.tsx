import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getSearchItems,
  matchesQuery,
  subscribeSearchItems,
  type SearchItem,
} from "./registry";
import { useSearchStore } from "./searchStore";
import { useRecordSearch } from "./useRecordSearch";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "../components/ui/command";
import { Kbd } from "../components/ui/kbd";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

/** Command palette over the search registry. Our own `matchesQuery` does the
 *  filtering (cmdk's built-in scoring is off) so recents ordering is kept. */
export function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");

  const allItems = useSyncExternalStore(
    subscribeSearchItems,
    getSearchItems,
    getSearchItems,
  );
  const navigate = useNavigate();
  const records = useRecordSearch(query, open);
  const recents = useSearchStore((s) => s.recents);
  const pushRecent = useSearchStore((s) => s.pushRecent);

  const grouped = useMemo(() => {
    const trimmed = query.trim();
    let result: SearchItem[];
    if (!trimmed && recents.length > 0) {
      const recentItems = recents
        .map((id) => allItems.find((i) => i.id === id))
        .filter((i): i is SearchItem => Boolean(i));
      const rest = allItems.filter((i) => !recents.includes(i.id));
      result = [...recentItems, ...rest];
    } else {
      result = allItems.filter((i) => matchesQuery(i, query));
    }
    const groups = new Map<string, SearchItem[]>();
    for (const item of result) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    // Server matches on surveys, after the local ones.
    for (const hit of records.data ?? []) {
      const list = groups.get(hit.group) ?? [];
      list.push({
        id: hit.id,
        label: hit.label,
        group: hit.group,
        hint: hit.hint,
        action: () => navigate(hit.to),
      });
      groups.set(hit.group, list);
    }
    return [...groups.entries()];
  }, [allItems, query, recents, records.data, navigate]);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  function runItem(item: SearchItem) {
    pushRecent(item.id);
    onClose();
    item.action();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Search"
      description="Jump to a page, site or survey, or run a command."
      className="sm:max-w-lg"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search sites and surveys…"
          aria-label="Search"
        />
        <CommandList className="max-h-80">
          {records.isFetching && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Searching records…
            </div>
          )}
          <CommandEmpty>No results for &ldquo;{query}&rdquo;</CommandEmpty>
          {grouped.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem key={item.id} value={item.id} onSelect={() => runItem(item)}>
                  {item.icon}
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint && <CommandShortcut>{item.hint}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
          <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
        </div>
      </Command>
    </CommandDialog>
  );
}
