/** Draw tab: everything about drawing in one place — the tools, the
 *  sketches made with them (list, per-sketch styling, delete all),
 *  snapping, and how measurements are shown. On desktop the tools are also
 *  on the map's draw rail. */
import { useEffect, useState } from "react";
import { ChevronRight, Circle, Crosshair, Eye, EyeOff, MapPin, Minus, Pentagon, Ruler, Trash2 } from "lucide-react";

import type { DrawFeature, DrawTool } from "../draw/types";
import { DRAW_TOOLS } from "../draw/tools";
import type { AreaUnits, CoordFormat, DistanceUnits, MeasureSettings } from "../utils/measurement";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { RowActionButton } from "@/components/ui/row-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { cn } from "@/lib/utils";
import { FieldRow, Section, SwitchRow } from "./primitives";
import { BulkStyleEditor, SketchStyleEditor } from "./StyleEditor";
import { WithTooltip } from "../../ui/with-tooltip";

export interface DrawTabProps {
  activeTool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  features: DrawFeature[];
  onUpdate: (id: string, changes: Partial<DrawFeature>) => void;
  /** The same change to several sketches. */
  onUpdateMany: (ids: string[], changes: Partial<DrawFeature>) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  /** The sketch picked on the map, if any: its row opens. */
  selectedId: string | null;
  /** Pick (or with null let go of) a sketch on the map. */
  onSelect: (id: string | null) => void;
  onZoom: (feature: DrawFeature) => void;
  onClearAll: () => void;
  visible: boolean;
  onToggleVisible: () => void;
  snapEnabled: boolean;
  onSnapChange: (on: boolean) => void;
  measureSettings: MeasureSettings;
  onMeasureSettingsChange: (s: Partial<MeasureSettings>) => void;
}

const KIND_ICON: Record<DrawFeature["kind"], typeof MapPin> = {
  marker: MapPin,
  note: MapPin,
  polyline: Minus,
  polygon: Pentagon,
  circle: Circle,
  measurement: Ruler,
};

const COORD_FORMATS: { value: CoordFormat; label: string }[] = [
  { value: "bng", label: "BNG easting, northing" },
  { value: "gridref", label: "OS grid reference" },
  { value: "latlng", label: "Latitude, longitude" },
];

const DISTANCE_UNITS: { value: DistanceUnits; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "m", label: "Metres" },
  { value: "km", label: "Kilometres" },
  { value: "imperial", label: "Feet / miles" },
];
const AREA_UNITS: { value: AreaUnits; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "m2", label: "Square metres" },
  { value: "ha", label: "Hectares" },
  { value: "acres", label: "Acres" },
];

