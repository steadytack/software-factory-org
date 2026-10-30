/** Location search, top-left over the map. Desktop: always a bar. Phone (`collapsible`): a single search
 *  button that opens into the full-width bar and folds away again, so the map stays clear. Styled with
 *  theme tokens so it adapts to light/dark. The base map is chosen in the panel's Layers tab. */
import { useEffect, useRef, useState } from "react";
import type { SearchSuggestion } from "./hooks/useMapSearch";
import { ChevronLeft, Loader2, MapPin, Navigation, Search, X } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { WithTooltip } from "../ui/with-tooltip";

interface Props {
  query: string;
  suggestions: SearchSuggestion[];
  loading: boolean;
  onQueryChange: (q: string) => void;
  onSearch: (q: string) => void;
  onSelectSuggestion: (s: SearchSuggestion) => void;
  onClearSearch: () => void;
  /** Phone: start as one button and expand on tap. */
  collapsible?: boolean;
}

export function MapSearchBar({
  query,
  suggestions,
  loading,
  onQueryChange,
  onSearch,
  onSelectSuggestion,
  onClearSearch,
  collapsible = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);
  const collapsed = collapsible && !expanded;

  useEffect(() => {
    if (collapsible && expanded) inputRef.current?.focus();
  }, [collapsible, expanded]);

  const collapse = () => {
    setHighlightIndex(-1);
    setExpanded(false);
  };
  const choose = (s: SearchSuggestion) => {
    onSelectSuggestion(s);
    setHighlightIndex(-1);
    if (collapsible) setExpanded(false);
  };

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (collapsible) collapse();
      else {
        setHighlightIndex(-1);
        inputRef.current?.blur();
      }
      return;
    }
    if (suggestions.length === 0) {
      if (e.key === "Enter") onSearch(query);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        choose(suggestions[highlightIndex]);
      } else {
        onSearch(query);
      }
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="Search for a location"
        aria-expanded={false}
        onClick={() => setExpanded(true)}
        className="glass absolute left-2.5 top-2.5 z-(--z-sticky) grid size-11 place-items-center rounded-xl text-foreground transition-colors"
      >
        <Search aria-hidden className="size-5" />
      </button>
    );
  }

  return (
    <div className="absolute left-2.5 right-2.5 top-2.5 z-(--z-sticky) flex flex-col gap-2 md:right-auto md:w-[min(24rem,calc(100vw-120px))]">
      {/* Search row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(query);
        }}
        autoComplete="off"
        data-field-shell
        className="glass flex h-11 items-center gap-1 rounded-xl pl-1 pr-1 md:map-panel md:h-9 md:pl-3"
      >
        {collapsible ? (
          <button
            type="button"
            aria-label="Collapse search"
            onClick={collapse}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft aria-hidden className="size-5" />
          </button>
        ) : (
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          ref={inputRef}
          aria-label="Search for a location"
          spellCheck={false}
          placeholder="Search a place, postcode or grid reference"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className="h-full min-w-0 flex-1 truncate bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
        />
        {query && (
          <WithTooltip label="Clear">
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                onClearSearch();
                setHighlightIndex(-1);
                inputRef.current?.focus();
              }}
              className="grid size-6 shrink-0 place-items-center rounded-sm pointer-coarse:size-9 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </WithTooltip>
        )}
        <Button type="submit" size="sm" disabled={loading} className="h-7 px-3 pointer-coarse:h-9 pointer-coarse:min-w-11">
          {loading ? <Loader2 className="animate-spin" /> : "Go"}
        </Button>
      </form>

      {/* Autocomplete suggestions */}
      {suggestions.length > 0 && (
        <div
          role="listbox"
          className="glass overflow-hidden rounded-xl p-1 md:map-panel"
        >
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={i === highlightIndex}
              onClick={() => choose(s)}
              onMouseEnter={() => setHighlightIndex(i)}
              className={cn(
                "flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left transition-colors",
                i === highlightIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent",
              )}
            >
              {s.id.startsWith("coord-") ? (
                <Navigation aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-dense leading-tight text-foreground">
                  {s.label}
                </span>
                {s.sublabel && s.sublabel !== s.label && (
                  <span className="block truncate text-xs leading-tight text-muted-foreground">
                    {s.sublabel}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
