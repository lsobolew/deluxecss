import { describe, expect, it } from "vitest";
import { convert } from "../src/index.js";
import type { DecodedImage } from "../src/types.js";

// 2x2 with four distinct colors.
const four: DecodedImage = {
  width: 2,
  height: 2,
  data: Uint8Array.from([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255,
  ]),
};

describe("quantization (maxColors)", () => {
  it("reduces the palette to at most maxColors", () => {
    const { meta } = convert(four, { maxColors: 2 });
    expect(meta.colors.length).toBeLessThanOrEqual(2);
    expect(meta.colors.length).toBeGreaterThan(0);
  });

  it("is deterministic (Wu) — same input yields the same palette", () => {
    const a = convert(four, { maxColors: 3 });
    const b = convert(four, { maxColors: 3 });
    expect(a.meta.colors).toEqual(b.meta.colors);
    expect(Array.from(a.meta.colors)).toEqual(Array.from(b.meta.colors));
  });

  it("every pixel maps to a valid palette index", () => {
    const { css, meta } = convert(four, { maxColors: 2 });
    const maxIdx = meta.colors.length - 1;
    const used = [...css.matchAll(/var\(--color-(\d+)\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(used.every((i) => i >= 0 && i <= maxIdx)).toBe(true);
  });
});
