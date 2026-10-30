/** Site location editor, shared by "Add site" and the site page:
 *
 *  - Address with Nominatim autocomplete (GB). Picking a suggestion fills
 *    Address, Postcode and Coordinates and flies the map there.
 *  - Postcode — looked up (postcodes.io) to centre the map when there are no
 *    coordinates yet.
 *  - Coordinates as one British National Grid "easting, northing" field.
 *  - A small map: click or drag the pin to set the exact position; the
 *    Coordinates field follows.
 *  - The address is *linked to the pin* by default: moving the pin looks up
 *    the address and postcode there. Typing in either field unlinks them, so
 *    hand-written text is never overwritten; the chip re-links (and refreshes
 *    from the pin) in one click.
 */
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link2, Link2Off, LocateFixed, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { accuracyNote, canLocate, getHere } from "../lib/geolocate";

import { coordinatesText } from "../lib/siteForm";
import { parseEN } from "./map/utils/coordinates";
import {
  addressAt,
  checkPostcode,
  searchAddresses,
  type AddressSuggestion,
} from "./map/utils/geocode";
import { isUkPostcode, POSTCODE_FORMAT_MESSAGE } from "../lib/postcode";
import { cn } from "../lib/utils";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import type { LatLng } from "./map/LocationPickerMap";
import { RequiredMark } from "./ui/required-mark";
import { WithTooltip } from "./ui/with-tooltip";

const LocationPickerMap = lazy(() => import("./map/LocationPickerMap"));

type LocationField = "address" | "postcode" | "coordinates";

interface Props {
  values: Record<LocationField, string>;
  onChange: (name: LocationField, value: string) => void;
  /** Prefix for input ids, so two instances can't collide. */
  idPrefix?: string;
  /** View only: the pin can't be moved and the link chip is hidden. */
  readOnly?: boolean;
  /** Map height override, e.g. taller on the site page than in a dialog. */
  mapClassName?: string;
}

const MIN_QUERY = 3;
const DEBOUNCE_MS = 450;
/** Let pin clicks/drags settle before a reverse lookup (Nominatim: 1 req/s). */
const PIN_LOOKUP_MS = 400;

