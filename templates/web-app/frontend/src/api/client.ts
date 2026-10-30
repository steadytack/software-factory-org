import { QueryClient, MutationCache } from "@tanstack/react-query";
import createClient from "openapi-fetch";
import type { paths } from "../types/openapi";
import { refreshSession, clearSessionState } from "./refresh";
import { CACHE_MAX_AGE } from "../lib/persistence";
import { bindQueryClient, enqueue, isNetworkError, outboxMiddleware, shouldQueue } from "../lib/outbox";

export const queryClient = new QueryClient({
  defaultOptions: {
    // Offline: reads still go out so the service worker can answer them
    // from its cache ("offlineFirst"), and writes always run so a network
    // failure reaches the outbox (lib/outbox.ts). React Query's default
    // ("online") would instead *pause* both while navigator.onLine is false.
    // Kept in memory as long as the on-device copy (lib/persistence.ts) —
    // a query dropped from memory would also drop out of that copy.
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: CACHE_MAX_AGE,
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: { networkMode: "always" },
  },
  // One global surface for failed mutations — individual hooks don't need
  // their own onError to give the user feedback.
  mutationCache: new MutationCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) return; // redirect handles it
      console.error(`Mutation failed: ${error.message}`);
      // 403 = signed in but the role doesn't allow it. Say so plainly rather
      // than echo the server's wording (or, worse, treat it as expiry).
      const message =
        error instanceof ApiError && error.status === 403
          ? "You don't have permission to do that."
          : error.message;
      window.dispatchEvent(new CustomEvent("app-error", { detail: message }));
    },
  }),
});

// Generated OpenAPI paths already include the "/api" prefix (FastAPI mounts
// routers under /api), so the base URL must be the origin only. In the
// browser that's same-origin (nginx/Vite proxy handles routing — dev ports
// are 5173/5174); in Node tests Request needs an absolute URL, hence the
// explicit localhost origin (only used outside the browser).
function resolveBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

export const api = createClient<paths>({ baseUrl: resolveBaseUrl() });
// Offline: writes that can't reach the server wait in the outbox.
api.use(outboxMiddleware());
bindQueryClient(queryClient);

type ApiResult<T> = { data?: T; error?: unknown; response?: Response };

/** openapi-fetch puts the HTTP status on `response`; `error` is only the
 *  parsed body (FastAPI's `{detail}`), which carries no status. Reading it
 *  from the body meant every failure looked like a 500 and an expired
 *  access token never triggered the silent refresh. */
function statusOf(result: ApiResult<unknown>): number {
  if (result.response) return result.response.status;
  const error = result.error;
  if (typeof error === "object" && error !== null && "status" in error) {
    return (error as { status?: number }).status ?? 500;
  }
  return 500;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Thin wrapper: openapi-fetch returns {data, error}; turn error into a throw.
 *  On 401, attempt one silent session refresh and retry the request once —
 *  this keeps long-lived tabs working past the 15-minute access-token TTL. */
export async function expectData<T>(
  request: Promise<ApiResult<T>> | (() => Promise<ApiResult<T>>),
  retry?: () => Promise<ApiResult<T>>,
): Promise<T> {
  // Pass the request as a function and it can be re-sent after a refresh;
  // a request the server answered 401 was never executed, so re-sending a
  // write is safe.
  if (typeof request === "function") retry ??= request;
  let result = await (typeof request === "function" ? request() : request);
  if (result.error != null && statusOf(result) === 401) {
    const refreshed = await refreshSession();
    if (refreshed && retry) {
      result = await retry();
    }
  }
  const { data, error } = result;
  if (error !== undefined && error !== null) {
    const status = statusOf(result);
    if (status === 401) {
      clearSessionState();
      // Definitive expiry: send the user to login (preserving where they were).
      // Skip when already heading there (e.g. the login page's own failed attempt).
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.assign(
          `/login?from=${encodeURIComponent(
            window.location.pathname + window.location.search + window.location.hash,
          )}`,
        );
      }
    }
    throw new ApiError(status, extractDetail(error));
  }
  if (data === undefined) {
    // No error and no data is a legitimate success for a 204 No Content
    // response (e.g. DELETE) — not a failure. Previously this threw on
    // every successful delete, which silently blocked the resulting cache
    // invalidation/toast even though the server had already done the delete.
    return undefined as T;
  }
  return data;
}

/** Pull a human-readable message out of an openapi-fetch error body.
 *  FastAPI errors are {detail: string} or {detail: [{msg, loc, ...}]}. */
function extractDetail(error: unknown): string {
  if (typeof error === "object" && error !== null && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const parts = detail
        .map((d) =>
          typeof d === "object" && d !== null && "msg" in d
            ? String((d as { msg?: unknown }).msg)
            : String(d),
        )
        .join("; ");
      if (parts) return parts;
    }
  }
  return "Request failed";
}

/** Shared JSON fetch for the few call sites that cannot use the typed
 *  `openapi-fetch` client (multipart upload, dashboard stats). Enforces
 *  res.ok, surfaces the backend's `detail` via the same extractor, and
 *  throws a single ApiError shape so every failure looks the same to
 *  callers and the global `app-error` surface. On 401, attempts one silent
 *  session refresh and retries once — same as `expectData` — so these call
 *  sites don't break when the access token expires mid-session; a definitive
 *  401 clears session state and redirects to login exactly like `expectData`. */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackMessage = "Request failed",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    // A file upload with no signal: keep the file on the device and send
    // it later (see lib/outbox.ts).
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init.method ?? "GET";
    if (isNetworkError(error) && init.body instanceof FormData && shouldQueue(method, url)) {
      const [field, file] = [...init.body.entries()].find(([, v]) => v instanceof File) ?? [];
      if (field && file instanceof File) {
        const entry = await enqueue({ method, url, file: { blob: file, name: file.name, field } });
        if (entry) return { queued: true, outbox_id: entry.id } as T;
      }
    }
    throw error;
  }
  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await fetch(input, init);
    }
  }
  if (!response.ok) {
    let detail = `${fallbackMessage} (${response.status})`;
    try {
      const body: unknown = await response.json();
      const parsed = extractDetail(body);
      if (parsed !== "Request failed") detail = parsed;
    } catch {
      // non-JSON error body — keep the fallback message
    }
    if (response.status === 401) {
      clearSessionState();
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login")
      ) {
        window.location.assign(
          `/login?from=${encodeURIComponent(
            window.location.pathname + window.location.search + window.location.hash,
          )}`,
        );
      }
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

