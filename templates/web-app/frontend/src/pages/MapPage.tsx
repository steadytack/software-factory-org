/** MapPage — full-featured map view composing the map components:
 *  base-layer switching, location search, left control strip, status bar,
 *  right-click context menu, a styleable sites layer with record popups,
 *  fullscreen, sketch/measure tools with snapping, data overlay layers with
 *  user-controlled order, and print-ready PNG/PDF export. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { ChevronLeft, FileDown, House, Layers, LocateFixed, PencilRuler } from "lucide-react";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import "maplibre-gl/dist/maplibre-gl.css";
import "../components/map/map.css";
import { useQuery } from "@tanstack/react-query";
import { api, expectData } from "../api/client";
import {
  POINT_LAYERS,
  POINT_LAYER_KEYS,
  activeField,
  circleLayerId,
  sourceId as pointSourceId,
  ensurePointLayer,
  loadStates,
  passesFilter,
  saveStates,
  sitesGeo as toSitesGeo,
  surveysGeo as toSurveysGeo,
  type PointLayerKey,
  type PointLayerState,
  type PointLayerStates,
} from "../components/map/layers/pointLayers";
import { sitePopup, surveyPopup } from "../components/map/layers/pointPopups";
import { passesDataFilter } from "../components/map/layers/dataFilter";
import { addGeometry, type SnapIndex } from "../components/map/utils/snap";
import { fetchExternalFeatures } from "../components/map/layers/external";

import { useSiteLocations } from "../hooks/useSites";
import { pageTitle } from "../lib/brand";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../components/ui/sheet";
import { useIsMobile } from "../hooks/use-mobile";
import { MapNavControls } from "../components/map/MapNavControls";
import { DrawModeBar } from "../components/map/DrawModeBar";
import { MapSearchBar } from "../components/map/MapSearchBar";
import { MapStatusBar, type MapStatus } from "../components/map/MapStatusBar";
import { MapRightPanel, type MapPanelTab } from "../components/map/MapRightPanel";
import { useMapSearch } from "../components/map/hooks/useMapSearch";
import { useMapContextMenu } from "../components/map/MapContextMenu";
import { useMapDraw } from "../components/map/hooks/useMapDraw";
import { useMapLayers } from "../components/map/hooks/useMapLayers";
import { useMapUrlState } from "../components/map/hooks/useMapUrlState";
import {
  BASE_LAYER_MAP,
  BASE_LAYERS,
  defaultLayerFor,
  HOME_VIEW,
  type MapApiConfig,
} from "../components/map/mapLayers";
import { applyLayerOrder, reconcileOrder, type LayerKey } from "../components/map/layers/order";
import {
  exportPrintSheet,
  renderPrintSheet,
  safeDpi,
  sheetLayout,
  type PrintOptions,
} from "../components/map/utils/printMap";
import { legendFor, makeLocationDescriber } from "../components/map/utils/printContent";
import type { PrintRequest } from "../components/map/panel/ExportTab";
import { loadPrefs } from "../lib/prefs";
import { LoadError } from "../components/LoadError";
import { IconButton } from "../components/ui/icon-button";
import { useTheme } from "../components/theme-provider";

const apiConfig: MapApiConfig = {
  maptilerKey: import.meta.env.VITE_MAPTILER_KEY as string | undefined,
  osKey: import.meta.env.VITE_OS_KEY as string | undefined,
};

/** Where phone map controls sit: just above the floating tab pill. */
const PHONE_DOCK_BOTTOM = "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]";
const PANEL_WIDTH = 320;
/** Most corners + edges kept for snapping (near the view). */
const SNAP_LIMIT = 60_000;

