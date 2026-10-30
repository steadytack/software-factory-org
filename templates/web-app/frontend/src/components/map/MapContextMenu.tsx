/**
 * MapContextMenu — right-click (or long-press) card with coordinates, BNG,
 * postcode/address lookup and links out to other maps. Styled with theme tokens (popover surface).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "../ui/icon-button";
import { RowActionButton } from "../ui/row-actions";
import { createPortal } from "react-dom";
import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from "maplibre-gl";
import { latLngToEN, formatEN } from "./utils/coordinates";
import { reversePostcode, reverseAddress } from "./utils/geocode";

export interface FeaturePopupState {
  x: number;
  y: number;
  layerName: string;
  entries: [string, string][];
}

interface MenuState {
  x: number;
  y: number;
  lat: number;
  lng: number;
  bng: { e: number; n: number } | null;
  bngStr: string;
  latlngStr: string;
  postcode: string | null | "loading";
  address: string | null | "loading";
}

function CoordRow({
  label,
  value,
  loading,
  multiline,
}: {
  label: string;
  value: string | null;
  loading?: boolean;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid min-h-7 grid-cols-[64px_1fr_auto] items-start gap-x-2">
      <dt className="pt-1 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`pt-0.5 text-dense leading-snug text-foreground ${multiline ? "" : "truncate font-mono text-xs leading-6"}`}
        title={value ?? undefined}
      >
        {loading ? (
          <span className="mt-2 inline-block h-3 w-24 animate-pulse rounded-sm bg-muted" />
        ) : (
          value || <span className="text-muted-foreground">—</span>
        )}
      </dd>
      <span className="size-7">
        {value && !loading && (
          <RowActionButton
            label={copied ? "Copied" : `Copy ${label}`}
            size="icon-xs"
            className="size-7"
            onClick={() => {
              navigator.clipboard
                .writeText(value)
                .then(() => {
                  setCopied(true);
                  toast.success(`${label} copied.`);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => toast.error("Couldn't copy to the clipboard."));
            }}
          >
            {copied ? <Check className="text-success" /> : <Copy />}
          </RowActionButton>
        )}
      </span>
    </div>
  );
}

/** How long after opening the backdrop ignores taps (the press that opened the menu is still ending). */
const OPEN_GRACE_MS = 450;
/** A second open request inside this window is the same gesture reported twice (timer and native event). */
const REOPEN_GUARD_MS = 700;

