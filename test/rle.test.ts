import { describe, expect, it } from "vitest";
import { buildRowGradients } from "../src/rle.js";
import type { IndexedImage } from "../src/types.js";

function img(rows: number[][], colors: string[]): IndexedImage {
  const height = rows.length;
  const width = rows[0]!.length;
  const indices = Int32Array.from(rows.flat());
  return { width, height, colors, indices, hasAlpha: false };
}

describe("buildRowGradients (RLE)", () => {
  it("emits 2 coincident stops for a single flat run", () => {
    const { gradients, stopCounts } = buildRowGradients(
      img([[0, 0, 0]], ["#000"]),
      "color",
    );
    expect(stopCounts[0]).toBe(2);
    expect(gradients[0]).toBe(
      "linear-gradient(to right, var(--color-0) calc(var(--pixel-width) * 0), var(--color-0) calc(var(--pixel-width) * 3))",
    );
  });

  it("emits boundaries for alternating pixels", () => {
    const { stopCounts } = buildRowGradients(img([[0, 1, 0]], ["a", "b"]), "color");
    // start+end for each of the 3 single-pixel runs = 6 stops.
    expect(stopCounts[0]).toBe(6);
  });

  it("handles a single-pixel row", () => {
    const { gradients, stopCounts } = buildRowGradients(img([[5]], []), "color");
    expect(stopCounts[0]).toBe(2);
    expect(gradients[0]).toContain("var(--color-5) calc(var(--pixel-width) * 0)");
    expect(gradients[0]).toContain("var(--color-5) calc(var(--pixel-width) * 1)");
  });

  it("regression: palette index 0 is NOT dropped (truthiness bug)", () => {
    // A run of index 0 bordered by index 1 must still emit its stops.
    const { gradients } = buildRowGradients(
      img([[0, 0, 1, 1]], ["bg", "fg"]),
      "color",
    );
    expect(gradients[0]).toContain("var(--color-0) calc(var(--pixel-width) * 0)");
    expect(gradients[0]).toContain("var(--color-0) calc(var(--pixel-width) * 2)");
    expect(gradients[0]).toContain("var(--color-1) calc(var(--pixel-width) * 2)");
    expect(gradients[0]).toContain("var(--color-1) calc(var(--pixel-width) * 4)");
  });
});