export function MapPage() {
  useEffect(() => {
    document.title = pageTitle("Map");
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const { resolvedTheme } = useTheme();
  const [activeLayer, setActiveLayer] = useState<string>(() => defaultLayerFor(resolvedTheme));
  // Until someone picks a basemap themselves, the default follows light/dark.
  const userPickedLayer = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [status, setStatus] = useState<MapStatus | null>(null);
  // Sites and surveys: shown?, style and filter, saved.
  const [pointStates, setPointStates] = useState<PointLayerStates>(() => loadStates());
  useEffect(() => saveStates(pointStates), [pointStates]);
  const setPointState = useCallback(
    (key: PointLayerKey, next: PointLayerState) => setPointStates((prev) => ({ ...prev, [key]: next })),
    [],
  );
  // Surveys are off by default: fetched once first shown.
  const { data: surveyPoints, isPending: surveysPending } = useQuery({
    queryKey: ["surveys", "map-points"],
    queryFn: () => expectData(() => api.GET("/api/map/surveys", {})),
    enabled: pointStates.surveys.visible,
  });
  // Logical layer stack, top first (see layers/order.ts).
  const [layerOrder, setLayerOrder] = useState<LayerKey[]>(() => reconcileOrder([], []));
  const isMobile = useIsMobile();

  const { data, isPending, error, refetch } = useSiteLocations();
  const mapUrlState = useMapUrlState();

  const showToast = useCallback((msg: string) => {
    toast(msg);
  }, []);

  // ── Initialise map ────────────────────────────────────────────────────────
  // Must run (i.e. be called) before the hooks below — useMapSearch,
  // useMapContextMenu, useMapDraw, useMapLayers each set up their mount-time
  // effects by reading mapRef.current once and bail out if it's still null,
  // with no dependency that would make them retry. Effects fire in the order
  // their hooks were called, so this has to come first or the map instance
  // doesn't exist yet when they look for it (e.g. the right-click context
  // menu silently never attaches its listener).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const layerCfg = BASE_LAYER_MAP.get(defaultLayerFor(resolvedTheme))!;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: layerCfg.getStyle(apiConfig) as maplibregl.StyleSpecification,
      center: mapUrlState.initial.center,
      zoom: mapUrlState.initial.zoom,
      minZoom: 4,
      maxZoom: 19,
      attributionControl: false,
      // Keep the rendered frame readable, so PNG/PDF export (canvas
      // toDataURL) captures the map instead of a blank image.
      preserveDrawingBuffer: true,
    });
    mapRef.current = map;
    map.scrollZoom.setWheelZoomRate(1 / 450);

    const emitStatus = (lat: number, lng: number) => {
      setStatus({ zoom: Math.round(map.getZoom() * 10) / 10, lat, lng });
    };
    // Throttle mousemove status updates — without this every pointer move
    // re-renders the whole MapPage (search bar, panels, portals).
    let statusPending = false;
    let lastEvent: { lat: number; lng: number } | null = null;
    map.on("moveend", () => {
      const c = map.getCenter();
      emitStatus(c.lat, c.lng);
      mapUrlState.publish(c, map.getZoom());
    });
    map.on("mousemove", (e) => {
      lastEvent = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (statusPending) return;
      statusPending = true;
      requestAnimationFrame(() => {
        statusPending = false;
        if (lastEvent) emitStatus(lastEvent.lat, lastEvent.lng);
      });
    });
    map.on("load", () => setMapReady(true));

    // MapLibre sizes its canvas from the container's dimensions at
    // construction time, before the flex layout (sidebar, header, panel)
    // has necessarily settled — without this the canvas can get stuck at
    // its 400x300 default. Keep it in sync with the container from then on.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useMapSearch({ mapRef, onToast: showToast });
  const { menuNode } = useMapContextMenu({ mapRef });
  const draw = useMapDraw({ mapRef, onToast: showToast });
  const mapLayers = useMapLayers({ mapRef, onToast: showToast });
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<MapPanelTab>("layers");
  /** Open the panel (the phone sheet) on a tab — the phone map bar and
   *  the desktop Draw button. */
  const openPanel = (tab: MapPanelTab) => {
    setPanelTab(tab);
    setPanelOpen(true);
  };
  const handleToolChange = (tool: typeof draw.activeTool) => {
    if (tool === draw.activeTool || tool === null) draw.exitMode();
    else {
      draw.enterMode(tool);
      // Phone: the panel is a bottom sheet over the map — get it out of
      // the way so the user can actually draw.
      if (isMobile) setPanelOpen(false);
    }
  };

  // ── Record layers (MapLibre circles, not DOM markers — styleable,
  //    filterable, orderable, snappable and included in exports) ────────
  const pointGeo = useMemo(
    () => ({
      sites: toSitesGeo(data?.items ?? []),
      surveys: toSurveysGeo(surveyPoints ?? []),
    }),
    [data, surveyPoints],
  );
  const overlayState = useRef({ pointGeo, pointStates, layerOrder });
  overlayState.current = { pointGeo, pointStates, layerOrder };

  /** (Re)apply sites + layer order — after data/style changes and after a
   *  base-map swap wipes custom layers. */
  const syncRetry = useRef(false);
  const syncOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    // `isStyleLoaded()` stays false while base-map tiles are still loading,
    // but layers can be added as soon as the style itself has loaded. Try
    // now; if the style really isn't ready (it throws), try again when the
    // map next goes idle — never just give up (circles would stay missing).
    try {
      const st = overlayState.current;
      for (const key of POINT_LAYER_KEYS) ensurePointLayer(map, key, st.pointGeo[key], st.pointStates[key]);
      applyLayerOrder(map, st.layerOrder);
    } catch {
      if (syncRetry.current) return;
      syncRetry.current = true;
      map.once("idle", () => {
        syncRetry.current = false;
        syncOverlays();
      });
    }
  }, []);

  useEffect(() => {
    if (mapReady) syncOverlays();
  }, [
    mapReady,
    pointGeo,
    pointStates,
    layerOrder,
    mapLayers.layers,
    draw.features.length,
    syncOverlays,
  ]);

  // Popups for the record layers, each with links to its pages
  // (layer-scoped handlers survive base-map swaps).
  const popupData = useRef({ data, surveyPoints, pointStates });
  popupData.current = { data, surveyPoints, pointStates };
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const open = (lngLat: [number, number], content: HTMLElement) =>
      new maplibregl.Popup({ offset: 10, maxWidth: "280px" }).setLngLat(lngLat).setDOMContent(content).addTo(map);
    const handlers: Record<PointLayerKey, (e: maplibregl.MapLayerMouseEvent) => void> = {
      sites: (e) => {
        const d = popupData.current;
        const site = d.data?.items.find((x) => x.id === e.features?.[0]?.properties?.id);
        if (site) open([site.longitude, site.latitude], sitePopup(site, d.pointStates.sites.style));
      },
      surveys: (e) => {
        const d = popupData.current;
        const sv = d.surveyPoints?.find((x) => x.survey_id === e.features?.[0]?.properties?.id);
        if (sv) open([sv.longitude, sv.latitude], surveyPopup(sv, d.pointStates.surveys.style));
      },
    };
    // Hover: pointer cursor, and the marker under it gets a thicker stroke (feature-state).
    const hovered: Partial<Record<PointLayerKey, string | number>> = {};
    const setHover = (key: PointLayerKey, id: string | number | undefined, on: boolean) => {
      if (id === undefined) return;
      if (map.getSource(pointSourceId(key))) map.setFeatureState({ source: pointSourceId(key), id }, { hover: on });
    };
    const move = (key: PointLayerKey) => (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.id;
      if (id === undefined || id === hovered[key]) return;
      setHover(key, hovered[key], false);
      hovered[key] = id;
      setHover(key, id, true);
    };
    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const leaveFor = (key: PointLayerKey) => () => {
      map.getCanvas().style.cursor = "";
      setHover(key, hovered[key], false);
      hovered[key] = undefined;
    };
    const moves = { sites: move("sites"), surveys: move("surveys") } as const;
    const leaves = { sites: leaveFor("sites"), surveys: leaveFor("surveys") } as const;
    for (const key of POINT_LAYER_KEYS) {
      map.on("click", circleLayerId(key), handlers[key]);
      map.on("mouseenter", circleLayerId(key), enter);
      map.on("mousemove", circleLayerId(key), moves[key]);
      map.on("mouseleave", circleLayerId(key), leaves[key]);
    }
    return () => {
      for (const key of POINT_LAYER_KEYS) {
        map.off("click", circleLayerId(key), handlers[key]);
        map.off("mouseenter", circleLayerId(key), enter);
        map.off("mousemove", circleLayerId(key), moves[key]);
        map.off("mouseleave", circleLayerId(key), leaves[key]);
      }
    };
  }, [mapReady]);

  // Keep the order in step with added/removed data layers.
  const dataLayerIds = mapLayers.layers.map((l) => l.id).join("|");
  useEffect(() => {
    setLayerOrder((o) => reconcileOrder(o, dataLayerIds ? dataLayerIds.split("|") : []));
  }, [dataLayerIds]);

  // Snap targets for drawing: the record points shown, and the corners and
  // edges of shown data-layer features — only near the view (rebuilt as the
  // map moves), so a national layer doesn't slow drawing down. Sketches
  // snap to each other inside TerraDraw.
  const setSnapTargets = draw.setSnapTargets;
  const [viewTick, setViewTick] = useState(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const bump = () => setViewTick((t) => t + 1);
    map.on("moveend", bump);
    return () => {
      map.off("moveend", bump);
    };
  }, [mapReady]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const b = map.getBounds();
    const padX = (b.getEast() - b.getWest()) / 2;
    const padY = (b.getNorth() - b.getSouth()) / 2;
    const bounds = { west: b.getWest() - padX, east: b.getEast() + padX, south: b.getSouth() - padY, north: b.getNorth() + padY };
    const index: SnapIndex = { points: [], segments: [] };
    for (const key of POINT_LAYER_KEYS) {
      const st = pointStates[key];
      if (!st.visible) continue;
      for (const f of pointGeo[key].features) {
        if (passesFilter(key, st, f.properties)) addGeometry(index, f.geometry, bounds, SNAP_LIMIT);
      }
    }
    for (const layer of mapLayers.layers) {
      if (!layer.visible || !layer.data) continue;
      for (const f of layer.data.features) {
        if (passesDataFilter(layer.filter, f.properties)) addGeometry(index, f.geometry, bounds, SNAP_LIMIT);
      }
    }
    setSnapTargets(index);
  }, [mapReady, viewTick, pointGeo, pointStates, mapLayers.layers, setSnapTargets]);

  // ── Base layer switching ──────────────────────────────────────────────────
  const applyLayer = useCallback((key: string) => {
    const map = mapRef.current;
    const layerCfg = BASE_LAYER_MAP.get(key as never);
    if (!map || !layerCfg) return;
    setActiveLayer(key);
    map.setStyle(layerCfg.getStyle(apiConfig) as maplibregl.StyleSpecification);
    // setStyle wipes all custom sources/layers; restore once MapLibre has
    // fully settled the new style (idle fires exactly once after that).
    map.once("idle", () => {
      mapLayers.rehydrate();
      syncOverlays();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleLayerChange = useCallback(
    (key: string) => {
      userPickedLayer.current = true;
      applyLayer(key);
    },
    [applyLayer],
  );
  useEffect(() => {
    const key = defaultLayerFor(resolvedTheme);
    if (!mapReady || userPickedLayer.current || key === activeLayer) return;
    applyLayer(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme, mapReady]);

  const zoomIn = useCallback(() => mapRef.current?.zoomIn(), []);
  const zoomOut = useCallback(() => mapRef.current?.zoomOut(), []);
  const flyHome = useCallback(() => {
    // Respect prefers-reduced-motion: jump instead of animating (audit U10).
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapRef.current?.flyTo({
      center: HOME_VIEW.center,
      zoom: HOME_VIEW.zoom,
      duration: reduce ? 0 : 800,
    });
  }, []);
  const geolocate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      showToast("Geolocation not available");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 14,
          duration: reduce ? 0 : 700,
        });
      },
      () => showToast("Could not get your location"),
    );
  }, [showToast]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const baseAttribution =
    BASE_LAYERS.find((l) => l.key === activeLayer)?.attribution ?? "© OpenStreetMap contributors";
  // Data on the map (a flood-zone service, say) has its own licence line, which goes wherever the map's credit does.
  const dataAttributions = [
    ...new Set(mapLayers.layers.filter((l) => l.visible && l.attribution).map((l) => l.attribution as string)),
  ];
  const attribution = [baseAttribution, ...dataAttributions].join(" · ");

  // ── Print export ──────────────────────────────────────────────────────────
  // The legend only lists what's inside the printed area (known once the
  // sheet's map has rendered), with counts.
  const printLegend = (bounds: Parameters<PrintOptions["legendFor"]>[0]) =>
    legendFor(
      {
        order: layerOrder,
        points: Object.fromEntries(POINT_LAYER_KEYS.map((k) => [k, { state: pointStates[k], geo: pointGeo[k] }])),
        sketches: { visible: draw.sketchVisible, features: draw.features },
        dataLayers: mapLayers.layers,
      },
      bounds,
    );
  const sitesRef = useRef(data?.items ?? []);
  sitesRef.current = data?.items ?? [];
  const [describeLocation] = useState(() => makeLocationDescriber(() => sitesRef.current));

  // OS licensing: Crown copyright on any sheet printed over an OS map.
  const copyright = activeLayer.startsWith("os-")
    ? `© Crown copyright and database rights ${new Date().getFullYear()} Ordnance Survey${
        import.meta.env.VITE_OS_LICENCE ? ` ${import.meta.env.VITE_OS_LICENCE as string}` : ""
      }`
    : undefined;

  const printOptions = (req: PrintRequest, dpi: number): PrintOptions => ({
    ...req,
    legendFor: printLegend,
    describeLocation,
    // An OS base map's credit is the Crown copyright line already.
    attribution: [copyright ? "" : baseAttribution, ...dataAttributions].filter(Boolean).join(" · "),
    copyright,
    dpi,
    onIncomplete: () =>
      toast.warning("Part of the map hadn't finished loading, so the sheet may have blank areas. Try exporting again."),
  });

  /** A sketch picked on the map shows its edit handles; they are not part of the plan. */
  const letGoOfSketch = async () => {
    draw.selectOnMap(null);
    await new Promise((r) => setTimeout(r, 60));
  };

  const onPrint = async (req: PrintRequest) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      await letGoOfSketch();
      // 300 dpi where the device can render it (phones cap the image size).
      const dpi = safeDpi(sheetLayout(req.paper, req.orientation), req.format === "pdf" ? 300 : 200);
      await exportPrintSheet(map, printOptions(req, dpi));
      toast.success(`Exported ${req.format.toUpperCase()}.`);
    } catch (e) {
      toast.error(`Export failed${e instanceof Error ? `: ${e.message}` : ""}`);
    }
  };

  const onPreview = async (req: PrintRequest) => {
    const map = mapRef.current;
    if (!map) return "";
    await letGoOfSketch();
    const canvas = await renderPrintSheet(map, printOptions(req, 48));
    return canvas.toDataURL("image/png");
  };

  /** What's in view, for fetching web-service features. */
  const getView = useCallback(() => {
    const b = mapRef.current?.getBounds();
    return b ? { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() } : undefined;
  }, []);
  const refreshServiceLayer = async (id: string) => {
    const layer = mapLayers.layers.find((l) => l.id === id);
    if (!layer?.service) return;
    try {
      const { data, truncated } = await fetchExternalFeatures(layer.service.type, layer.service.url, layer.service.id, getView());
      mapLayers.replaceLayerData(id, data);
      toast(
        truncated
          ? `${layer.name}: the first ${data.features.length.toLocaleString("en-GB")} features in view — zoom in for the rest.`
          : `${layer.name}: ${data.features.length.toLocaleString("en-GB")} features in view.`,
      );
    } catch (e) {
      toast.error(`Couldn't refresh ${layer.name}${e instanceof Error ? `: ${e.message}` : ""}`);
    }
  };

  const pointLayerInfo = Object.fromEntries(
    POINT_LAYER_KEYS.map((key) => {
      const st = pointStates[key];
      const feats = pointGeo[key].features;
      const counts: Record<string, number> = {};
      const field = activeField(POINT_LAYERS[key], st.style);
      if (field) for (const f of feats) counts[String(f.properties[field.key])] = (counts[String(f.properties[field.key])] ?? 0) + 1;
      const pending = { sites: isPending, surveys: surveysPending }[key];
      return [
        key,
        {
          state: st,
          counts,
          total: feats.length,
          shown: feats.filter((f) => passesFilter(key, st, f.properties)).length,
          loading: st.visible && pending,
          note: {
            sites: undefined,
            surveys: `A ring around each surveyed site.`,
          }[key],
        },
      ];
    }),
  ) as Record<PointLayerKey, import("../components/map/panel/LayersTab").PointLayerInfo>;

  const panelNode = (
    <MapRightPanel
      tab={panelTab}
      onTabChange={setPanelTab}
      layers={{
        baseLayer: activeLayer,
        onBaseLayerChange: handleLayerChange,
        order: layerOrder,
        onReorder: setLayerOrder,
        dataLayers: mapLayers.layers,
        onAddGeoJSONLayer: mapLayers.addGeoJSONLayer,
        onAddWMSLayer: mapLayers.addWMSLayer,
        onUpdateLayerStyle: mapLayers.updateLayerStyle,
        onToggleLayerVisible: mapLayers.toggleLayerVisible,
        onRemoveLayer: mapLayers.removeLayer,
        onZoomToLayer: mapLayers.zoomToLayer,
        onNotify: (msg, tone) => (tone === "error" ? toast.error(msg) : toast(msg)),
        onSetDataFilter: mapLayers.setLayerFilter,
        getView,
        onRefreshLayer: (id) => void refreshServiceLayer(id),
        pointLayers: pointLayerInfo,
        onPointLayerChange: setPointState,
        sketchVisible: draw.sketchVisible,
        sketchCount: draw.features.length,
        onToggleSketchVisible: draw.toggleSketchVisible,
      }}
      draw={{
        activeTool: draw.activeTool,
        onToolChange: handleToolChange,
        features: draw.features,
        onUpdate: draw.updateFeature,
        onUpdateMany: draw.updateFeatures,
        onDelete: draw.deleteFeature,
        onDeleteMany: draw.deleteFeatures,
        selectedId: draw.selectedId,
        onSelect: draw.selectOnMap,
        onZoom: draw.zoomToFeature,
        onClearAll: draw.clearAll,
        visible: draw.sketchVisible,
        onToggleVisible: draw.toggleSketchVisible,
        snapEnabled: draw.snapEnabled,
        onSnapChange: draw.setSnapEnabled,
        measureSettings: draw.measureSettings,
        onMeasureSettingsChange: draw.updateMeasureSettings,
      }}
      exporting={{
        defaultAuthor: loadPrefs().displayName,
        onPrint,
        onPreview,
        onExportGeoJSON: draw.exportGeoJSON,
        onExportCSV: draw.exportCSV,
        sketchCount: draw.features.length,
      }}
    />
  );

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-muted"
      style={isFullscreen ? { position: "fixed", inset: 0, zIndex: 50 } : undefined}
    >
      <h1 className="sr-only">Map</h1>
      {/* MapLibre container — always rendered: the map initialises once on
          mount, so it can't wait behind a loading state. */}
      <div ref={containerRef} className="h-full w-full select-none [-webkit-touch-callout:none]" />
      {isPending && (
        <div className="pointer-events-none absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-(--z-sticky) -translate-x-1/2 map-panel md:bottom-10 px-3 py-2 text-dense text-muted-foreground">
          Loading sites…
        </div>
      )}
      {!isPending && !error && data && data.items.length === 0 && (
        <div className="map-panel pointer-events-none absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-(--z-sticky) -translate-x-1/2 px-3 py-2 text-dense text-muted-foreground md:bottom-10">
          No sites to show yet. Add a site and it will appear here.
        </div>
      )}
      {error && (
        <div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-(--z-sticky) w-[min(28rem,90%)] -translate-x-1/2 md:bottom-10">
          <LoadError error={error} what="sites for the map" onRetry={() => void refetch()} />
        </div>
      )}

      {/* Find & move: search on top (a collapsible button on a phone); zoom, reset, locate and full page
          under it on desktop. On a phone, Reset and Locate live in the side pill. */}
      <MapSearchBar
        query={search.query}
        suggestions={search.suggestions}
        loading={search.loading}
        onQueryChange={search.handleQueryChange}
        onSearch={(q) => void search.handleSearch(q)}
        onSelectSuggestion={search.selectSuggestion}
        onClearSearch={search.clearSearch}
        collapsible={isMobile}
      />
      {!isMobile && (
        <MapNavControls
          className="left-2.5 top-14"
          isFullscreen={isFullscreen}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onHome={flyHome}
          onFullscreen={() => setIsFullscreen((v) => !v)}
          onLocate={geolocate}
          onLayers={() => openPanel("layers")}
          onDraw={() => openPanel("draw")}
          onExport={() => openPanel("export")}
          openTab={panelOpen ? panelTab : null}
        />
      )}

      <MapStatusBar
        status={status}
        attribution={attribution}
        compact={isMobile}
        className={isMobile ? PHONE_DOCK_BOTTOM : undefined}
        rightInset={panelOpen && !isMobile ? PANEL_WIDTH + 20 : 10}
      />

      {/* While a tool is active: what it does, snapping, Done. */}
      <DrawModeBar
        tool={draw.activeTool}
        snapEnabled={draw.snapEnabled}
        onToggleSnap={() => draw.setSnapEnabled((v) => !v)}
        onDone={() => handleToolChange(null)}
        className={
          isMobile
            ? "inset-x-2.5 bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
            : "bottom-12 left-1/2 w-[min(32rem,calc(100%-2rem))] -translate-x-1/2"
        }
      />

      {isMobile ? (
        <>
          {/* Phone: a vertical glass pill at the right edge. Reset view and Locate me act on the map;
              Layers, Draw and Export open the sheet on their own tab. Hidden while drawing (the
              draw bar takes its place). Icon-only, so every button has a label for screen readers;
              size-10 on touch too, because the shared Button would otherwise grow to 44px. */}
          {draw.activeTool === null && (
            <nav
              aria-label="Map panels"
              className="glass absolute right-2.5 top-1/2 z-(--z-sticky) flex -translate-y-1/2 flex-col items-center gap-0.5 rounded-xl p-0.5"
            >
              {(
                [
                  ["Reset", "Reset view", House, flyHome],
                  ["Locate", "Locate me", LocateFixed, geolocate],
                ] as const
              ).map(([label, name, Icon, act]) => (
                <IconButton
                  key={label}
                  type="button"
                  variant="ghost"
                  size="icon"
                  label={name}
                  tooltipSide="left"
                  onClick={() => act()}
                  className="size-10 rounded-lg pointer-coarse:size-10"
                >
                  <Icon className="size-4.5" />
                </IconButton>
              ))}
              <div aria-hidden className="my-0.5 h-px w-6 bg-foreground/15" />
              {(
                [
                  ["layers", "Layers", Layers],
                  ["draw", "Draw", PencilRuler],
                  ["export", "Export", FileDown],
                ] as const
              ).map(([tab, label, Icon]) => (
                <IconButton
                  key={tab}
                  type="button"
                  variant="ghost"
                  size="icon"
                  label={label}
                  tooltipSide="left"
                  onClick={() => openPanel(tab)}
                  aria-haspopup="dialog"
                  aria-pressed={panelOpen && panelTab === tab}
                  className={cn(
                    "relative size-10 rounded-lg pointer-coarse:size-10",
                    panelOpen && panelTab === tab && "glass-active",
                  )}
                >
                  <Icon className="size-4.5" />
                  {tab === "draw" && draw.features.length > 0 && (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-micro font-semibold leading-none text-primary-foreground"
                    >
                      {draw.features.length}
                    </span>
                  )}
                  {tab === "draw" && draw.features.length > 0 && (
                    <span className="sr-only">({draw.features.length} sketches)</span>
                  )}
                </IconButton>
              ))}
            </nav>
          )}
          <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="glass-sheet gap-0 overflow-hidden rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] data-[side=bottom]:h-[75dvh]"
            >
              <SheetTitle className="sr-only">Map layers, drawing and export</SheetTitle>
              <SheetDescription className="sr-only">
                Base map and layers, drawing tools and sketches, and export options
              </SheetDescription>
              <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-foreground/25" />
              <div className="min-h-0 flex-1">{panelNode}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <>
          {/* Panel toggle — same docking, so it stays clickable to close the
              panel instead of disappearing underneath it. */}
          <IconButton
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setPanelOpen((v) => !v)}
            label={panelOpen ? "Hide panel" : "Layers, draw and export"}
            tooltipSide="left"
            aria-expanded={panelOpen}
            style={{ right: panelOpen ? PANEL_WIDTH + 20 : 10 }}
            className="map-panel absolute top-2.5 z-(--z-sticky) text-foreground/70 transition-[right] duration-(--duration-slow) ease-(--ease-out) hover:bg-popover"
          >
            <ChevronLeft
              className={`size-4 transition-transform duration-(--duration-slow) ${panelOpen ? "rotate-180" : ""}`}
            />
          </IconButton>

          {/* Panel: Layers · Draw · Export */}
          {panelOpen && (
            <div
              style={{ width: PANEL_WIDTH }}
              className="map-panel absolute bottom-2.5 right-2.5 top-2.5 z-(--z-sticky) overflow-hidden"
            >
              {panelNode}
            </div>
          )}
        </>
      )}

      {/* Context menu portal */}
      {menuNode}
    </div>
  );
}
