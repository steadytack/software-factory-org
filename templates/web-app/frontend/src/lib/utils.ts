export { cn } from "cn";

/** Relative time ("just now", "5m ago", "3h ago", "2d ago") from an ISO date.
 *  Single source of truth — previously copy-pasted in 4 components. */
export function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Human-readable byte size. */
export function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** Sanitize a small HTML snippet for map-attribution text: only text and
 *  plain `<a href="http(s)://...">` links survive (with `rel`/`target` set
 *  safely); every other element, attribute, script or event handler is
 *  dropped. Attribution strings are developer-supplied today, but they get
 *  rendered via `dangerouslySetInnerHTML` for the required copyright links
 *  (e.g. OpenStreetMap's), so this keeps that renderer inert even if a
 *  future custom map layer ever threads attribution through from elsewhere. */
export function sanitizeAttributionHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  function clean(node: Node): Node[] {
    if (node.nodeType === Node.TEXT_NODE) return [node.cloneNode()];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const el = node as Element;
    if (el.tagName !== "A") {
      return Array.from(el.childNodes).flatMap(clean);
    }
    const href = el.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href)) {
      return Array.from(el.childNodes).flatMap(clean);
    }
    const a = document.createElement("a");
    a.setAttribute("href", href);
    a.setAttribute("rel", "noopener noreferrer");
    a.setAttribute("target", "_blank");
    Array.from(el.childNodes).flatMap(clean).forEach((child) => a.appendChild(child));
    return [a];
  }

  const out = document.createElement("div");
  Array.from(template.content.childNodes)
    .flatMap(clean)
    .forEach((node) => out.appendChild(node));
  return out.innerHTML;
}

/** True for an internal, same-origin relative path — single-slash prefixed,
 *  not protocol-relative ("//evil.com" also starts with "/" but the browser
 *  resolves it as a scheme-relative absolute URL to another origin) and free
 *  of backslashes and control characters ("/\evil.com" reads as "//evil.com"
 *  to browsers). Use before navigating to any path sourced from a redirect
 *  param or untrusted data (notification links, post-login "from"). */
export function isSafeRelativePath(path: string | null | undefined): path is string {
  return (
    !!path &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    !/[\\\u0000-\u001f\u007f]/.test(path)
  );
}
