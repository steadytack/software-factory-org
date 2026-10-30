import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareButton } from "../src/components/ShareButton";
import { TooltipProvider } from "../src/components/ui/tooltip";

function renderButton() {
  document.title = "North Pier · Web App Template";
  window.history.pushState({}, "", "/sites/s1?tab=surveys");
  return render(
    <TooltipProvider>
      <ShareButton />
    </TooltipProvider>,
  );
}

describe("Share", () => {
  afterEach(() => {
    // @ts-expect-error — test cleanup of an optional browser API
    delete navigator.share;
  });

  it("opens the device's share sheet with the page's title and link", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    renderButton();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Share this page" })));
    expect(share).toHaveBeenCalledWith({ title: "North Pier · Web App Template", url: "http://localhost:3000/sites/s1?tab=surveys" });
    expect(screen.queryByText("Copy link")).toBeNull();
  });

  it("offers Copy link and Email where there's no share sheet", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Share this page" }));
    const field = await screen.findByLabelText("Link to this page");
    expect(field).toHaveValue("http://localhost:3000/sites/s1?tab=surveys");
    expect(screen.getByRole("link", { name: /email/i })).toHaveAttribute(
      "href",
      `mailto:?subject=${encodeURIComponent("North Pier · Web App Template")}&body=${encodeURIComponent("http://localhost:3000/sites/s1?tab=surveys")}`,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /copy link/i })));
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/sites/s1?tab=surveys");
    await waitFor(() => expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument());
  });
});
