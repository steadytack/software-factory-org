/** Inline SVG icons for the map UI, ported from the reference template. */
import type { SVGProps } from "react";

const I = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ width: "100%", height: "100%" }}
    {...props}
  >
    {children}
  </svg>
);

export const IconSearch = () => (
  <I><circle cx="11" cy="11" r="6" /><path d="M16 16l4 4" /></I>
);
export const IconZoomIn = () => (
  <I><path d="M12 5v14" /><path d="M5 12h14" /></I>
);
export const IconZoomOut = () => (
  <I><path d="M5 12h14" /></I>
);
export const IconHome = () => (
  <I><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></I>
);
export const IconLayers = () => (
  <I>
    <path d="M12 3l8 4-8 4-8-4 8-4z" />
    <path d="M4 11l8 4 8-4" />
    <path d="M4 15l8 4 8-4" />
  </I>
);
export const IconFullscreen = () => (
  <I>
    <path d="M8 3H3v5" />
    <path d="M16 3h5v5" />
    <path d="M21 16v5h-5" />
    <path d="M3 16v5h5" />
  </I>
);
export const IconExitFullscreen = () => (
  <I>
    <path d="M3 8h5V3" />
    <path d="M21 8h-5V3" />
    <path d="M3 16h5v5" />
    <path d="M21 16h-5v5" />
  </I>
);
export const IconLocate = () => (
  <I>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 8v8" />
    <path d="M8 12h8" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
  </I>
);
export const IconClose = () => (
  <I><path d="M18 6L6 18M6 6l12 12" /></I>
);
