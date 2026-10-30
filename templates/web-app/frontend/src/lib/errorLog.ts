/** The last few things that went wrong in this tab — uncaught errors,
 *  rejected promises, failed saves and console errors — so a bug report can
 *  say what happened just before (Help & feedback). In memory
 *  only; nothing is sent unless the user sends a report. */

export interface LoggedError {
  at: string;
  kind: "error" | "promise" | "app" | "console";
  message: string;
}

const MAX = 20;
const log: LoggedError[] = [];

function text(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function recordError(kind: LoggedError["kind"], message: string): void {
  log.push({ at: new Date().toISOString(), kind, message: message.slice(0, 300) });
  if (log.length > MAX) log.splice(0, log.length - MAX);
}

export function recentErrors(): LoggedError[] {
  return [...log];
}

let started = false;
export function startErrorLog(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("error", (e) => recordError("error", e.message || text(e.error)));
  window.addEventListener("unhandledrejection", (e) => recordError("promise", text(e.reason)));
  window.addEventListener("app-error", (e) => recordError("app", text((e as CustomEvent).detail)));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    recordError("console", args.map(text).join(" "));
    original(...args);
  };
}
