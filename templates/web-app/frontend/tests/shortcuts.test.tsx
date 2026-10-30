import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { useGlobalShortcuts } from "../src/hooks/useGlobalShortcuts";

function Shell({ onAdd }: { onAdd?: () => void }) {
  useGlobalShortcuts();
  const location = useLocation();
  return (
    <>
      <output data-testid="path">{location.pathname}</output>
      {onAdd && (
        <button data-primary-action="" onClick={onAdd}>
          Add
        </button>
      )}
      <input aria-label="field" />
    </>
  );
}

const press = (key: string, target: Element = document.body) => fireEvent.keyDown(target, { key });
const path = () => screen.getByTestId("path").textContent;

describe("global shortcuts", () => {
  it.each([
    ["v", "/surveys"],
  ])("g then %s goes to %s", (key, to) => {
    render(
      <MemoryRouter>
        <Shell />
      </MemoryRouter>,
    );
    press("g");
    press(key);
    expect(path()).toBe(to);
  });

  it("n presses the list page's Add button, but not while typing", () => {
    const onAdd = vi.fn();
    render(
      <MemoryRouter>
        <Shell onAdd={onAdd} />
      </MemoryRouter>,
    );
    press("n", screen.getByLabelText("field"));
    expect(onAdd).not.toHaveBeenCalled();
    press("n");
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
