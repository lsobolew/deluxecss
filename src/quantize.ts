import { buildPaletteSync, utils } from "image-q";

export type RGB = readonly [number, number, number];

export interface QuantizeResult {
  /** The reduced palette as RGB triples. */
  palette: RGB[];
  /** Palette index for every pixel (row-major, one entry per pixel). */
  indices: Int32Array;
}

/**
 * Reduce an image to at most `maxColors` colors using Wu quantization
 * (deterministic median-cut variant), then map every pixel to its palette slot.
 *
 * Transparency is handled by the caller: pixels are passed here with alpha
 * forced opaque so quantization operates purely on RGB, and transparent pixels
 * are re-pointed to their own slot afterwards.
 */
export function quantize(
  data: Uint8Array,
  width: number,
  height: number,
  maxColors: number,
): QuantizeResult {
  // Work on an RGB-only copy (alpha forced to 255) so quantization ignores alpha.
  const rgbOpaque = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    rgbOpaque[i] = data[i]!;
    rgbOpaque[i + 1] = data[i + 1]!;
    rgbOpaque[i + 2] = data[i + 2]!;
    rgbOpaque[i + 3] = 255;
  }

  const container = utils.PointContainer.fromUint8Array(
    rgbOpaque,
    width,
    height,
  );

  const iqPalette = buildPaletteSync([container], {
    colorDistanceFormula: "euclidean",
    paletteQuantization: "wuquant",
    colors: Math.max(1, Math.floor(maxColors)),
  });

  const palettePoints = iqPalette.getPointContainer().getPointArray();
  const palette: RGB[] = palettePoints.map((p) => [p.r, p.g, p.b] as const);

  const indices = new Int32Array(width * height);

  // Nearest-color mapping (squared Euclidean), with a per-color cache.
  const cache = new Map<number, number>();
  for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = rgbKey(r, g, b);
    let idx = cache.get(key);
    if (idx === undefined) {
      idx = nearest(palette, r, g, b);
      cache.set(key, idx);
    }
    indices[p] = idx;
  }

  return { palette, indices };
}

function rgbKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

function nearest(palette: RGB[], r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i]!;
    const dr = pr - r;
    const dg = pg - g;
    const db = pb - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}
