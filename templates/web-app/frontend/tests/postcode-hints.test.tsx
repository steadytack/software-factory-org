import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteLocationFields } from "../src/components/SiteLocationFields";

type Values = { address: string; postcode: string; coordinates: string };

function Harness({ initial }: { initial?: Partial<Values> }) {
  const [values, setValues] = useState<Values>({
    address: "",
    postcode: "",
    coordinates: "530000, 180000",
    ...initial,
  });
  return (
    <SiteLocationFields
      values={values}
      onChange={(name, value) => setValues((v) => ({ ...v, [name]: value }))}
    />
  );
}

const postcodeInput = () => screen.getByLabelText("Postcode") as HTMLInputElement;

function type(value: string) {
  fireEvent.change(postcodeInput(), { target: { value } });
  fireEvent.blur(postcodeInput());
}

describe("postcode field hints (-8)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks for a UK postcode when the one typed is not shaped like one, without calling the service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);
    type("ABCDEFGHIJ");
    expect(await screen.findByText("Enter a UK postcode, like SW1A 1AA")).toBeInTheDocument();
    expect(postcodeInput()).toHaveAttribute("aria-invalid", "true");
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("postcodes.io"), expect.anything());
  });

  it("warns, but does not block, when postcodes.io has never heard of a well-formed postcode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    render(<Harness />);
    type("SW1A 0ZZ");
    expect(await screen.findByText(/postcodes\.io doesn't know this postcode/)).toBeInTheDocument();
    expect(postcodeInput()).not.toHaveAttribute("aria-invalid");
  });

  it("says nothing for a postcode that exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ status: 200, result: { latitude: 51.5, longitude: -0.12, postcode: "SW1A 1AA" } }),
          { status: 200 },
        ),
      ),
    );
    render(<Harness />);
    type("sw1a 1aa");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/doesn't know this postcode/)).toBeNull();
    expect(screen.queryByText("Enter a UK postcode, like SW1A 1AA")).toBeNull();
  });

  it("does not mistake being offline for a wrong postcode", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<Harness />);
    type("SE1 2UP");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/doesn't know this postcode/)).toBeNull();
  });

  it("clears the warning as soon as the postcode is edited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    render(<Harness />);
    type("SW1A 0ZZ");
    await screen.findByText(/doesn't know this postcode/);
    fireEvent.change(postcodeInput(), { target: { value: "SW1A 0Z" } });
    expect(screen.queryByText(/doesn't know this postcode/)).toBeNull();
  });
});
