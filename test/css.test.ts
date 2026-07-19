import { describe, expect, it } from "vitest";
import { convert } from "../src/index.js";
import type { DecodedImage } from "../src/types.js";

// 2x2 checkerboard: red / blue / blue / red
const checker: DecodedImage = {
  width: 2,
  height: 2,
  data: Uint8Array.from([
    255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 0, 255,
  ]),
};

describe("convert (full pipeline)", () => {
  it("produces a palette, container, and layer rules", () => {
    const { css, meta } = convert(checker);
    expect(meta.colors).toEqual(["#ff0000", "#0000ff"]);
    expect(meta.layerCount).toBe(1);
    expect(css).toContain("--color-0: #ff0000;");
    expect(css).toContain("--color-1: #0000ff;");
    expect(css).toContain(".pixel-image {");
    expect(css).toContain(".pixel-image > .pixel-image__layer:nth-child(1)");
    expect(css).toContain("aspect-ratio: 2 / 2;");
  });

  it("container mode (default) sizes the grid in cqw/cqh with no scale", () => {
    const { css } = convert(checker); // sizing defaults to "container"
    expect(css).toContain("--pixel-width: calc(100cqw / 2);");
    expect(css).toContain("--pixel-height: calc(100cqh / 2);");
    // no scale factor and no pixel maths anywhere — fully responsive
    expect(css).not.toContain("--scale");
    // width is just an overridable default at native size, capped to the parent
    expect(css).toContain("width: 2px;");
    expect(css).toContain("max-width: 100%;");
  });

  it("inlinePalette emits literal colors and no --color-* palette", () => {
    const { css } = convert(checker, { inlinePalette: true });
    // colors are written straight into the gradients as literals
    expect(css).toContain("#ff0000");
    expect(css).toContain("#0000ff");
    // …and there are no custom properties or palette rule at all
    expect(css).not.toContain("var(--color-");
    expect(css).not.toContain("--color-0:");
    expect(css).not.toContain(".palette {");
    expect(css).not.toContain("@property");
  });

  it("inlinePalette inlines the per-stop unit so the gradients hold no var()", () => {
    // Blink stops substituting past ~50k var() in one value; single-element
    // output must therefore keep var() out of the (huge) background-image value.
    const { css } = convert(checker, { inlinePalette: true });
    expect(css).toContain("calc(100% / 2 *"); // stop unit inlined, width = 2
    expect(css).not.toContain("var(--pixel-width)");
    // every background-image value (the huge one) is free of var()
    for (const m of css.matchAll(/background-image:\s*([^;]*)/g)) {
      expect(m[1]).not.toContain("var(");
    }
  });

  it("honors sizing: percent", () => {
    const { css } = convert(checker, { sizing: "percent" });
    expect(css).toContain("--pixel-width: calc(100% / 2);");
    expect(css).not.toContain("cqw"); // percent mode doesn't use container-query units
  });

  it("emits container-type: size in every sizing mode (size containment)", () => {
    for (const sizing of ["container", "pixel", "percent"] as const) {
      expect(convert(checker, { sizing }).css).toContain("container-type: size;");
    }
  });

  it("emits @property blocks when requested", () => {
    const { css } = convert(checker, { emitAtProperty: true });
    expect(css).toContain("@property --color-0");
    expect(css).toContain('syntax: "<color>";');
  });

  it("splits into multiple layers via layerChunkSize", () => {
    const tall: DecodedImage = {
      width: 1,
      height: 4,
      data: Uint8Array.from([
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      ]),
    };
    const { css, meta } = convert(tall, { layerChunkSize: 2 });
    expect(meta.layerCount).toBe(2);
    expect(css).toContain(":nth-child(2)");
  });

  it("throws for pseudo mode with more than 2 layers", () => {
    const tall: DecodedImage = {
      width: 1,
      height: 6,
      data: Uint8Array.from(new Array(6).fill([0, 0, 0, 255]).flat()),
    };
    expect(() =>
      convert(tall, { layerElement: "pseudo", layerChunkSize: 2 }),
    ).toThrow(/pseudo/);
  });

  it("minifies when requested", () => {
    const { css } = convert(checker, { minify: true });
    expect(css).not.toContain("\n");
    expect(css).toContain("--color-0:#ff0000");
  });

  it("backgroundInKeyframes delivers a static image via a held keyframe", () => {
    const { css } = convert(checker, { backgroundInKeyframes: true });
    const head = css.split("@keyframes")[0]!;
    expect(head).not.toContain("background-image:"); // not static on element
    expect(css).toContain("@keyframes pxc-bg");
    expect(css).toContain("animation: pxc-bg");
    expect(css).toContain("will-change: background-image;");
  });
});
