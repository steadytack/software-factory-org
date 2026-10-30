/** Style editors for the kinds of map content — data layers, the record
 *  layers (sites, surveys) and individual sketches —
 *  built from the same field primitives so they look and behave alike. */
import { useId, useMemo } from "react";

import type { DataLayerStyle, MapDataLayer, PointShape } from "../layers/types";
import {
  NO_FIELD,
  POINT_LAYERS,
  activeField,
  defaultFilter,
  defaultStyle,
  type PointLayerFilter,
  type PointLayerKey,
  type PointLayerState,
  type PointLayerStyle,
} from "../layers/pointLayers";
import { defaultSchemeFor, schemeColors, schemesFor } from "../layers/colorSchemes";
import { filteredIndices, summariseProperties, type DataLayerFilter } from "../layers/dataFilter";
import type { DrawFeature, LineStyle } from "../draw/types";
import type { HatchStyle } from "../utils/hatchPatterns";
import { LAYER_PRESETS } from "../layerStyles";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorField, FieldRow, SliderField, SwitchRow } from "./primitives";

const PATTERNS: { value: HatchStyle; label: string }[] = [
  { value: "none", label: "Solid fill" },
  { value: "diag-forward", label: "Diagonal /" },
  { value: "diag-backward", label: "Diagonal \\" },
  { value: "vertical", label: "Vertical lines" },
  { value: "horizontal", label: "Horizontal lines" },
  { value: "cross", label: "Grid" },
  { value: "diag-cross", label: "Diagonal grid" },
  { value: "dots-small", label: "Small dots" },
  { value: "dots-large", label: "Large dots" },
  { value: "stipple", label: "Stipple" },
  { value: "stars", label: "Stars" },
];

const LINE_STYLES: { value: LineStyle; label: string }[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "longdash", label: "Long dash" },
  { value: "shortdash", label: "Short dash" },
];

const POINT_SHAPES: PointShape[] = ["circle", "square", "diamond", "triangle", "star", "pin", "plus", "cross", "target"];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pxf = (v: number) => `${v} px`;

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}

// ─── Data layers ─────────────────────────────────────────────────────────────

