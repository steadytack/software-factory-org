import { describe, expect, it, vi } from "vitest";

import { __stubResponse } from "./setup";
import { ApiError, expectData } from "../src/api/client";

// openapi-fetch results: `error` is the parsed body, the status lives on
// `response`. The client used to read the status from the body, so a 401
// never triggered the silent refresh and every failure looked like a 500.
const result = (status: number, body: unknown) => ({
  data: status < 400 ? body : undefined,
  error: status >= 400 ? body : undefined,
  response: new Response(null, { status }),
});

describe("expectData", () => {
  it("refreshes the session on 401 and re-sends the request", async () => {
    __stubResponse("/api/auth/refresh", { status: "refreshed" });
    const send = vi
      .fn()
      .mockResolvedValueOnce(result(401, { detail: "Invalid or expired token" }))
      .mockResolvedValueOnce(result(200, { ok: true }));
    await expect(expectData(send)).resolves.toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("reports the real status and the server's message", async () => {
    const send = () => Promise.resolve(result(403, { detail: "Admin privileges required" }));
    const error = await expectData(send).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).message).toBe("Admin privileges required");
  });
});
