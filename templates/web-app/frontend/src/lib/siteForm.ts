/** Site form fields — single source of truth shared by SitesPage (create
 *  dialog) and SiteDetailPage (overview tab). Previously duplicated with
 *  diverged validation (the detail copy lacked lat/lng bounds).
 *
 *  the option arrays used to be hand-written HERE as well as in
 *  `schemas/enums.py` and again as inline unions in `SiteDetailPage`. They now
 *  come from `lib/vocabularies.ts`, which derives them from the generated
 *  OpenAPI types — so the form cannot offer an option the API refuses. The
 *  re-exports keep this module's import surface unchanged. */
export {
  SITE_TYPES,
  SITE_STATUSES as STATUSES,
  ENTITIES,
  type SiteType,
  type SiteStatus,
  type EntityName,
} from "./vocabularies";

import { SITE_STATUSES, SITE_TYPES, type SiteStatus, type SiteType } from "./vocabularies";
import { formatEN, latLngToEN, parseEN } from "../components/map/utils/coordinates";

/** The plain fields. Location (address, postcode, BNG coordinates) is edited
 *  by `SiteLocationFields`, which adds autocomplete and a map picker. */
export const SITE_FORM_FIELDS: FormFieldLike[] = [
  { name: "name", label: "Name", kind: "text", required: true, placeholder: "e.g. Tower Bridge" },
  { name: "site_type", label: "Type", kind: "select", options: [...SITE_TYPES] },
  { name: "status", label: "Status", kind: "select", options: [...SITE_STATUSES] },
  { name: "notes", label: "Notes", kind: "textarea", placeholder: "Optional notes" },
];

/** Form state for a site: every field is a string while editing.
 *  `coordinates` holds British National Grid "easting, northing". */
export type SiteFormValues = Record<
  "name" | "site_type" | "status" | "address" | "postcode" | "coordinates" | "notes",
  string
>;

export const EMPTY_SITE_FORM: SiteFormValues = {
  name: "",
  site_type: "bridge",
  status: "active",
  address: "",
  postcode: "",
  coordinates: "",
  notes: "",
};

/** WGS84 → the BNG text shown in the Coordinates field ("" outside GB). */
export function coordinatesText(lat: number, lng: number): string {
  const en = latLngToEN(lat, lng);
  return en ? formatEN(en.e, en.n) : "";
}

export function siteToForm(site: {
  name: string;
  site_type: string;
  status: string;
  address: string | null;
  postcode?: string | null;
  notes: string | null;
  latitude: number;
  longitude: number;
}): SiteFormValues {
  return {
    name: site.name,
    site_type: site.site_type,
    status: site.status,
    address: site.address ?? "",
    postcode: site.postcode ?? "",
    coordinates: coordinatesText(site.latitude, site.longitude),
    notes: site.notes ?? "",
  };
}

export interface SitePayload {
  name: string;
  site_type: SiteType;
  status: SiteStatus;
  address: string | null;
  postcode: string | null;
  notes: string | null;
  latitude: number;
  longitude: number;
}

/** Validate + convert the form to the API body. Coordinates must be a BNG
 *  easting/northing inside Great Britain — the API still stores WGS84. */
export function formToSitePayload(
  form: SiteFormValues,
): { ok: true; body: SitePayload } | { ok: false; error: string } {
  if (!form.name.trim()) return { ok: false, error: "Name is required." };
  const point = parseEN(form.coordinates);
  if (!point) {
    return {
      ok: false,
      error: "Coordinates must be a British National Grid easting and northing, e.g. 530000, 180000.",
    };
  }
  return {
    ok: true,
    body: {
      name: form.name,
      site_type: form.site_type as SiteType,
      status: form.status as SiteStatus,
      // blank is sent as null, which is also what the API stores.
      address: form.address.trim() || null,
      postcode: form.postcode.trim() || null,
      notes: form.notes.trim() || null,
      latitude: point.lat,
      longitude: point.lng,
    },
  };
}

/** Structural subset of RecordFormDialog's FormField — keeps this module
 *  importable without a component dependency cycle. */
export interface FormFieldLike {
  name: string;
  label: string;
  kind: "text" | "number" | "select" | "textarea";
  required?: boolean;
  step?: string;
  min?: string;
  max?: string;
  placeholder?: string;
  options?: string[];
}


