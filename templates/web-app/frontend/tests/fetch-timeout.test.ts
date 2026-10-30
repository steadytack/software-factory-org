import { describe, expect, it } from "vitest";

import { withTimeout } from "../src/lib/fetchTimeout";

describe("withTimeout", () => {
  it("aborts on its own after the limit", async () => {
    const signal = withTimeout(10);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(signal.aborted).toBe(true);
    expect((signal.reason as DOMException).name).toBe("TimeoutError");
  });

  it("also aborts when the caller cancels first", () => {
    const controller = new AbortController();
    const signal = withTimeout(60_000, controller.signal);
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });
});
