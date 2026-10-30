/**
 * Hatch fill pattern generation for MapLibre addImage().
 * Creates SDF-free ImageData objects for use as fill-pattern.
 * Mirrors the createHatchPatternImageData function from the old map.js.
 */

export type HatchStyle =
  | "none"
  | "diag-forward"
  | "diag-backward"
  | "vertical"
  | "horizontal"
  | "cross"
  | "diag-cross"
  | "dots-small"
  | "dots-large"
  | "stipple"
  | "stars";

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r || 0, g || 0, b || 0];
}

/**
 * Create a hatch-pattern ImageData suitable for MapLibre's map.addImage().
 *
 * @param style   - One of the HatchStyle values
 * @param color   - Hex color for the hatch strokes/dots
 * @param scale   - Scale multiplier (0.5–3)
 * @returns       - ImageData object (width × height × 4 bytes)
 */
export function createHatchPatternImageData(
  style: HatchStyle,
  color: string,
  scale: number
): { width: number; height: number; data: Uint8Array } {
  const size = Math.max(16, Math.min(128, Math.round(16 * scale)));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const [r, g, b] = hexToRgb(color);

  const setPixel = (data: Uint8ClampedArray, x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (Math.round(y) * size + Math.round(x)) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };

  void 0; // (drawLine helper retained for future use)
  const drawLine = (_ctx: CanvasRenderingContext2D) => {
    const lw = Math.max(1, scale * 1.2);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
  };
  void drawLine;

  switch (style) {
    case "diag-forward": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale);
      for (let i = -size; i < size * 2; i += Math.max(4, size / 3)) {
        ctx.beginPath();
        ctx.moveTo(i, size);
        ctx.lineTo(i + size, 0);
        ctx.stroke();
      }
      break;
    }
    case "diag-backward": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale);
      for (let i = -size; i < size * 2; i += Math.max(4, size / 3)) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
        ctx.stroke();
      }
      break;
    }
    case "vertical": {
      const gap = Math.max(4, size / 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale);
      for (let x = 0; x < size; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }
      break;
    }
    case "horizontal": {
      const gap = Math.max(4, size / 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale);
      for (let y = 0; y < size; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      break;
    }
    case "cross": {
      const gap = Math.max(4, size / 4);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale);
      for (let x = 0; x < size; x += gap) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, size);
        ctx.stroke();
      }
      for (let y = 0; y < size; y += gap) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(size, y);
        ctx.stroke();
      }
      break;
    }
    case "diag-cross": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale);
      const step = Math.max(4, size / 3);
      for (let i = -size; i < size * 2; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, size);
        ctx.lineTo(i + size, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + size, size);
        ctx.stroke();
      }
      break;
    }
    case "dots-small": {
      const imgData = ctx.getImageData(0, 0, size, size);
      const gap = Math.max(4, size / 4);
      for (let y = gap / 2; y < size; y += gap) {
        for (let x = gap / 2; x < size; x += gap) {
          setPixel(imgData.data, x, y);
          setPixel(imgData.data, x + 1, y);
          setPixel(imgData.data, x, y + 1);
        }
      }
      ctx.putImageData(imgData, 0, 0);
      break;
    }
    case "dots-large": {
      ctx.fillStyle = color;
      const gap = Math.max(6, size / 3);
      const radius = Math.max(1.5, gap * 0.25);
      for (let y = gap / 2; y < size; y += gap) {
        for (let x = gap / 2; x < size; x += gap) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "stipple": {
      const imgData = ctx.getImageData(0, 0, size, size);
      const density = Math.max(4, size / 5);
      for (let y = 0; y < size; y += density) {
        for (let x = 0; x < size; x += density) {
          if ((x + y) % (density * 2) < density) {
            setPixel(imgData.data, x + density / 4, y + density / 4);
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      break;
    }
    case "stars": {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, scale * 0.8);
      const gap = Math.max(8, size / 2);
      for (let cy = gap / 2; cy < size; cy += gap) {
        for (let cx = gap / 2; cx < size; cx += gap) {
          const r2 = gap * 0.3;
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + r2 * Math.cos(angle), cy + r2 * Math.sin(angle));
            ctx.stroke();
          }
        }
      }
      break;
    }
    default:
      break;
  }

  const imgData = ctx.getImageData(0, 0, size, size);
  return {
    width: size,
    height: size,
    data: new Uint8Array(imgData.data.buffer),
  };
}

/** Normalise a hatch style value – returns "none" for unknown values. */
export function normalizeHatchStyle(value: unknown): HatchStyle {
  const VALID: HatchStyle[] = [
    "none",
    "diag-forward",
    "diag-backward",
    "vertical",
    "horizontal",
    "cross",
    "diag-cross",
    "dots-small",
    "dots-large",
    "stipple",
    "stars",
  ];
  const s = String(value || "none") as HatchStyle;
  return VALID.includes(s) ? s : "none";
}
