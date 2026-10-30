/** The frontend's single source of truth for every controlled vocabulary —
 *  **derived from the generated OpenAPI types**, never restated.
 *
 *  `types/openapi.d.ts` holds the authoritative unions, generated from the
 *  backend's own `schemas/enums.py`. The `satisfies readonly X[]` clauses below
 *  are the mechanism: the *types* come from the generated schema, so if the
 *  backend adds, removes or renames a value and the types are regenerated
 *  (`npm run generate:types`), the array here fails to compile until it is
 *  updated. A hand-written array that merely happened to match could drift
 *  silently.
 */
import type { components } from "../types/openapi";

type SiteCreate = components["schemas"]["SiteCreate"];
type SurveyCreate = components["schemas"]["SurveyCreate"];
type CommentCreate = components["schemas"]["CommentCreate"];
type UserCreate = components["schemas"]["UserCreate"];

export type SiteType = NonNullable<SiteCreate["site_type"]>;
export type SiteStatus = NonNullable<SiteCreate["status"]>;
export type SurveyStatus = NonNullable<SurveyCreate["status"]>;
/** Entity names for the generic comments/attachments/changelog tables. */
export type EntityName = CommentCreate["entity"];
export type UserRole = NonNullable<UserCreate["role"]>;

/** Order is the display order, matching the backend's declared order. */
export const SITE_TYPES = [
  "bridge",
  "building",
  "playground",
  "outfall",
  "other",
] as const satisfies readonly SiteType[];

export const SITE_STATUSES = ["active", "archived"] as const satisfies readonly SiteStatus[];

/** Least → most privileged. */
export const USER_ROLES = ["viewer", "editor", "admin"] as const satisfies readonly UserRole[];

export const ROLE_HINTS: Record<UserRole, string> = {
  viewer: "Can view everything and add comments.",
  editor: "Can also add and edit sites and surveys.",
  admin: "Can also delete records and manage users.",
};

export const SURVEY_STATUSES = ["draft", "completed"] as const satisfies readonly SurveyStatus[];

export const ENTITIES = ["site", "survey"] as const satisfies readonly EntityName[];

/** Human-readable labels.
 *
 *  The stored code stays the stable identifier and the label is presentation
 *  only, so a label can be reworded without touching a single row. Values with
 *  no entry fall back to the code, capitalised.
 */
const LABELS: Record<string, string> = {
  other: "Other / not tracked",
};

export function vocabularyLabel(code: string): string {
  return LABELS[code] ?? code.charAt(0).toUpperCase() + code.slice(1).replace(/_/g, " ");
}
