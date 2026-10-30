import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCrudHooks } from "../src/hooks/createCrudHooks";

type Rec = { id: string };
type List = { total: number; items: Rec[] };

function setup(create: () => Promise<unknown>) {
  // Like a real fetch: fails with a network error while offline.
  const list = vi.fn(async (): Promise<List> => {
    if (!onlineManager.isOnline()) throw new TypeError("Failed to fetch");
    return { total: 0, items: [] };
  });
  const hooks = createCrudHooks<object, object, Rec, List>({
    key: "sites",
    list,
    get: async () => ({ id: "x" }),
    create: create as () => Promise<Rec>,
    update: async () => ({ id: "x" }),
    remove: async () => {},
  });
  // The app's settings (api/client.ts): writes always run so failures reach
  // the outbox; reads try once, then their retry waits for the connection.
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, networkMode: "offlineFirst" },
      mutations: { networkMode: "always" },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  // A mounted list, so a create has something to invalidate.
  renderHook(() => hooks.useList(), { wrapper });
  return { hooks, wrapper, list };
}

describe("create while offline", () => {
  afterEach(() => onlineManager.setOnline(true));

  it("settles at once when the outbox queued it, instead of waiting to refetch", async () => {
    const { hooks, wrapper } = setup(async () => ({ queued: true, outbox_id: "o1" }));
    const { result } = renderHook(() => hooks.useCreate(), { wrapper });
    onlineManager.setOnline(false);

    const onSuccess = vi.fn();
    await act(async () => {
      result.current.mutate({}, { onSuccess });
      // Before the fix this waited on a refetch paused until reconnection.
      await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled(), { timeout: 1000 });
    });
  });

  it("still refreshes the list after a real create", async () => {
    const { hooks, wrapper, list } = setup(async () => ({ id: "new" }));
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    const { result } = renderHook(() => hooks.useCreate(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({});
    });
    expect(list).toHaveBeenCalledTimes(2);
  });
});