export function DataLayerStyleEditor({
  layer,
  onChange,
}: {
  layer: MapDataLayer;
  onChange: (style: Partial<DataLayerStyle>) => void;
}) {
  const s = layer.style;
  if (layer.type === "wms") {
    return (
      <div className="grid gap-3">
        <SliderField label="Opacity" value={s.fillOpacity} min={0} max={1} step={0.05} format={pct} onChange={(v) => onChange({ fillOpacity: v })} />
      </div>
    );
  }
  const fields = layer.data?.features[0]?.properties
    ? Object.keys(layer.data.features[0].properties as Record<string, unknown>)
    : [];
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <SelectField
          label="Preset"
          value={"__custom__" as string}
          options={[{ value: "__custom__", label: "Custom" }, ...LAYER_PRESETS.map((p) => ({ value: p.name, label: p.name }))]}
          onChange={(name) => {
            const preset = LAYER_PRESETS.find((p) => p.name === name);
            if (preset) onChange(preset.style);
          }}
        />
      </div>
      <ColorField label="Fill" value={s.fillColor} onChange={(v) => onChange({ fillColor: v })} />
      <ColorField label="Outline" value={s.strokeColor} onChange={(v) => onChange({ strokeColor: v })} />
      <SliderField label="Fill opacity" value={s.fillOpacity} min={0} max={1} step={0.05} format={pct} onChange={(v) => onChange({ fillOpacity: v })} />
      <SliderField label="Outline width" value={s.strokeWidth} min={0.5} max={8} step={0.5} format={pxf} onChange={(v) => onChange({ strokeWidth: v })} />
      <SelectField label="Line style" value={s.lineStyle} options={LINE_STYLES} onChange={(v) => onChange({ lineStyle: v })} />
      <SelectField
        label="Point shape"
        value={s.pointShape}
        options={POINT_SHAPES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))}
        onChange={(v) => onChange({ pointShape: v })}
      />
      <ColorField label="Point colour" value={s.pointColor} onChange={(v) => onChange({ pointColor: v })} />
      <SliderField label="Point size" value={s.pointRadius} min={2} max={16} step={1} format={pxf} onChange={(v) => onChange({ pointRadius: v })} />
      <div className="col-span-2">
        <SelectField
          label="Label"
          value={s.labelField || "__none__"}
          options={[{ value: "__none__", label: "None" }, ...fields.map((f) => ({ value: f, label: f }))]}
          onChange={(v) => onChange({ labelField: v === "__none__" ? "" : v })}
        />
      </div>
      {s.labelField && (
        <>
          <SliderField label="Label size" value={s.labelSize} min={8} max={24} step={1} format={pxf} onChange={(v) => onChange({ labelSize: v })} />
          <ColorField label="Label colour" value={s.labelColor} onChange={(v) => onChange({ labelColor: v })} />
          <div className="col-span-2">
            <SwitchRow label="Label halo" checked={s.labelHalo} onCheckedChange={(v) => onChange({ labelHalo: v })} />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sites, surveys ──────────────────────────────────────

/** What a point layer shows and how: one row per category (show it? what
 *  colour?), extra filters, then size, outline and labels. */
export function PointLayerEditor({
  layerKey,
  state,
  counts,
  onChange,
}: {
  layerKey: PointLayerKey;
  state: PointLayerState;
  /** Points per category, before filtering. */
  counts: Record<string, number>;
  onChange: (next: PointLayerState) => void;
}) {
  const def = POINT_LAYERS[layerKey];
  const { style, filter } = state;
  const setStyle = (st: Partial<PointLayerStyle>) => onChange({ ...state, style: { ...style, ...st } });
  const setFilter = (f: Partial<PointLayerFilter>) => onChange({ ...state, filter: { ...filter, ...f } });
  const toggleCategory = (value: string, shown: boolean) =>
    setFilter({ hidden: shown ? filter.hidden.filter((h) => h !== value) : [...filter.hidden, value] });
  const allShown = filter.hidden.length === 0;
  const field = activeField(def, style);
  const colorByOptions = [{ value: NO_FIELD, label: "One colour" }, ...def.fields.map((f) => ({ value: f.key, label: f.label }))];

  // Switching what the layer is coloured by starts a new list: nothing is hidden, and a field whose values
  // all still share one colour (never chosen) gets a scheme so the difference shows straight away.
  function changeColorBy(next: string) {
    const nextField = def.fields.find((f) => f.key === next) ?? null;
    let colors = style.colors;
    if (nextField) {
      const used = new Set(nextField.categories.map((c) => colors[c.value] ?? c.color));
      if (used.size === 1) colors = { ...colors, ...schemeColors(defaultSchemeFor(nextField), nextField) };
    }
    onChange({ ...state, style: { ...style, colorBy: next, colors }, filter: { ...filter, hidden: [] } });
  }
  const applyScheme = (id: string) => {
    if (field) setStyle({ colors: { ...style.colors, ...schemeColors(id, field) } });
  };

  return (
    <div className="grid gap-3">
      <SelectField label="Colour by" value={style.colorBy} options={colorByOptions} onChange={changeColorBy} />
      {!field && <ColorField label="Colour" value={style.color} onChange={(v) => setStyle({ color: v })} />}
      {field && (
        <FieldRow label="Colour scheme">
          <Select value="" onValueChange={applyScheme}>
            <SelectTrigger size="sm" className="w-full" aria-label="Colour scheme">
              <SelectValue placeholder="Apply a scheme…" />
            </SelectTrigger>
            <SelectContent>
              {schemesFor(field).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      )}
      {field && (
      <fieldset className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <legend className="text-xs font-medium text-muted-foreground">{field.label}: show and colour</legend>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setFilter({ hidden: allShown ? field.categories.map((c) => c.value) : [] })}
          >
            {allShown ? "Hide all" : "Show all"}
          </button>
        </div>
        <ul className="mt-1 grid gap-0.5">
          {field.categories.map((c) => {
            const shown = !filter.hidden.includes(c.value);
            const id = `${layerKey}-cat-${c.value}`;
            return (
              <li key={c.value} className="flex min-w-0 items-center gap-2 py-0.5">
                <Checkbox id={id} checked={shown} onCheckedChange={(v) => toggleCategory(c.value, v === true)} />
                <label htmlFor={id} className={cn("min-w-0 flex-1 truncate text-sm", !shown && "text-muted-foreground")}>
                  {c.label}
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">{counts[c.value] ?? 0}</span>
                <ColorField
                  compact
                  label={c.label}
                  value={style.colors[c.value] ?? c.color}
                  onChange={(v) => setStyle({ colors: { ...style.colors, [c.value]: v } })}
                />
              </li>
            );
          })}
        </ul>
      </fieldset>
      )}
      {/* How the markers look. */}
      <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
        <SliderField label="Size" value={style.size} min={3} max={20} step={1} format={pxf} onChange={(v) => setStyle({ size: v })} />
        <SliderField label="Opacity" value={style.opacity} min={0.1} max={1} step={0.05} format={pct} onChange={(v) => setStyle({ opacity: v })} />
        {!def.ring && (
          <ColorField label="Outline" value={style.strokeColor} onChange={(v) => setStyle({ strokeColor: v })} />
        )}
      </div>
      {/* What is shown: the switches stacked together, as under Draw → Labels. */}
      <div className="border-t border-border pt-3">
        {def.flags?.map((f) => (
          <SwitchRow
            key={f.key}
            label={f.label}
            checked={filter.flags[f.key] ?? f.default}
            onCheckedChange={(v) => setFilter({ flags: { ...filter.flags, [f.key]: v } })}
          />
        ))}
        <SwitchRow label="Show labels" checked={style.showLabels} onCheckedChange={(v) => setStyle({ showLabels: v })} />
        {style.showLabels && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <SliderField label="Label size" value={style.labelSize} min={8} max={20} step={1} format={pxf} onChange={(v) => setStyle({ labelSize: v })} />
            <ColorField label="Label colour" value={style.labelColor} onChange={(v) => setStyle({ labelColor: v })} />
          </div>
        )}
      </div>
      <button
        type="button"
        className="justify-self-start text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        onClick={() => onChange({ ...state, style: defaultStyle(def), filter: defaultFilter(def) })}
      >
        Reset to defaults
      </button>
    </div>
  );
}

// ─── Data layer filter ──────────────────────────────────────────────────────

/** Show only features where one property has chosen values (text) or
 *  falls in a range (numbers). */
export function DataLayerFilterEditor({
  layer,
  onChange,
}: {
  layer: MapDataLayer;
  onChange: (filter: DataLayerFilter | null) => void;
}) {
  const features = layer.data?.features;
  const summaries = useMemo(() => (features ? summariseProperties(features) : []), [features]);
  const filter = layer.filter ?? null;
  const current = summaries.find((p) => p.name === filter?.property);
  if (!summaries.length) return null;
  const shownCount = features ? (filteredIndices(features, filter)?.length ?? features.length) : 0;
  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <SelectField
        label="Filter by"
        value={filter?.property ?? "__none__"}
        options={[{ value: "__none__", label: "No filter (show all)" }, ...summaries.map((p) => ({ value: p.name, label: p.name }))]}
        onChange={(name) => {
          const p = summaries.find((x) => x.name === name);
          if (!p) onChange(null);
          else if (p.kind === "number") onChange({ property: p.name, min: null, max: null });
          else onChange({ property: p.name, values: [...p.values] });
        }}
      />
      {current?.kind === "text" && (
        <ul className="grid max-h-48 gap-0.5 overflow-y-auto">
          {current.values.map((v) => {
            const on = filter?.values?.includes(v) ?? true;
            const id = `${layer.id}-val-${v}`;
            return (
              <li key={v} className="flex min-w-0 items-center gap-2 py-0.5">
                <Checkbox
                  id={id}
                  checked={on}
                  onCheckedChange={(c) =>
                    onChange({
                      property: current.name,
                      values: c === true ? [...(filter?.values ?? []), v] : (filter?.values ?? current.values).filter((x) => x !== v),
                    })
                  }
                />
                <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">
                  {v === "" ? "(blank)" : v}
                </label>
              </li>
            );
          })}
          {current.more && <li className="text-xs text-muted-foreground">Only the {current.values.length} most common values are listed.</li>}
        </ul>
      )}
      {current?.kind === "number" && (
        <div className="grid grid-cols-2 gap-3">
          <RangeInput label="From" placeholder={String(current.min)} value={filter?.min ?? null} onChange={(n) => onChange({ ...filter!, min: n })} />
          <RangeInput label="To" placeholder={String(current.max)} value={filter?.max ?? null} onChange={(n) => onChange({ ...filter!, max: n })} />
        </div>
      )}
      {filter && (
        <p className="text-xs text-muted-foreground">
          Showing {shownCount.toLocaleString("en-GB")} of {(features?.length ?? 0).toLocaleString("en-GB")}.
        </p>
      )}
    </div>
  );
}

function RangeInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  const id = useId();
  return (
    <FieldRow label={label} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        className="h-8 text-sm"
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </FieldRow>
  );
}

// ─── Sketches ────────────────────────────────────────────────────────────────

/** Fill opacity only applies to features with an interior (a shape or circle, or an area measurement; not a distance). */
function hasFill(f: DrawFeature) {
  return f.geometry.type === "Polygon";
}
/** Point features have no line/measurements. */
function isLinear(f: DrawFeature) {
  return f.geometry.type === "LineString" || f.geometry.type === "Polygon";
}
/** A marker's "weight" is its size. */
function isPointKind(f: DrawFeature) {
  return f.geometry.type === "Point";
}

const allEqual = <T,>(values: T[]) => values.every((v) => v === values[0]);

/** The style of several sketches at once. Each control shows the shared value (or "Mixed") and a change is applied to every
 *  sketch it makes sense for: line style only to lines and shapes, fill only to shapes, and so on. */
export function BulkStyleEditor({
  features,
  onChange,
}: {
  features: DrawFeature[];
  onChange: (changes: Partial<DrawFeature>) => void;
}) {
  if (features.length === 0) return null;
  const linear = features.filter(isLinear);
  const filled = features.filter(hasFill);
  const labelled = features.filter((f) => f.label);
  const mixed = (pick: (f: DrawFeature) => unknown, of = features) => of.length > 1 && !allEqual(of.map(pick));
  const first = features[0];
  const onlyPoints = features.every(isPointKind);
  return (
    <div className="grid grid-cols-2 gap-3">
      <ColorField label="Colour" value={first.color} mixed={mixed((f) => f.color)} onChange={(v) => onChange({ color: v })} />
      <SliderField
        label={onlyPoints ? "Size" : "Weight"}
        value={first.weight}
        min={onlyPoints ? 3 : 0.5}
        max={onlyPoints ? 20 : 12}
        step={onlyPoints ? 1 : 0.5}
        format={mixed((f) => f.weight) ? () => "Mixed" : pxf}
        onChange={(v) => onChange({ weight: v })}
      />
      {linear.length > 0 && (
        <SelectField
          label="Line style"
          value={linear[0].lineStyle}
          options={LINE_STYLES}
          onChange={(v) => onChange({ lineStyle: v })}
        />
      )}
      {filled.length > 0 && (
        <SliderField
          label="Fill opacity"
          value={filled[0].fillOpacity}
          min={0}
          max={1}
          step={0.05}
          format={mixed((f) => f.fillOpacity, filled) ? () => "Mixed" : pct}
          onChange={(v) => onChange({ fillOpacity: v })}
        />
      )}
      {filled.length > 0 && (
        <SelectField label="Pattern" value={filled[0].hatch ?? "none"} options={PATTERNS} onChange={(v) => onChange({ hatch: v })} />
      )}
      {labelled.length > 0 && (
        <>
          <SliderField
            label="Label size"
            value={labelled[0].labelSize}
            min={9}
            max={24}
            step={1}
            format={mixed((f) => f.labelSize, labelled) ? () => "Mixed" : pxf}
            onChange={(v) => onChange({ labelSize: v })}
          />
          <ColorField
            label="Label colour"
            value={labelled[0].labelColor}
            mixed={mixed((f) => f.labelColor, labelled)}
            onChange={(v) => onChange({ labelColor: v })}
          />
        </>
      )}
      <div className="col-span-2">
        {linear.length > 0 && (
          <SwitchRow
            label="Show measurements"
            checked={linear.every((f) => f.showMeasurements)}
            onCheckedChange={(v) => onChange({ showMeasurements: v })}
          />
        )}
        <SwitchRow
          label="Show coordinates"
          checked={features.every((f) => f.showCoordinates)}
          onCheckedChange={(v) => onChange({ showCoordinates: v })}
        />
      </div>
    </div>
  );
}