export function SiteLocationFields({
  values,
  onChange,
  idPrefix = "loc",
  readOnly = false,
  mapClassName,
}: Props) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  // Address follows the pin until the user writes their own.
  const [linked, setLinked] = useState(true);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  // The postcode field: format hint once the field is left, and postcodes.io's
  // "no such postcode" (a warning, never a block: a brand-new postcode can be real).
  const [postcodeTouched, setPostcodeTouched] = useState(false);
  const [unknownPostcode, setUnknownPostcode] = useState<string | null>(null);
  const lookupRef = useRef<{ timer?: ReturnType<typeof setTimeout>; controller?: AbortController }>(
    {},
  );
  // Only search when the user typed — not when a suggestion or reverse
  // lookup filled the field programmatically.
  const typedRef = useRef(false);

  const position = useMemo<LatLng | null>(() => parseEN(values.coordinates), [values.coordinates]);
  const coordsInvalid = values.coordinates.trim() !== "" && position === null;
  const postcodeFormatBad =
    postcodeTouched && values.postcode.trim() !== "" && !isUkPostcode(values.postcode);
  const postcodeNote = postcodeFormatBad
    ? POSTCODE_FORMAT_MESSAGE
    : unknownPostcode !== null && unknownPostcode === values.postcode.trim()
      ? "postcodes.io doesn't know this postcode. Check it, or carry on if it is new."
      : null;
  // Coordinates as of the last blur, so tabbing through doesn't re-query.
  const blurredCoords = useRef(values.coordinates);

  // Debounced Nominatim autocomplete.
  useEffect(() => {
    const q = values.address.trim();
    if (!typedRef.current || q.length < MIN_QUERY) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
      const results = await searchAddresses(q, controller.signal);
      if (!controller.signal.aborted) {
        setSuggestions(results);
        setOpen(results.length > 0);
        setHighlight(-1);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      controller.abort();
      setSearching(false);
    };
  }, [values.address]);

  function cancelPinLookup() {
    const l = lookupRef.current;
    if (l.timer) clearTimeout(l.timer);
    l.controller?.abort();
    setLookingUp(false);
  }
  // Abandon an in-flight lookup when the form closes.
  useEffect(
    () => () => {
      const l = lookupRef.current;
      if (l.timer) clearTimeout(l.timer);
      l.controller?.abort();
    },
    [],
  );

  /** Reverse-geocode `at` into Address + Postcode. Debounced, and the latest
   *  pin position wins. A failure leaves the fields as they were. */
  function fillFromPin(at: LatLng, delay = PIN_LOOKUP_MS) {
    cancelPinLookup();
    setLookupFailed(false);
    setLookingUp(true);
    const controller = new AbortController();
    lookupRef.current.controller = controller;
    lookupRef.current.timer = setTimeout(async () => {
      const hit = await addressAt(at.lat, at.lng, controller.signal);
      if (controller.signal.aborted) return;
      setLookingUp(false);
      if (!hit) {
        setLookupFailed(true);
        return;
      }
      typedRef.current = false;
      onChange("address", hit.address);
      // No postcode at the pin (open land, offshore) clears a stale one.
      onChange("postcode", hit.postcode ? hit.postcode.toUpperCase() : "");
    }, delay);
  }

  function unlink() {
    cancelPinLookup();
    setLookupFailed(false);
    setLinked(false);
  }

  function relink() {
    setLinked(true);
    if (position) fillFromPin(position, 0);
  }

  const [locating, setLocating] = useState(false);
  /** Put the pin where the device is. The address and postcode follow it when linked, like any pin move. */
  async function placePinHere() {
    setLocating(true);
    try {
      const here = await getHere();
      pinMoved({ lat: here.lat, lng: here.lng });
      setFocusKey((k) => k + 1);
      const acc = accuracyNote(here.accuracy);
      if (acc.poor) {
        toast.warning(`Pin placed at your location, but it's rough (${acc.text}).`, {
          description: "Move the pin to the exact spot, or try again outside.",
        });
      } else {
        toast.success(`Pin placed at your location (${acc.text}).`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  }

  function pinMoved(at: LatLng) {
    if (readOnly) return;
    const bng = coordinatesText(at.lat, at.lng);
    if (bng) {
      onChange("coordinates", bng);
      blurredCoords.current = bng;
    }
    if (linked) fillFromPin(at);
  }

  function choose(s: AddressSuggestion) {
    // A picked address moves the pin to it, so the two agree: stay linked.
    cancelPinLookup();
    setLinked(true);
    setLookupFailed(false);
    typedRef.current = false;
    onChange("address", s.address);
    if (s.postcode) onChange("postcode", s.postcode.toUpperCase());
    const bng = coordinatesText(s.lat, s.lng);
    if (bng) {
      onChange("coordinates", bng);
      blurredCoords.current = bng;
    }
    setOpen(false);
    setSuggestions([]);
    setFocusKey((k) => k + 1);
  }

  async function lookUpPostcode() {
    const pc = values.postcode.trim();
    setPostcodeTouched(true);
    if (!pc || !isUkPostcode(pc)) return; // a malformed one gets the format hint instead
    const result = await checkPostcode(pc);
    setUnknownPostcode(result.status === "unknown" ? pc : null);
    if (result.status !== "found" || position) return; // only centre the map when there's nothing yet
    const hit = result.hit;
    const bng = coordinatesText(hit.lat, hit.lng);
    if (bng) {
      onChange("coordinates", bng);
      blurredCoords.current = bng;
      setFocusKey((k) => k + 1);
    }
  }

  function onAddressKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      choose(suggestions[highlight]);
    } else if (e.key === "Escape") {
      // Close the list without closing a surrounding dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const id = (f: string) => `${idPrefix}-${f}`;

  return (
    <div className="grid gap-(--card-gap) sm:grid-cols-[2fr_1fr]">
      {/* Address + suggestions */}
      <div className="relative space-y-(--field-gap)">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id("address")}>Address</Label>
          {!readOnly && (
            <WithTooltip
              label={
                linked
                  ? "Address and postcode update when the pin moves. Click to stop."
                  : "The address is your own text. Click to fill it from the pin again."
              }
            >
            <button
              type="button"
              onClick={linked ? unlink : relink}
              aria-pressed={linked}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                linked
                  ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {lookingUp ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : linked ? (
                <Link2 className="size-3.5" />
              ) : (
                <Link2Off className="size-3.5" />
              )}
              {linked ? "Linked to pin" : "Unlinked"}
            </button>
            </WithTooltip>
          )}
        </div>
        <div className="relative">
          <Input
            id={id("address")}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
            autoComplete="off"
            placeholder="Start typing an address…"
            value={values.address}
            onChange={(e) => {
              typedRef.current = true;
              if (linked) unlink();
              onChange("address", e.target.value);
            }}
            onKeyDown={onAddressKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            // Delay so a click on a suggestion lands before the list closes.
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="pr-8"
          />
          {searching && (
            <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {open && suggestions.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-full z-(--z-overlay) mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          >
            {suggestions.map((s, i) => (
              <li
                key={`${s.lat},${s.lng},${i}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === highlight}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-2 text-sm",
                  i === highlight && "bg-accent text-accent-foreground",
                )}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {s.address}
                    {s.postcode && (
                      <span className="ml-2 font-normal text-muted-foreground">{s.postcode}</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{s.label}</span>
                </span>
              </li>
            ))}
            <li className="px-2 pb-0.5 pt-1 text-micro text-muted-foreground">
              Search by OpenStreetMap Nominatim
            </li>
          </ul>
        )}
      </div>

      <div className="space-y-(--field-gap)">
        {/* Same label row height as Address, so the inputs line up. */}
        <div className="flex h-6 items-center">
          <Label htmlFor={id("postcode")}>Postcode</Label>
        </div>
        <Input
          id={id("postcode")}
          placeholder="e.g. SE1 2UP"
          autoComplete="postal-code"
          value={values.postcode}
          aria-invalid={postcodeFormatBad || undefined}
          aria-describedby={postcodeNote ? id("postcode-note") : undefined}
          onChange={(e) => {
            if (linked) unlink();
            setUnknownPostcode(null);
            onChange("postcode", e.target.value.toUpperCase());
          }}
          onBlur={() => void lookUpPostcode()}
        />
        {postcodeNote && (
          <p
            id={id("postcode-note")}
            className={`text-xs ${postcodeFormatBad ? "text-destructive" : "text-warning"}`}
          >
            {postcodeNote}
          </p>
        )}
      </div>

      <div className="space-y-(--field-gap) sm:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={id("coordinates")}>
            Coordinates (British National Grid)
            <RequiredMark />
          </Label>
          {!readOnly && canLocate() && (
            <button
              type="button"
              onClick={() => void placePinHere()}
              disabled={locating}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-accent disabled:opacity-60"
            >
              {locating ? <Loader2 className="size-3.5 animate-spin" /> : <LocateFixed className="size-3.5" />}
              Use my location
            </button>
          )}
        </div>
        <Input
          id={id("coordinates")}
          placeholder="Easting, Northing — e.g. 530000, 180000"
          inputMode="numeric"
          aria-invalid={coordsInvalid || undefined}
          aria-describedby={id("coordinates-help")}
          className="font-mono tnum"
          value={values.coordinates}
          onChange={(e) => onChange("coordinates", e.target.value)}
          onBlur={() => {
            if (!position) return;
            setFocusKey((k) => k + 1);
            // A typed grid reference moves the pin too.
            if (linked && values.coordinates !== blurredCoords.current) fillFromPin(position, 0);
            blurredCoords.current = values.coordinates;
          }}
        />
        <p
          id={id("coordinates-help")}
          aria-live="polite"
          className={cn(
            "text-xs",
            coordsInvalid || lookupFailed ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {coordsInvalid
            ? "Enter an easting and northing inside Great Britain, e.g. 530000, 180000."
            : lookingUp
              ? "Looking up the address at the pin…"
              : lookupFailed
                ? "Couldn't find an address at the pin, so the fields were left as they were."
                : readOnly
                  ? null
                  : linked
                    ? "Click the map or drag the pin; the address and postcode follow it."
                    : "Click the map or drag the pin to set the position."}
        </p>
        <Suspense
          fallback={
            <div
              className={cn("h-56 w-full animate-pulse rounded-md border border-border bg-muted", mapClassName)}
            />
          }
        >
          <LocationPickerMap
            position={position}
            focusKey={focusKey}
            onPick={pinMoved}
            readOnly={readOnly}
            className={mapClassName}
          />
        </Suspense>
      </div>
    </div>
  );
}
