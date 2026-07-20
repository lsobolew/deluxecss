import { quantize } from "./quantize.js";
import type { DecodedImage, IndexedImage, ResolvedOptions } from "./types.js";

const TRANSPARENT = "transparent";

/**
 * Turn decoded RGBA pixels into a palette of CSS color strings plus a per-pixel
 * index buffer, applying transparency handling and (optionally) quantization.
 *
 * When `maxColors` is set, colors are clustered on RGB and alpha is treated as
 * binary (a dedicated `transparent` slot); the `keep` alpha mode only applies to
 * the raw (un-quantized) palette.
 */
export function buildIndexedImage(
  image: DecodedImage,
  opts: ResolvedOptions,
): IndexedImage {
  const { width, height, data } = image;
  const { alphaThreshold, alphaMode, colorFormat, maxColors } = opts;

  const pixelCount = width * height;

  if (maxColors !== undefined) {
    return quantizedImage(image, opts);
  }

  // ---- Raw palette (every unique color) ----
  const colors: string[] = [];
  const keyToIndex = new Map<number, number>();
  const indices = new Int32Array(pixelCount);
  let transparentIndex = -1;
  let hasAlpha = false;

  const slotFor = (key: number, value: string): number => {
    let idx = keyToIndex.get(key);
    if (idx === undefined) {
      idx = colors.length;
      colors.push(value);
      keyToIndex.set(key, idx);
    }
    return idx;
  };

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;

    const isTransparent =
      a === 0 || (alphaMode === "binary" && a < alphaThreshold);

    if (isTransparent) {
      hasAlpha = true;
      if (transparentIndex === -1) {
        transparentIndex = colors.length;
        colors.push(TRANSPARENT);
      }
      indices[p] = transparentIndex;
      continue;
    }

    if (alphaMode === "keep" && a < 255) {
      hasAlpha = true;
      const key = (((a << 24) | (r << 16) | (g << 8) | b) >>> 0) + 1; // +1 to avoid colliding with rgb keys
      indices[p] = slotFor(key, formatRgba(r, g, b, a));
    } else {
      const key = (r << 16) | (g << 8) | b;
      indices[p] = slotFor(key, formatColor(r, g, b, colorFormat));
    }
  }

  return { width, height, colors, indices, hasAlpha };
}

function quantizedImage(
  image: DecodedImage,
  opts: ResolvedOptions,
): IndexedImage {
  const { width, height, data } = image;
  const { alphaThreshold, colorFormat } = opts;
  const pixelCount = width * height;

  const { palette, indices: rgbIndices } = quantize(
    data,
    width,
    height,
    opts.maxColors!,
  );

  const colors = palette.map(([r, g, b]) =>
    formatColor(r, g, b, colorFormat),
  );
  const indices = Int32Array.from(rgbIndices);

  let transparentIndex = -1;
  let hasAlpha = false;
  for (let p = 0, i = 3; p < pixelCount; p++, i += 4) {
    const a = data[i]!;
    if (a === 0 || a < alphaThreshold) {
      hasAlpha = true;
      if (transparentIndex === -1) {
        transparentIndex = colors.length;
        colors.push(TRANSPARENT);
      }
      indices[p] = transparentIndex;
    }
  }

  return { width, height, colors, indices, hasAlpha };
}

function formatColor(
  r: number,
  g: number,
  b: number,
  format: "hex" | "rgb",
): string {
  if (format === "rgb") return `rgb(${r}, ${g}, ${b})`;
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

function formatRgba(r: number, g: number, b: number, a: number): string {
  const alpha = Math.round((a / 255) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, "0");
}
