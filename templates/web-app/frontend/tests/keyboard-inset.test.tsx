import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useKeyboardInset } from "../src/hooks/useKeyboardInset";

/** A stand-in for window.visualViewport (jsdom has none). */
function fakeViewport(height: number) {
  const listeners = new Set<() => void>();
  const vv = {
    height,
    offsetTop: 0,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return {
    resize(next: number) {
      vv.height = next;
      listeners.forEach((fn) => fn());
    },
  };
}

describe("useKeyboardInset", () => {
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
  });

  it("reports how much of the screen the keyboard covers", () => {
    const vv = fakeViewport(window.innerHeight);
    const { result } = renderHook(() => useKeyboardInset(true));
    expect(result.current).toBe(0);
    act(() => vv.resize(window.innerHeight - 300));
    expect(result.current).toBe(300);
    act(() => vv.resize(window.innerHeight));
    expect(result.current).toBe(0);
  });

  it("is 0 when inactive or unsupported", () => {
    fakeViewport(window.innerHeight - 300);
    expect(renderHook(() => useKeyboardInset(false)).result.current).toBe(0);
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    expect(renderHook(() => useKeyboardInset(true)).result.current).toBe(0);
  });
});