function ContextMenuCard({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const { x, y, lat, lng, bngStr, latlngStr, postcode, address, bng } = state;
  const cardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 280, h: 320 });

  // Measure the real card so it's clamped inside the viewport exactly.
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, [postcode, address]);

  // On a phone the menu opens while the finger is still down; lifting it sends a click (and on Android a
  // native contextmenu) to whatever is under it, which is now the backdrop. Ignore the backdrop for a moment
  // so the menu stays open, then close on the next real touch or click outside it.
  const openedAt = useRef(performance.now());
  const dismiss = () => {
    if (performance.now() - openedAt.current < OPEN_GRACE_MS) return;
    onClose();
  };

  // Escape closes, like every other overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const links: [string, string][] = [
    ["Google Maps", `https://www.google.com/maps?q=${lat},${lng}`],
    ["Street View", `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}`],
    ["OpenStreetMap", `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`],
    ["one.network", `https://one.network/?tab=map&bb=0&zoom=16&lat=${lat}&lon=${lng}`],
  ];

  const left = Math.max(8, Math.min(x + 2, window.innerWidth - size.w - 8));
  const top = Math.max(8, Math.min(y + 2, window.innerHeight - size.h - 8));

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-(--z-toast)"
        onPointerDown={dismiss}
        onContextMenu={(e) => {
          e.preventDefault();
          dismiss();
        }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-label="Location details"
        className="map-panel fixed z-(--z-toast) w-[280px] overflow-hidden text-popover-foreground animate-in fade-in-0 zoom-in-95 duration-(--duration-normal) ease-(--ease-out)"
        style={{ left, top }}
      >
        <div className="flex items-center justify-between border-b border-border py-1 pl-3 pr-1">
          <span className="text-dense font-semibold">Location</span>
          <IconButton label="Close" size="icon-xs" className="size-7 pointer-coarse:size-11" onClick={onClose}>
            <X />
          </IconButton>
        </div>

        <dl className="flex flex-col gap-0.5 px-3 py-2">
          <CoordRow label="Lat/Lng" value={latlngStr} />
          <CoordRow label="BNG" value={bng ? bngStr : "Outside GB"} />
          <CoordRow label="Postcode" value={postcode === "loading" ? null : postcode} loading={postcode === "loading"} />
          <CoordRow label="Address" value={address === "loading" ? null : address} loading={address === "loading"} multiline />
        </dl>

        <div className="border-t border-border p-1">
          {links.map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-sm px-2 py-2 text-dense text-foreground no-underline transition-colors hover:bg-muted"
            >
              <ExternalLink aria-hidden className="size-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">Open in {label}</span>
            </a>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}

interface UseMapContextMenuOptions {
  mapRef: React.RefObject<MapLibreMap | null>;
}

export function useMapContextMenu({ mapRef }: UseMapContextMenuOptions) {
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenuState(null), []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let lastShown = 0;
    const showMenu = async (e: MapMouseEvent) => {
      const now = performance.now();
      if (now - lastShown < REOPEN_GUARD_MS) return;
      lastShown = now;
      const { lng, lat } = e.lngLat;
      const point = e.point;
      const bng = latLngToEN(lat, lng);
      const bngStr = bng ? formatEN(bng.e, bng.n) : "Outside UK";
      const latlngStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      const canvasEl = map.getCanvas();
      const rect = canvasEl.getBoundingClientRect();
      setMenuState({
        x: rect.left + point.x,
        y: rect.top + point.y,
        lat,
        lng,
        bng,
        bngStr,
        latlngStr,
        postcode: bng ? "loading" : null,
        address: bng ? "loading" : null,
      });
      if (bng) {
        try {
          const [pcResult, addrResult] = await Promise.allSettled([
            reversePostcode(lat, lng),
            reverseAddress(lat, lng),
          ]);
          const addrData = addrResult.status === "fulfilled" ? addrResult.value : null;
          const pc =
            addrData?.postcode ??
            (pcResult.status === "fulfilled" ? pcResult.value : null);
          setMenuState((prev) =>
            prev
              ? { ...prev, postcode: pc ?? null, address: addrData?.address ?? null }
              : null,
          );
        } catch {
          setMenuState((prev) => (prev ? { ...prev, postcode: null, address: null } : null));
        }
      }
    };

    // MapLibre's Listener type for "contextmenu" matches an async handler
    // fine; the cast is to the exact event type rather than `any`.
    const listener = showMenu as (e: MapMouseEvent) => void;
    map.on("contextmenu", listener);

    // Touch has no right-click: a ~500ms press-and-hold with one finger
    // opens the same menu. Any movement (pan), second finger (pinch) or
    // early lift cancels it.
    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    const cancelPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = null;
    };
    const onTouchStart = (e: MapTouchEvent) => {
      cancelPress();
      if (e.points.length !== 1) return;
      const { point, lngLat } = e;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        void showMenu({ point, lngLat } as MapMouseEvent);
      }, 500);
    };
    map.on("touchstart", onTouchStart);
    map.on("touchend", cancelPress);
    map.on("touchcancel", cancelPress);
    map.on("movestart", cancelPress);

    return () => {
      cancelPress();
      map.off("touchstart", onTouchStart);
      map.off("touchend", cancelPress);
      map.off("touchcancel", cancelPress);
      map.off("movestart", cancelPress);
      map.off("contextmenu", listener);
      setMenuState(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapRef]);

  const menuNode = menuState ? (
    <ContextMenuCard state={menuState} onClose={closeMenu} />
  ) : null;

  return { closeMenu, menuNode };
}
