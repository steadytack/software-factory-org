/** The device's position, asked for only when something calls this (never on page load), and the sites near it. */
import { distanceMeters } from "../components/map/utils/coordinates";

export interface Here {
  lat: number;
  lng: number;
  /** Metres: the real position is probably within this of the one reported. */
  accuracy: number;
}

/** A site is "close by" when it is within this many metres of you. */
export const NEAR_SITE_METRES = 500;
/** A fix worse than this is worth a warning (indoors, or a laptop without GPS). */
export const POOR_ACCURACY_METRES = 50;

export const canLocate = () => typeof navigator !== "undefined" && "geolocation" in navigator;

export function getHere(): Promise<Here> {
  return new Promise((resolve, reject) => {
    if (!canLocate()) {
      reject(new Error("This device can't share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was refused. You can allow it in the browser's site settings."
              : "Couldn't get your location. Try again outside or by a window.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

export const formatDistance = (metres: number) =>
  metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;

/** "±12 m", with a nudge when that's too rough to trust. */
export function accuracyNote(accuracy: number): { text: string; poor: boolean } {
  const text = `±${Math.max(1, Math.round(accuracy))} m`;
  return { text, poor: accuracy > POOR_ACCURACY_METRES };
}

export interface LocatedSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

/** The nearest site to `here`, and how far, or null when there are none. `close` says whether it is within NEAR_SITE_METRES. */
export function nearestSite<S extends LocatedSite>(
  here: { lat: number; lng: number },
  sites: S[],
): { site: S; metres: number; close: boolean } | null {
  let best: { site: S; metres: number } | null = null;
  for (const site of sites) {
    const metres = distanceMeters([here.lng, here.lat], [site.longitude, site.latitude]);
    if (!best || metres < best.metres) best = { site, metres };
  }
  return best ? { ...best, close: best.metres <= NEAR_SITE_METRES } : null;
}