export function SketchStyleEditor({
  feature: f,
  onChange,
}: {
  feature: DrawFeature;
  onChange: (changes: Partial<DrawFeature>) => void;
}) {
  const labelId = useId();
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <FieldRow label="Name" htmlFor={`${labelId}-name`}>
          <Input id={`${labelId}-name`} value={f.name} onChange={(e) => onChange({ name: e.target.value })} className="h-8 text-sm" />
        </FieldRow>
      </div>
      <ColorField label="Colour" value={f.color} onChange={(v) => onChange({ color: v })} />
      <SliderField
        label={isPointKind(f) ? "Size" : "Weight"}
        value={f.weight}
        min={isPointKind(f) ? 3 : 0.5}
        max={isPointKind(f) ? 20 : 12}
        step={isPointKind(f) ? 1 : 0.5}
        format={pxf}
        onChange={(v) => onChange({ weight: v })}
      />
      {isLinear(f) && (
        <SelectField label="Line style" value={f.lineStyle} options={LINE_STYLES} onChange={(v) => onChange({ lineStyle: v })} />
      )}
      {hasFill(f) && (
        <SliderField label="Fill opacity" value={f.fillOpacity} min={0} max={1} step={0.05} format={pct} onChange={(v) => onChange({ fillOpacity: v })} />
      )}
      {hasFill(f) && <SelectField label="Pattern" value={f.hatch ?? "none"} options={PATTERNS} onChange={(v) => onChange({ hatch: v })} />}
      <div className="col-span-2">
        <FieldRow label="Label" htmlFor={`${labelId}-label`}>
          <Input
            id={`${labelId}-label`}
            value={f.label}
            placeholder="Text shown on the map"
            onChange={(e) => onChange({ label: e.target.value })}
            className="h-8 text-sm"
          />
        </FieldRow>
      </div>
      {f.label && (
        <>
          <SliderField label="Label size" value={f.labelSize} min={9} max={24} step={1} format={pxf} onChange={(v) => onChange({ labelSize: v })} />
          <ColorField label="Label colour" value={f.labelColor} onChange={(v) => onChange({ labelColor: v })} />
        </>
      )}
      {/* One group, so the switches sit together the way they do under Labels. */}
      <div className="col-span-2">
        {isLinear(f) && (
          <SwitchRow
            label="Show measurements"
            checked={Boolean(f.showMeasurements)}
            onCheckedChange={(v) => onChange({ showMeasurements: v })}
          />
        )}
        <SwitchRow
          label="Show coordinates"
          checked={Boolean(f.showCoordinates)}
          onCheckedChange={(v) => onChange({ showCoordinates: v })}
        />
      </div>
    </div>
  );
}
