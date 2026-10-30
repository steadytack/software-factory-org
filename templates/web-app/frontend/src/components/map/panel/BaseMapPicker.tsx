/** Base map choice, at the top of the Layers tab: one chip per map,
 *  grouped by provider. A radio group; ↑/↓ move between options. */
import { Check } from "lucide-react";

import { BASE_LAYERS, type BaseLayer } from "../mapLayers";
import { handleArrowNav } from "@/lib/arrowNav";
import { cn } from "@/lib/utils";

export function BaseMapPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const groups = new Map<string, BaseLayer[]>();
  for (const layer of BASE_LAYERS) {
    const list = groups.get(layer.group) ?? [];
    list.push(layer);
    groups.set(layer.group, list);
  }
  return (
    <div role="radiogroup" aria-label="Base map" onKeyDown={(e) => handleArrowNav(e, '[role="radio"]')} className="space-y-2">
      {[...groups.entries()].map(([group, layers]) => (
        <div key={group}>
          <p className="pb-1 text-xs text-muted-foreground">{group}</p>
          <div className="grid grid-cols-2 gap-2">
            {layers.map((layer) => {
              const selected = value === layer.key;
              return (
                <button
                  key={layer.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onChange(layer.key)}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition-colors",
                    selected
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border text-foreground/80 hover:bg-muted",
                  )}
                >
                  <span className="grid size-3.5 shrink-0 place-items-center">
                    {selected && <Check className="size-3.5 text-primary" />}
                  </span>
                  <span className="truncate">{layer.label.replace(`${group} `, "")}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
