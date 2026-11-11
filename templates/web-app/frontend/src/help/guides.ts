import { matchPath } from "react-router-dom";

import type { HelpTopic } from "./types";

/** Guides live as markdown in ./guides/*.md, one file per group:
 *
 *    ---
 *    group: Sites
 *    pages: [/sites, /sites/:siteId]   # optional; leave out to show on every page
 *    order: 2                          # optional; orders files within a group
 *    ---
 *
 *    ## Adding a site {#sites-add}
 *    <!-- keywords: new, create -->     # optional, used by the search box
 *
 *    Markdown body. Each `##` heading is one collapsible section in Help → Guides.
 *
 *  The `{#id}` is optional (the heading is slugged otherwise); it is what
 *  openHelp("sites-add") opens. */
const FILES = import.meta.glob("./guides/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*?)\s*(#.*)?$/.exec(line);
    if (kv) meta[kv[1]] = kv[2];
  }
  return { meta, body: raw.slice(m[0].length) };
}

/** Parses one guide file into its sections. Exported for tests. */
export function parseGuide(raw: string, file = "guide"): HelpTopic[] {
  const { meta, body } = parseFrontMatter(raw);
  const group = meta.group || "Guides";
  const pages = meta.pages
    ? meta.pages.replace(/^\[|\]$/g, "").split(",").map((p) => p.trim()).filter(Boolean)
    : undefined;
  const fileOrder = Number(meta.order ?? 0) || 0;
  const sections = body.split(/^## /m).slice(1);
  return sections.map((section, index) => {
    const newline = section.indexOf("\n");
    const heading = (newline === -1 ? section : section.slice(0, newline)).trim();
    let text = newline === -1 ? "" : section.slice(newline + 1);
    const idMatch = /\s*\{#([\w-]+)\}$/.exec(heading);
    const title = idMatch ? heading.slice(0, idMatch.index).trim() : heading;
    const kw = /<!--\s*keywords:\s*(.*?)\s*-->/.exec(text);
    text = text.replace(/<!--[\s\S]*?-->/g, "").trim();
    return {
      id: idMatch ? idMatch[1] : `${slug(file)}-${slug(title)}`,
      title,
      group,
      body: text,
      keywords: kw ? kw[1].split(",").map((k) => k.trim()).filter(Boolean) : [],
      order: fileOrder * 100 + index,
      pages,
    };
  });
}

export const ALL_GUIDES: HelpTopic[] = Object.entries(FILES).flatMap(([path, raw]) =>
  parseGuide(raw, path.replace(/^.*\/|\.md$/g, "")),
);

/** The guides for a page: those for every page, plus those whose `pages`
 *  pattern matches the current path. */
export function guidesFor(pathname: string, guides: HelpTopic[] = ALL_GUIDES): HelpTopic[] {
  return guides.filter(
    (g) => !g.pages || g.pages.some((pattern) => matchPath({ path: pattern, end: true }, pathname)),
  );
}
