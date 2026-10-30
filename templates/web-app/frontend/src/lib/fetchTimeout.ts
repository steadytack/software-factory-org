/** One way to keep an outbound request from hanging: combine the caller's
 *  own cancel signal (if any) with a timeout. Used for calls to services we
 *  don't run (geocoding, map data); our own API goes through api/client.ts.
 *
 *  `AbortSignal.any` is missing from older phones' browsers (Safari before
 *  17.4), so it is not relied on. */
export function withTimeout(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);
  const combined = new AbortController();
  for (const source of [signal, timeout]) {
    if (source.aborted) {
      combined.abort(source.reason);
      break;
    }
    source.addEventListener("abort", () => combined.abort(source.reason), { once: true });
  }
  return combined.signal;
}
