import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useNewRecordIntent, useStartNewRecord } from "../src/hooks/useNewRecord";

function Page({ open, can }: { open: () => void; can: { edit: boolean; ready: boolean } }) {
  useNewRecordIntent(open, can);
  const location = useLocation();
  const start = useStartNewRecord();
  return (
    <>
      <output data-testid="url">{location.pathname + location.search}</output>
      <button onClick={() => start("/sites")}>here</button>
      <button onClick={() => start("/findings")}>elsewhere</button>
    </>
  );
}

function renderAt(url: string, can = { edit: true, ready: true }) {
  const open = vi.fn();
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <Page open={open} can={can} />
    </MemoryRouter>,
  );
  return { open, view };
}

const url = () => screen.getByTestId("url").textContent;

describe("?new=1 record intent", () => {
  it("opens the dialog once and drops the parameter, keeping the rest", () => {
    const { open } = renderAt("/sites?q=bridge&new=1");
    expect(open).toHaveBeenCalledTimes(1);
    expect(url()).toBe("/sites?q=bridge");
  });

  it("passes a preset site along, then drops it with the request", () => {
    const { open } = renderAt("/findings?new=1&site=s1");
    expect(open).toHaveBeenCalledWith({ siteId: "s1" });
    expect(url()).toBe("/findings");
  });

  it("waits for the role before deciding", () => {
    const open = vi.fn();
    const ui = (ready: boolean) => (
      <MemoryRouter initialEntries={["/sites?new=1"]}>
        <Page open={open} can={{ edit: ready, ready }} />
      </MemoryRouter>
    );
    const { rerender } = render(ui(false));
    expect(open).not.toHaveBeenCalled();
    expect(url()).toBe("/sites?new=1");
    rerender(ui(true));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("drops the request for someone who can't create", () => {
    const { open } = renderAt("/sites?new=1", { edit: false, ready: true });
    expect(open).not.toHaveBeenCalled();
    expect(url()).toBe("/sites");
  });

  it("starts a new record here (keeping the table state) or on another page", () => {
    const { open } = renderAt("/sites?q=bridge");
    act(() => screen.getByText("here").click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(url()).toBe("/sites?q=bridge");
    act(() => screen.getByText("elsewhere").click());
    // The request travels to the other page, whose intent hook (here, the
    // same test component) opens its dialog and drops the parameter.
    expect(open).toHaveBeenCalledTimes(2);
    expect(url()).toBe("/findings");
  });
});
