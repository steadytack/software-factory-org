import { describe, expect, it, vi } from "vitest";

import { isChunkLoadError, markBuildFresh, recoverFromStaleBuild } from "../src/lib/staleBuild";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

describe("a stale app shell after a deploy", () => {
  it("recognises the browser's chunk-loading errors", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: http://x/assets/MapPage-1.js"))).toBe(true);
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/index-1.css"))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("clears the old shell and reloads once, then stops", async () => {
    const storage = memory();
    const reload = vi.fn();
    const forget = vi.fn(async () => {});
    expect(await recoverFromStaleBuild({ storage, reload, forget })).toBe(true);
    expect(forget).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    // Still broken after the reload: no loop.
    expect(await recoverFromStaleBuild({ storage, reload, forget })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("may reload again once a page has loaded cleanly", async () => {
    const storage = memory();
    const reload = vi.fn();
    await recoverFromStaleBuild({ storage, reload, forget: async () => {} });
    markBuildFresh(storage);
    expect(await recoverFromStaleBuild({ storage, reload, forget: async () => {} })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("doesn't risk a loop when storage is unavailable", async () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const reload = vi.fn();
    expect(await recoverFromStaleBuild({ storage: broken, reload, forget: async () => {} })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
