import { useState } from "react";
import { Bookmark, Plus, X } from "lucide-react";

import type { SavedViewsApi } from "../../../hooks/useSavedViews";
import { IconButton } from "../icon-button";
import { Input } from "../input";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";

/** Toolbar popover: save the current filter/sort/columns as a named view,
 *  apply one, or delete one. */
export function SavedViewsMenu({
  savedViews,
  onApply,
  triggerClassName,
}: {
  savedViews: SavedViewsApi;
  onApply: (viewId: string) => void;
  triggerClassName?: string;
}) {
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  return (
    <Popover open={viewsMenuOpen} onOpenChange={setViewsMenuOpen}>
      <PopoverTrigger asChild>
        <IconButton label="Saved views" variant="secondary" className={triggerClassName}>
          <Bookmark />
        </IconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-0 p-1">
        <form
          className="flex items-center gap-1 px-1 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            const state = savedViews.captureState();
            if (state && viewName.trim()) {
              savedViews.saveView(viewName.trim(), state);
              setViewName("");
              setViewsMenuOpen(false);
            }
          }}
        >
          <Input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="Save current view as…"
            aria-label="View name"
            className="h-8 min-w-0 flex-1 text-sm"
          />
          <IconButton label="Save view" type="submit" disabled={!viewName.trim()}>
            <Plus />
          </IconButton>
        </form>
        {savedViews.views.length > 0 && <div className="my-1 border-t border-border" />}
        {savedViews.views.map((v) => (
          <div
            key={v.id}
            className="group/view flex items-center gap-1 rounded-sm pr-1 transition-colors hover:bg-muted"
          >
            <button
              type="button"
              className="flex-1 truncate px-2 py-2 text-left text-sm text-foreground"
              onClick={() => {
                onApply(v.id);
                setViewsMenuOpen(false);
              }}
            >
              {v.name}
            </button>
            <IconButton
              label={`Delete view ${v.name}`}
              size="icon-xs"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => savedViews.deleteView(v.id)}
            >
              <X />
            </IconButton>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
