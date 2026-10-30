/**
 * Popups for the map's point layers, built with the DOM API — record fields
 * are never interpolated into HTML strings (a site named `<img onerror=…>`
 * must not run). Colours come from the theme tokens so popups follow
 * light/dark mode.
 */
import type {
  PointLayerKey,
  PointLayerStyle,
  SitePointIn,
  SurveyPointIn,
} from "./pointLayers";
import { POINT_LAYERS, colorOfRecord, surveyCategory } from "./pointLayers";
import { BRAND_BLUE } from "./colors";

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || BRAND_BLUE;
}

function el(tag: string, text: string, css: string): HTMLElement {
  const e = document.createElement(tag);
  e.textContent = text;
  e.style.cssText = css;
  return e;
}

const kicker = (text: string, color: string) =>
  el("p", text, `margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.02em;font-weight:600;color:${color}`);
const body = (text: string) =>
  el("p", text, `margin:0;font-size:13px;line-height:1.3;color:${token("--popover-foreground")}`);
const note = (text: string) => el("p", text, `margin:0;font-size:11px;color:${token("--muted-foreground")}`);

function link(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.style.cssText = `margin-top:2px;font-size:12px;font-weight:600;color:${token("--primary")};text-decoration:none`;
  a.onmouseenter = () => (a.style.textDecoration = "underline");
  a.onmouseleave = () => (a.style.textDecoration = "none");
  return a;
}

function box(...children: HTMLElement[]): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:170px;max-width:250px";
  root.append(...children);
  return root;
}

const categoryLabel = (key: PointLayerKey, field: string, value: string) =>
  POINT_LAYERS[key].fields.find((f) => f.key === field)?.categories.find((c) => c.value === value)?.label ?? value;

export function sitePopup(site: SitePointIn, style: PointLayerStyle): HTMLElement {
  return box(
    body(site.name),
    kicker(
      `${categoryLabel("sites", "type", site.site_type)}${site.status === "archived" ? " · archived" : ""}`,
      colorOfRecord("sites", style, { type: site.site_type, status: site.status === "archived" ? "archived" : "active" }),
    ),
    link(`/sites/${site.id}`, "Open site →"),
  );
}

export function surveyPopup(s: SurveyPointIn, style: PointLayerStyle): HTMLElement {
  const cat = surveyCategory(s);
  return box(
    body(s.site_name),
    kicker(
      `Latest survey ${new Date(s.survey_date).toLocaleDateString("en-GB")} · ${s.status}`,
      colorOfRecord("surveys", style, { status: cat }),
    ),
    note(`${s.survey_count} survey${s.survey_count === 1 ? "" : "s"} on this site`),
    link(`/surveys/${s.survey_id}`, "Open latest survey →"),
    link(`/sites/${s.site_id}`, "Open site →"),
  );
}
