import type { IndexedImage } from "./types.js";

export interface RowGradients {
  /** One `linear-gradient(...)` string per image row. */
  gradients: string[];
  /** Number of color stops emitted for each row (for layer budgeting). */
  stopCounts: number[];
}

/**
 * Run-length-encode each row into a single horizontal gradient.
 *
 * For every pixel we emit a stop only at a run boundary:
 *   - the start of a run (previous pixel differs) → a stop at position `n`
 *   - the end of a run (next pixel differs)       → a stop at position `n + 1`
 * yielding exactly two coincident hard stops per run. Coincident stops mean no
 * interpolation across boundaries — sharp pixel edges, and no fringe when a run
 * borders `transparent`.
 *
 * Comparisons use strict `!==` on integer indices, so palette index 0 (usually
 * the background) is handled correctly — unlike a truthiness check.
 */
export function buildRowGradients(
  image: IndexedImage,
  cssVarPrefix: string,
  colorRef?: (index: number) => string,
): RowGradients {
  const { width, height, indices } = image;
  const gradients: string[] = new Array(height);
  const stopCounts: number[] = new Array(height);

  // How a palette index is referenced in a stop. By default every color is a
  // custom property; callers can override to inline some colors as literals.
  const ref = colorRef ?? ((i: number) => `var(--${cssVarPrefix}-${i})`);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const stops: string[] = [];

    for (let n = 0; n < width; n++) {
      const cur = indices[rowOffset + n]!;
      const prevDiffers = n === 0 || indices[rowOffset + n - 1]! !== cur;
      const nextDiffers =
        n === width - 1 || indices[rowOffset + n + 1]! !== cur;

      if (prevDiffers) {
        stops.push(`${ref(cur)} calc(var(--pixel-width) * ${n})`);
      }
      if (nextDiffers) {
        stops.push(`${ref(cur)} calc(var(--pixel-width) * ${n + 1})`);
      }
    }

    stopCounts[y] = stops.length;
    gradients[y] = `linear-gradient(to right, ${stops.join(", ")})`;
  }

  return { gradients, stopCounts };
}
