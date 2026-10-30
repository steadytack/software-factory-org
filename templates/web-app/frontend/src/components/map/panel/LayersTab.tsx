/** Layers tab: what the map shows. The base map first, then one ordered
 *  list of everything drawn on it — Sketches, Sites,
 *  Surveys and each data layer — top of the list draws on top. Drag (or
 *  focus the handle and use Space + ↑/↓) to reorder; expand a row to choose
 *  what it shows (filter) and how (style). Add data opens a
 *  dialog for GeoJSON files and map services. */
import { useState, type ReactNode } from "react";
import { ChevronRight, Crosshair, Eye, EyeOff, GripVertical, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { FeatureCollection } from "geojson";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { DataLayerStyle, MapDataLayer } from "../layers/types";
import { dataKey, isDataKey, isPointKey, type LayerKey } from "../layers/order";
import { POINT_LAYERS, activeField, isFiltered, type PointLayerKey, type PointLayerState } from "../layers/pointLayers";
import type { DataLayerFilter } from "../layers/dataFilter";
import type { ViewBox } from "../layers/external";
import { Button } from "@/components/ui/button";
import { RowActionButton } from "@/components/ui/row-actions";
import { cn } from "@/lib/utils";
import { BASE_LAYER_MAP } from "../mapLayers";
import { Section } from "./primitives";
import { DataLayerFilterEditor, DataLayerStyleEditor, PointLayerEditor } from "./StyleEditor";
import { AddDataDialog } from "./AddDataDialog";
import { BaseMapPicker } from "./BaseMapPicker";
import { DRAW_DEFAULT } from "../layers/colors";
import { WithTooltip } from "../../ui/with-tooltip";

export interface PointLayerInfo {
  state: PointLayerState;
  /** Points per category, before filtering. */
  counts: Record<string, number>;
  /** Points after filtering. */
  shown: number;
  total: number;
  /** Still loading (or failed). */
  loading?: boolean;
  /** Extra line under the editor, e.g. what can't be shown. */
  note?: string;
}

export interface LayersTabProps {
  baseLayer: string;
  onBaseLayerChange: (key: string) => void;
  order: LayerKey[];
  onReorder: (order: LayerKey[]) => void;
  dataLayers: MapDataLayer[];
  onAddGeoJSONLayer: (
    name: string,
    data: FeatureCollection,
    style?: Partial<DataLayerStyle>,
    service?: MapDataLayer["service"],
  ) => void;
  /** The map's current view, for web services. */
  getView?: () => ViewBox | undefined;
  /** Fetch a WFS / OGC API layer again for the current view. */
  onRefreshLayer?: (id: string) => void;
  onAddWMSLayer: (name: string, tileUrl: string, attribution?: string, legendUrl?: string) => void;
  onUpdateLayerStyle: (id: string, style: Partial<DataLayerStyle>) => void;
  onToggleLayerVisible: (id: string) => void;
  onRemoveLayer: (id: string) => void;
  onZoomToLayer: (id: string) => void;
  onNotify?: (message: string, tone?: "info" | "error") => void;
  onSetDataFilter: (id: string, filter: DataLayerFilter | null) => void;
  /** Sites and surveys. */
  pointLayers: Record<PointLayerKey, PointLayerInfo>;
  onPointLayerChange: (key: PointLayerKey, next: PointLayerState) => void;
  sketchVisible: boolean;
  sketchCount: number;
  onToggleSketchVisible: () => void;
  onOpenDraw: () => void;
}

function LayerRow({
  id,
  name,
  count,
  swatch,
  visible,
  onToggleVisible,
  actions,
  filtered,
  expanded,
  onToggleExpanded,
  children,
}: {
  id: LayerKey;
  name: string;
  count: ReactNode;
  swatch: ReactNode;
  visible: boolean;
  onToggleVisible: () => void;
  actions?: ReactNode;
  /** Shown as a small "Filtered" badge. */
  filtered?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  children?: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("border-b border-border bg-popover last:border-b-0", isDragging && "relative z-(--z-sticky) shadow-lg")}
    >
      <div className="flex items-center gap-1 py-2 pl-1 pr-2">
        <WithTooltip label={`Reorder ${name}`}>
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Reorder ${name}`}
            className="grid size-7 shrink-0 cursor-grab place-items-center rounded-sm text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        </WithTooltip>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1 text-left hover:text-primary"
        >
          <ChevronRight
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
          />
          {swatch}
          <span className={cn("min-w-0 flex-1 truncate text-dense", !visible && "text-muted-foreground")}>
            {name}
          </span>
          {filtered && (
            <span className="rounded-sm bg-primary/10 px-1 text-micro font-semibold uppercase tracking-wide text-primary">
              Filtered
            </span>
          )}
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        </button>
        <RowActionButton label={visible ? `Hide ${name}` : `Show ${name}`} size="icon-xs" className="size-7" onClick={onToggleVisible}>
          {visible ? <Eye /> : <EyeOff />}
        </RowActionButton>
        {actions}
      </div>
      {expanded && children && <div className="px-3 pb-3 pt-1">{children}</div>}
    </li>
  );
}

function Swatch({ fill, stroke, round }: { fill: string; stroke?: string; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("size-3 shrink-0 border", round ? "rounded-full" : "rounded-sm")}
      style={{ background: fill, borderColor: stroke ?? fill }}
    />
  );
}

export function LayersTab(props: LayersTabProps) {
  const { order, onReorder, dataLayers, onNotify } = props;
  const [adding, setAdding] = useState(false);
  const [choosingMap, setChoosingMap] = useState(false);
  const [expanded, setExpanded] = useState<Set<LayerKey>>(new Set());
  const toggle = (k: LayerKey) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(active.id as LayerKey);
    const to = order.indexOf(over.id as LayerKey);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(order, from, to));
  };

  const renderRow = (key: LayerKey) => {
    if (key === "sketches") {
      return (
        <LayerRow
          key={key}
          id={key}
          name="Sketches"
          count={props.sketchCount}
          swatch={<Swatch fill={DRAW_DEFAULT} round />}
          visible={props.sketchVisible}
          onToggleVisible={props.onToggleSketchVisible}
          expanded={expanded.has(key)}
          onToggleExpanded={() => toggle(key)}
        >
          <p className="text-dense text-muted-foreground">
            Style sketches in the{" "}
            <button type="button" className="font-medium text-primary hover:underline" onClick={props.onOpenDraw}>
              Draw tab
            </button>
          </p>
        </LayerRow>
      );
    }
    if (isPointKey(key)) {
      const info = props.pointLayers[key];
      const def = POINT_LAYERS[key];
      const field = activeField(def, info.state.style);
      const colors = field
        ? field.categories.map((c) => info.state.style.colors[c.value] ?? c.color)
        : [info.state.style.color];
      const filtered = isFiltered(key, info.state) || info.shown < info.total;
      return (
        <LayerRow
          key={key}
          id={key}
          name={def.label}
          count={info.loading ? "…" : filtered ? `${info.shown}/${info.total}` : info.total}
          filtered={isFiltered(key, info.state)}
          swatch={<Swatch fill={def.ring ? "transparent" : colors[0]} stroke={def.ring ? colors[0] : info.state.style.strokeColor} round />}
          visible={info.state.visible}
          onToggleVisible={() => props.onPointLayerChange(key, { ...info.state, visible: !info.state.visible })}
          expanded={expanded.has(key)}
          onToggleExpanded={() => toggle(key)}
        >
          <PointLayerEditor
            layerKey={key}
            state={info.state}
            counts={info.counts}
            onChange={(next) => props.onPointLayerChange(key, next)}
          />
          {info.note && <p className="pt-2 text-xs text-muted-foreground">{info.note}</p>}
        </LayerRow>
      );
    }
    const layer = dataLayers.find((l) => dataKey(l.id) === key);
    if (!layer) return null;
    return (
      <LayerRow
        key={key}
        id={key}
        name={layer.name}
        count={layer.featureCount}
        filtered={Boolean(layer.filter?.property)}
        swatch={<Swatch fill={layer.style.fillColor} stroke={layer.style.strokeColor} />}
        visible={layer.visible}
        onToggleVisible={() => props.onToggleLayerVisible(layer.id)}
        expanded={expanded.has(key)}
        onToggleExpanded={() => toggle(key)}
        actions={
          <>
            {layer.service && props.onRefreshLayer && (
              <RowActionButton label="Refresh for this view" size="icon-xs" className="size-7" onClick={() => props.onRefreshLayer!(layer.id)}>
                <RefreshCw />
              </RowActionButton>
            )}
            <RowActionButton label="Zoom to layer" size="icon-xs" className="size-7" onClick={() => props.onZoomToLayer(layer.id)}>
              <Crosshair />
            </RowActionButton>
            <RowActionButton label="Remove layer" tone="destructive" size="icon-xs" className="size-7" onClick={() => props.onRemoveLayer(layer.id)}>
              <Trash2 />
            </RowActionButton>
          </>
        }
      >
        <DataLayerStyleEditor layer={layer} onChange={(s) => props.onUpdateLayerStyle(layer.id, s)} />
        {layer.type === "geojson" && (
          <DataLayerFilterEditor layer={layer} onChange={(f) => props.onSetDataFilter(layer.id, f)} />
        )}
      </LayerRow>
    );
  };

  return (
    <div>
      <Section
        title="Base map"
        description={BASE_LAYER_MAP.get(props.baseLayer as never)?.label ?? props.baseLayer}
        action={
          <Button variant="outline" size="sm" aria-expanded={choosingMap} onClick={() => setChoosingMap((v) => !v)}>
            {choosingMap ? "Done" : "Change"}
          </Button>
        }
      >
        {choosingMap && <BaseMapPicker value={props.baseLayer} onChange={props.onBaseLayerChange} />}
      </Section>

      <Section
        title="Layers"
        action={
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add data
          </Button>
        }
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <ul className="-mx-3 border-y border-border">{order.map(renderRow)}</ul>
          </SortableContext>
        </DndContext>
        {!order.some(isDataKey) && (
          <p className="pt-2 text-dense text-muted-foreground">No data layers yet.</p>
        )}
      </Section>

      <AddDataDialog
        open={adding}
        onOpenChange={setAdding}
        onAddGeoJSONLayer={props.onAddGeoJSONLayer}
        onAddWMSLayer={props.onAddWMSLayer}
        onNotify={onNotify}
        getView={props.getView}
      />
    </div>
  );
}
