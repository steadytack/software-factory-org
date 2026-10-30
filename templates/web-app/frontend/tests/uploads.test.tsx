import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { __stubResponse } from "./setup";
import { FileUpload, splitBySize } from "../src/components/ui/file-upload";
import { AttachmentsTab } from "../src/components/AttachmentsTab";

const file = (name: string, bytes = 10, type = "image/jpeg") =>
  new File([new Uint8Array(bytes)], name, { type });

describe("splitBySize", () => {
  it("keeps files within the limit and names the ones skipped", () => {
    const big = file("huge.jpg", 2 * 1_048_576);
    const { ok, skipped } = splitBySize([file("a.jpg"), big, file("b.jpg")], 1);
    expect(ok.map((f) => f.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(skipped).toMatch(/"huge\.jpg" is over the 1 MB limit/);
  });
});

describe("FileUpload", () => {
  it("accepts several files from the picker and from a drop", () => {
    const onFiles = vi.fn();
    render(<FileUpload onFiles={onFiles} />);
    expect(screen.getByTestId("file-upload-input")).toHaveAttribute("multiple");

    fireEvent.change(screen.getByTestId("file-upload-input"), {
      target: { files: [file("a.jpg"), file("b.jpg")] },
    });
    expect(onFiles).toHaveBeenLastCalledWith([expect.any(File), expect.any(File)]);

    fireEvent.drop(screen.getByRole("button", { name: /upload files/i }), {
      dataTransfer: { files: [file("c.pdf", 10, "application/pdf")], types: ["Files"] },
    });
    expect(onFiles.mock.lastCall![0].map((f: File) => f.name)).toEqual(["c.pdf"]);
  });
});

describe("AttachmentsTab", () => {
  it("uploads every file dropped anywhere on the tab", async () => {
    __stubResponse("/api/attachments", { total: 0, items: [] });
    const posts: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const f = (init.body as FormData).get("file") as File;
        posts.push(f.name);
        return new Response(JSON.stringify({ id: f.name }), { status: 201, headers: { "content-type": "application/json" } });
      }
      return realFetch(input, init);
    }) as typeof fetch;

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AttachmentsTab entity="survey" entityId="s1" />
      </QueryClientProvider>,
    );
    const tab = (await screen.findByText("Add files or drop them here")).closest(".relative") as HTMLElement;
    await act(async () => {
      fireEvent.drop(tab, {
        dataTransfer: { files: [file("one.jpg"), file("two.jpg"), file("three.pdf", 10, "application/pdf")], types: ["Files"] },
      });
    });
    await waitFor(() => expect(posts).toEqual(["one.jpg", "two.jpg", "three.pdf"]));
    globalThis.fetch = realFetch;
  });
});
