/** What a bug report carries besides the user's words (Help → Report or
 *  suggest): the page, who's signed in and their role, browser, OS and
 *  device, app state and the last few errors. Everything here is shown to
 *  the user under "What's sent with it" before they send. */
import { loadPrefs } from "./prefs";
import { recentErrors, type LoggedError } from "./errorLog";
import { snapshot as outboxSnapshot } from "./outbox";

export interface ReportUser {
  email: string | null;
  displayName: string;
  role: string;
  multiUser: boolean;
}

export interface Diagnostics {
  page: { url: string; path: string; title: string };
  user: { email: string | null; name: string; role: string; mode: string };
  browser: { name: string; version: string; language: string; cookies: boolean };
  system: { os: string; device: string; touch: boolean; installed: boolean };
  screen: { screen: string; window: string; pixelRatio: number; colourScheme: string };
  app: {
    version: string;
    built: string;
    theme: string;
    density: string;
    online: boolean;
    offlineReady: boolean;
    waitingToUpload: number;
  };
  time: { local: string; timeZone: string };
  recentErrors: string[];
}

type UAData = {
  brands?: { brand: string; version: string }[];
  mobile?: boolean;
  platform?: string;
};

/** Browser name and version from the user-agent string. */
export function parseBrowser(ua: string): { name: string; version: string } {
  const tests: [string, RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Opera", /OPR\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of tests) {
    const m = re.exec(ua);
    if (m) return { name, version: m[1] };
  }
  return { name: "Unknown", version: "" };
}

/** Operating system (with version where the string gives it). */
export function parseOS(ua: string): string {
  const win = /Windows NT ([\d.]+)/.exec(ua);
  if (win) return `Windows ${{ "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" }[win[1]] ?? win[1]}`;
  const ios = /(?:iPhone|iPad|iPod).*? OS ([\d_]+)/.exec(ua);
  if (ios) return `iOS ${ios[1].replace(/_/g, ".")}`;
  const android = /Android ([\d.]+)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  const mac = /Mac OS X ([\d_.]+)/.exec(ua);
  if (mac) return `macOS ${mac[1].replace(/_/g, ".")}`;
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

function deviceKind(ua: string, uaData?: UAData): string {
  if (/iPad|Tablet/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "Tablet";
  if (uaData?.mobile || /Mobi|iPhone|Android.*Mobile/.test(ua)) return "Phone";
  if (/Android/.test(ua)) return "Tablet";
  return "Desktop";
}

function errorLine(e: LoggedError): string {
  return `${e.at.slice(11, 19)} [${e.kind}] ${e.message}`;
}

export function collectDiagnostics(user: ReportUser): Diagnostics {
  const ua = navigator.userAgent;
  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData;
  const browser = parseBrowser(ua);
  const prefs = loadPrefs();
  let theme = "system";
  try {
    theme = localStorage.getItem("theme") ?? "system";
  } catch {
    // storage blocked
  }
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  return {
    page: {
      url: window.location.href,
      path: window.location.pathname + window.location.search,
      title: document.title,
    },
    user: {
      email: user.email,
      name: user.displayName,
      role: user.role,
      mode: user.multiUser ? "multi-user" : "single-user",
    },
    browser: {
      name: browser.name,
      version: browser.version,
      language: navigator.language,
      cookies: navigator.cookieEnabled,
    },
    system: {
      os: parseOS(ua) === "Unknown" && uaData?.platform ? uaData.platform : parseOS(ua),
      device: deviceKind(ua, uaData),
      touch: navigator.maxTouchPoints > 0,
      installed: window.matchMedia?.("(display-mode: standalone)")?.matches ?? false,
    },
    screen: {
      screen: `${window.screen?.width ?? 0}×${window.screen?.height ?? 0}`,
      window: `${window.innerWidth}×${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio || 1,
      colourScheme: dark ? "dark" : "light",
    },
    app: {
      version: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev",
      built: typeof __APP_BUILT__ !== "undefined" ? __APP_BUILT__ : "dev",
      theme,
      density: prefs.density,
      online: navigator.onLine,
      offlineReady: Boolean(navigator.serviceWorker?.controller),
      waitingToUpload: outboxSnapshot().length,
    },
    time: {
      local: new Date().toString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    recentErrors: recentErrors().map(errorLine),
  };
}

/** Diagnostics as label → value rows, for "What's sent with it". */
export function diagnosticsRows(d: Diagnostics): [string, string][] {
  const rows: [string, string][] = [];
  const titles: Record<keyof Diagnostics, string> = {
    page: "Page",
    user: "You",
    browser: "Browser",
    system: "System",
    screen: "Screen",
    app: "App",
    time: "Time",
    recentErrors: "Recent errors",
  };
  for (const [key, value] of Object.entries(d) as [keyof Diagnostics, unknown][]) {
    if (Array.isArray(value)) {
      rows.push([titles[key], value.length ? value.join("\n") : "None"]);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) rows.push([`${titles[key]} · ${k}`, String(v ?? "—")]);
    }
  }
  return rows;
}
