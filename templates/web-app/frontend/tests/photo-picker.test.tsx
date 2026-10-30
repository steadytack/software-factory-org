import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { PhotoPicker } from "../src/components/PhotoPicker";

beforeAll(() => {
  // jsdom has no object URLs.
  let n = 0;
  URL.createObjectURL ??= () => `blob:test/${++n}`;
  URL.revokeObjectURL ??= () => {};
});

function Harness() {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <>
      <PhotoPicker files={files} onChange={setFiles} />
      <output data-testid="names">{files.map((f) => f.name).join(",")}</output>
    </>
  );
}

const image = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const names = () => screen.getByTestId("names").textContent;

describe("PhotoPicker", () => {
  it("adds photos from the camera and the library, ignoring non-images", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("photo-library-input"), {
      target: { files: [image("a.jpg"), new File(["x"], "notes.pdf", { type: "application/pdf" })] },
    });
    fireEvent.change(screen.getByTestId("photo-camera-input"), { target: { files: [image("b.jpg")] } });
    expect(names()).toBe("a.jpg,b.jpg");
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  it("removes a photo", () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId("photo-library-input"), {
      target: { files: [image("a.jpg"), image("b.jpg")] },
    });
    fireEvent.click(screen.getByLabelText("Remove a.jpg"));
    expect(names()).toBe("b.jpg");
  });
});
