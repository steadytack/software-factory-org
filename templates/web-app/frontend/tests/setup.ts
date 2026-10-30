import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// jsdom provides no fetch AND no URL base; openapi-fetch builds URLs relative
// to the configured baseUrl. Stub a deterministic fetch so page tests assert
// UI behaviour, not networking.
type Stub = { body: unknown; status: number };
const responses = new Map<string, Stub>();

export function __stubResponse(path: string, body: unknown, status = 200) {
  responses.set(path, { body, status });
}

globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
  // openapi-fetch passes a Request object; extract its URL.
  const url = input instanceof Request ? input.url : String(input);
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  for (const [pattern, payload] of responses) {
    if (path === pattern || path.startsWith(pattern)) {
      return new Response(JSON.stringify(payload.body), {
        status: payload.status,
        headers: { "content-type": "application/json" },
      });
    }
  }
  console.error("[fetch-stub] MISS:", url, "stubs:", [...responses.keys()]);
  return new Response(JSON.stringify({ detail: "not stubbed" }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

// jsdom has no matchMedia; the shadcn sidebar's useIsMobile needs it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// React Router's data router builds a Request with jsdom's AbortSignal, which
// Node's Request rejects ("Expected signal to be an instance of AbortSignal"),
// silently failing every navigation in tests. Drop the signal — tests never
// abort navigations. Real browsers are unaffected.
{
  const NodeRequest = globalThis.Request;
  globalThis.Request = class extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init?.signal) {
        const { signal: _signal, ...rest } = init;
        void _signal;
        super(input, rest);
      } else {
        super(input, init);
      }
    }
  } as typeof Request;
}

// cmdk (command palette) measures its list and scrolls the active item.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
Element.prototype.scrollIntoView ??= () => {};

// floating-ui (Radix popovers/tooltips) checks `el.matches(":modal")` on
// every ancestor each time it positions; jsdom's selector engine resolves
// `:modal` via a recursive `:fullscreen` match, which ran ~150M matches and
// ~40s in one popover test. Nothing is ever a modal <dialog> in jsdom.
const nativeMatches = Element.prototype.matches;
Element.prototype.matches = function (this: Element, selectors: string) {
  return selectors === ":modal" ? false : nativeMatches.call(this, selectors);
};

// jsdom has no WebGL (and no URL.createObjectURL for maplibre's worker), so
// the site form's pin-picker map renders nothing in unit tests.
vi.mock("../src/components/map/LocationPickerMap", () => ({
  default: () => null,
}));

afterEach(() => {
  responses.clear();
  vi.clearAllMocks();
});