export function DrawTab(p: DrawTabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"all" | "checked" | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const count = p.features.length;
  const checkedFeatures = p.features.filter((f) => checked.includes(f.id));

  // A sketch picked on the map opens its row, and comes into view.
  useEffect(() => {
    if (!p.selectedId) return;
    setOpen(p.selectedId);
    document.getElementById(`sketch-${p.selectedId}`)?.scrollIntoView({ block: "nearest" });
  }, [p.selectedId]);
  // Forget ticks for sketches that are gone.
  useEffect(() => {
    setChecked((prev) => (prev.every((id) => p.features.some((f) => f.id === id)) ? prev : prev.filter((id) => p.features.some((f) => f.id === id))));
  }, [p.features]);

  return (
    <div>
      <Section title="Tools">
        <div role="toolbar" aria-label="Draw and measure" className="grid grid-cols-3 gap-2">
          {DRAW_TOOLS.map((t) => {
            const active = p.activeTool === t.tool;
            return (
              <WithTooltip key={t.tool} label={t.title}>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={t.title}
                  onClick={() => p.onToolChange(t.tool)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-foreground/80 hover:bg-muted",
                  )}
                >
                  <span aria-hidden className="block size-5">
                    {t.icon}
                  </span>
                  {t.label}
                </button>
              </WithTooltip>
            );
          })}
        </div>
      </Section>

      <Section
        title={count === 1 ? "1 sketch" : `${count} sketches`}
        action={
          <>
            <IconButton label={p.visible ? "Hide all sketches" : "Show all sketches"} onClick={p.onToggleVisible}>
              {p.visible ? <Eye /> : <EyeOff />}
            </IconButton>
            <IconButton
              label="Delete all sketches"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={count === 0}
              onClick={() => setConfirm("all")}
            >
              <Trash2 />
            </IconButton>
          </>
        }
      >
        {count === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-dense text-muted-foreground">
            No sketches yet.
          </p>
        ) : (
          <>
            {count > 1 && (
              <div className="mb-2 flex min-h-8 items-center gap-2 text-dense">
                <Checkbox
                  aria-label="Select all sketches"
                  checked={checked.length === count ? true : checked.length > 0 ? "indeterminate" : false}
                  onCheckedChange={(v) => setChecked(v === true ? p.features.map((f) => f.id) : [])}
                />
                {checked.length === 0 ? (
                  <span className="text-muted-foreground">Select all</span>
                ) : (
                  <>
                    <span className="font-medium text-foreground tnum">{checked.length} selected</span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button type="button" variant="outline" size="sm" aria-expanded={bulkOpen} onClick={() => setBulkOpen((v) => !v)}>
                        Style
                      </Button>
                      <IconButton
                        label={`Delete ${checked.length} selected`}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirm("checked")}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  </>
                )}
              </div>
            )}
            {checked.length > 0 && bulkOpen && (
              <div className="mb-3 rounded-md border border-border bg-card p-3">
                <BulkStyleEditor features={checkedFeatures} onChange={(c) => p.onUpdateMany(checked, c)} />
              </div>
            )}
            <ul className="-mx-3 border-y border-border">
              {p.features.map((f) => {
                const Icon = KIND_ICON[f.kind] ?? MapPin;
                const isOpen = open === f.id;
                return (
                  <li key={f.id} id={`sketch-${f.id}`} className="border-b border-border last:border-b-0">
                    <div className="flex items-center gap-1 py-2 pl-3 pr-2">
                      {count > 1 && (
                        <Checkbox
                          aria-label={`Select ${f.name}`}
                          className="mr-1"
                          checked={checked.includes(f.id)}
                          onCheckedChange={(v) => setChecked((prev) => (v === true ? [...prev, f.id] : prev.filter((id) => id !== f.id)))}
                        />
                      )}
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => {
                          const next = isOpen ? null : f.id;
                          setOpen(next);
                          p.onSelect(next);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-left hover:text-primary"
                      >
                        <ChevronRight
                          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                        />
                        <Icon className="size-4 shrink-0" style={{ color: f.color }} />
                        <span className="min-w-0 flex-1 truncate text-dense">{f.label || f.name}</span>
                      </button>
                      <RowActionButton label="Zoom to sketch" size="icon-xs" className="size-7" onClick={() => p.onZoom(f)}>
                        <Crosshair />
                      </RowActionButton>
                      <RowActionButton
                        label="Delete sketch"
                        tone="destructive"
                        size="icon-xs"
                        className="size-7"
                        onClick={() => p.onDelete(f.id)}
                      >
                        <Trash2 />
                      </RowActionButton>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-1">
                        <SketchStyleEditor feature={f} onChange={(c) => p.onUpdate(f.id, c)} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      <Section title="Snapping">
        <SwitchRow label="Snap while drawing" checked={p.snapEnabled} onCheckedChange={p.onSnapChange} />
      </Section>

      <Section title="Labels">
        <div className="grid grid-cols-2 gap-(--card-gap)">
          <FieldRow label="Length units">
            <Select value={p.measureSettings.units} onValueChange={(v) => p.onMeasureSettingsChange({ units: v as DistanceUnits })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Length units">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISTANCE_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Area units">
            <Select value={p.measureSettings.areaUnits} onValueChange={(v) => p.onMeasureSettingsChange({ areaUnits: v as AreaUnits })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Area units">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREA_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
        </div>
        <div className="mt-2">
          <SwitchRow label="Segment lengths" checked={p.measureSettings.showSegments} onCheckedChange={(v) => p.onMeasureSettingsChange({ showSegments: v })} />
          <SwitchRow label="Total length / area" checked={p.measureSettings.showTotal} onCheckedChange={(v) => p.onMeasureSettingsChange({ showTotal: v })} />
          <SwitchRow label="Perimeter of areas" checked={p.measureSettings.showPerimeter} onCheckedChange={(v) => p.onMeasureSettingsChange({ showPerimeter: v })} />
          <SwitchRow label="Tick marks every 100 m" checked={p.measureSettings.showTicks} onCheckedChange={(v) => p.onMeasureSettingsChange({ showTicks: v })} />
        </div>
        <div className="mt-3 grid gap-2 border-t border-border pt-3">
          <FieldRow label="Coordinates">
            <Select value={p.measureSettings.coordFormat} onValueChange={(v) => p.onMeasureSettingsChange({ coordFormat: v as CoordFormat })}>
              <SelectTrigger size="sm" className="w-full" aria-label="Coordinate format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COORD_FORMATS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <SwitchRow
            label="Centre of shapes"
            checked={p.measureSettings.coordCentre}
            onCheckedChange={(v) => p.onMeasureSettingsChange({ coordCentre: v })}
          />
        </div>
      </Section>

      <DeleteConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "all") p.onClearAll();
          else p.onDeleteMany(checked);
          setChecked([]);
          setConfirm(null);
        }}
        count={confirm === "checked" ? checked.length : count}
        entityLabel="sketch"
        entityLabelPlural="sketches"
      />
    </div>
  );
}
