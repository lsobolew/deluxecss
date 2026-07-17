import { describe, expect, it } from "vitest";
import { buildIndexedImage } from "../src/palette.js";
import { resolveOptions } from "../src/index.js";
import type { DecodedImage } from "../src/types.js";

/** Build a DecodedImage from an array of [r,g,b,a] pixels laid out row-major. */
function image(pixels: number[][], width: number, height: number): DecodedImage {
  return { width, height, data: Uint8Array.from(pixels.flat()) };
}

describe("buildIndexedImage — alpha & palette", () => {
  it("maps fully transparent pixels to a `transparent` slot", () => {
    const img = image(
      [
        [255, 0, 0, 255],
        [0, 0, 0, 0],
      ],
      2,
      1,
    );
    const res = buildIndexedImage(img, resolveOptions());
    expect(res.colors).toContain("#ff0000");
    expect(res.colors).toContain("transparent");
    expect(res.hasAlpha).toBe(true);
    // pixel 1 points at the transparent slot
    const tIdx = res.colors.indexOf("transparent");
    expect(res.indices[1]).toBe(tIdx);
  });

  it("respects alphaThreshold in binary mode (127 transparent, 128 opaque)", () => {
    const img = image(
      [
        [10, 20, 30, 127],
        [10, 20, 30, 128],
      ],
      2,
      1,
    );
    const res = buildIndexedImage(img, resolveOptions({ alphaThreshold: 128 }));
    const tIdx = res.colors.indexOf("transparent");
    expect(res.indices[0]).toBe(tIdx); // 127 < 128 → transparent
    expect(res.indices[1]).not.toBe(tIdx); // 128 >= 128 → opaque
  });

  it("keeps per-pixel alpha as rgba() in keep mode", () => {
    const img = image([[10, 20, 30, 128]], 1, 1);
    const res = buildIndexedImage(img, resolveOptions({ alphaMode: "keep" }));
    expect(res.colors[0]).toMatch(/^rgba\(10, 20, 30, /);
    expect(res.hasAlpha).toBe(true);
  });

  it("builds a raw palette of unique colors (no quantization)", () => {
    const img = image(
      [
        [1, 1, 1, 255],
        [1, 1, 1, 255],
        [2, 2, 2, 255],
      ],
      3,
      1,
    );
    const res = buildIndexedImage(img, resolveOptions({ colorFormat: "rgb" }));
    expect(res.colors).toEqual(["rgb(1, 1, 1)", "rgb(2, 2, 2)"]);
    expect(Array.from(res.indices)).toEqual([0, 0, 1]);
  });
});
