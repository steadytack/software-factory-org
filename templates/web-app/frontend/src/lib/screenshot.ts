/** A picture of the page for a bug report, without the Help panel it's
 *  taken from. modern-screenshot has the browser draw the page itself, so
 *  it matches what's on screen (html2canvas can't read the oklch colours).
 *  WebGL maps can come out blank. Loaded only when needed. */

const EXCLUDE = '[data-slot="sheet-content"],[data-slot="sheet-overlay"],[data-sonner-toaster],[data-screenshot-exclude]';
const MAX_WIDTH = 1600;

export async function captureScreen(): Promise<string> {
  const { domToJpeg } = await import("modern-screenshot");
  const root = document.body;
  const width = root.clientWidth || window.innerWidth;
  const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
  return domToJpeg(root, {
    width,
    height: window.innerHeight,
    scale: Math.min(1, MAX_WIDTH / width) * Math.min(window.devicePixelRatio || 1, 1.5),
    quality: 0.8,
    backgroundColor: bg,
    filter: (node) => !(node instanceof Element && node.matches(EXCLUDE)),
  });
}
