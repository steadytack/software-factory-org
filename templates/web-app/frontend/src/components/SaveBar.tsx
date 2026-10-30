import { Loader2 } from "lucide-react";

import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

/** Floating "Unsaved changes · Discard · Save" bar for a page edited in
 *  place. Only there while something is unsaved, so the page never shows an
 *  idle Save button; on phones it sits above the tab bar. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty && !saving) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-2 z-(--z-header) mt-2 flex items-center gap-2 rounded-xl border border-border bg-popover py-2 pr-2 pl-4 shadow-lg md:bottom-4"
    >
      <span className="flex-1 text-sm font-medium text-foreground">Unsaved changes</span>
      <Button variant="ghost" onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button onClick={onSave} disabled={saving}>
        {saving && <Loader2 className="animate-spin" />}
        {saving ? "Saving…" : "Save"}
        {!saving && <Kbd className="ml-1 hidden bg-primary-foreground/15 text-primary-foreground md:inline-flex">Ctrl S</Kbd>}
      </Button>
    </div>
  );
}
