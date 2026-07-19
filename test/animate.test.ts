import { describe, expect, it } from "vitest";
import { convertAnimated } from "../src/animate.js";
import type { DecodedFrames } from "../src/types.js";

/** Build frames from arrays of [r,g,b,a] pixels (one array per frame). */
function frames(frameList: number[][][], width: number, height: number, delay = 100): DecodedFrames {
  return {
    width,
    height,
    frames: frameList.map((px) => Uint8Array.from(px.flat())),
    delays: frameList.map(() => delay),
  };
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

describe("convertAnimated", () => {
  it("emits @keyframes and an animation list for changing pixels", () => {
    // 2x1, two frames; both pixels swap colors → two animated tracks.
    const anim = frames(
      [
        [RED, BLUE],
        [BLUE, RED],
      ],
      2,
      1,
    );
    const { css, meta } = convertAnimated(anim);
    expect(meta.animation?.frames).toBe(2);
    expect(meta.animation?.animatedSlots).toBe(2);
    expect(css).toContain("@keyframes pxc-");
    expect(css).toMatch(/animation:\s*pxc-\d+/);
    // duration = 2 frames * 100ms = 0.2s
    expect(meta.animation?.duration).toBeCloseTo(0.2);
  });

  it("keeps static pixels out of the animation (0 animated slots)", () => {
    const anim = frames(
      [
        [RED, BLUE],
        [RED, BLUE],
      ],
      2,
      1,
    );
    const { css, meta } = convertAnimated(anim);
    expect(meta.animation?.animatedSlots).toBe(0);
    expect(css).not.toContain("@keyframes");
    expect(css).not.toContain("animation:");
  });

  it("respects a duration override", () => {
    const anim = frames(
      [
        [RED],
        [BLUE],
      ],
      1,
      1,
    );
    const { css, meta } = convertAnimated(anim, { duration: 3 });
    expect(meta.animation?.duration).toBe(3);
    expect(css).toContain("var(--pixel-anim-duration, 3s)");
  });

  it("uses step-end timing (discrete frame switches)", () => {
    const anim = frames([[RED], [BLUE]], 1, 1);
    const { css } = convertAnimated(anim);
    expect(css).toContain("step-end infinite");
  });

  it("supports single-element output (no layer divs)", () => {
    const anim = frames([[RED], [BLUE]], 1, 1);
    const { css, html } = convertAnimated(anim, {
      singleElement: true,
      emitHtml: true,
    });
    // background painted on the container, no child-layer rule
    expect(css).toContain(".pixel-image {");
    expect(css).not.toContain("__layer:nth-child");
    expect(html).toBe('<div class="pixel-image palette"></div>');
  });

  describe("frames mode (background-image swap)", () => {
    it("swaps the whole background-image per frame via one @keyframes", () => {
      const anim = frames(
        [
          [RED, BLUE],
          [BLUE, RED],
        ],
        2,
        1,
      );
      const { css, meta } = convertAnimated(anim, { animationMode: "frames" });
      expect(meta.animation?.mode).toBe("frames");
      expect(meta.animation?.frames).toBe(2);
      // a single keyframes rule, driven with step-end
      expect((css.match(/@keyframes/g) ?? []).length).toBe(1);
      expect(css).toContain("step-end infinite");
      // each stop swaps background-image AND background-position together
      // (position-in-keyframe binds every layer; no static frame-0 workaround)
      expect((css.match(/% \{ background-image:/g) ?? []).length).toBe(2);
      expect(
        (css.match(/background-image:[^}]*background-position:/g) ?? []).length,
      ).toBe(2);
      const beforeKeyframes = css.split("@keyframes")[0]!;
      expect(beforeKeyframes).not.toContain("background-image:");
      // palette stays controllable (colors referenced by var, not literal)
      expect(css).toMatch(/--color-0:/);
      expect(css).toContain("var(--color-");
    });

    it("emits the will-change hint by default, and omits it when disabled", () => {
      const anim = frames([[RED], [BLUE]], 1, 1);
      expect(convertAnimated(anim, { animationMode: "frames" }).css).toContain(
        "will-change: background-image;",
      );
      expect(
        convertAnimated(anim, { animationMode: "frames", willChange: false })
          .css,
      ).not.toContain("will-change");
    });

    it("samples down to maxFrames while preserving loop duration", () => {
      // 4 frames, 100ms each = 0.4s loop; sample to 2 frames.
      const anim = frames([[RED], [BLUE], [RED], [BLUE]], 1, 1);
      const { meta } = convertAnimated(anim, {
        animationMode: "frames",
        maxFrames: 2,
      });
      expect(meta.animation?.frames).toBe(2);
      expect(meta.animation?.duration).toBeCloseTo(0.4);
    });

    it("spreads tall images across multiple layers, one keyframes each", () => {
      // 4 rows tall, chunk 2 → 2 layers; two frames.
      const f0 = [[RED], [RED], [BLUE], [BLUE]].flat().map((c) => c);
      const rowsA = [[RED], [BLUE], [RED], [BLUE]];
      const rowsB = [[BLUE], [RED], [BLUE], [RED]];
      const anim: DecodedFrames = {
        width: 1,
        height: 4,
        frames: [
          Uint8Array.from(rowsA.flat().flat()),
          Uint8Array.from(rowsB.flat().flat()),
        ],
        delays: [100, 100],
      };
      void f0;
      const { css, meta } = convertAnimated(anim, {
        animationMode: "frames",
        layerChunkSize: 2,
      });
      expect(meta.layerCount).toBe(2);
      // one keyframes rule per layer
      expect((css.match(/@keyframes pxc-frames-\d+/g) ?? []).length).toBe(2);
      expect(css).toContain(":nth-child(1)");
      expect(css).toContain(":nth-child(2)");
    });
  });

  describe("overlay mode (static base + animated overlay)", () => {
    it("cuts changing pixels from the base and animates them in an overlay", () => {
      // pixel 0 constant RED (→ base), pixel 1 GREEN→BLUE (→ overlay).
      const GREEN = [0, 255, 0, 255];
      const anim = frames(
        [
          [RED, GREEN],
          [RED, BLUE],
        ],
        2,
        1,
      );
      const { css, meta } = convertAnimated(anim, { animationMode: "overlay" });
      expect(meta.animation?.mode).toBe("overlay");
      // static base painted on the element, with a transparent cut-out slot
      const head = css.split("@keyframes")[0]!;
      expect(head).toContain("background-image:");
      expect(css).toContain("transparent");
      // one overlay layer, frame-swapped
      expect(css).toContain("@keyframes pxc-overlay");
      expect(css).toMatch(/animation: pxc-overlay/);
      expect((css.match(/% \{ background-image:/g) ?? []).length).toBe(2);
      // overlay has a static frame-0 background too (reduced-motion fallback)
      expect(css).toMatch(/__layer \{[\s\S]*background-image:/);
    });
  });

  describe("backgroundInKeyframes (folder-9 technique)", () => {
    it("single element: shares one animation list with the palette tracks", () => {
      const anim = frames(
        [
          [RED, BLUE],
          [BLUE, RED],
        ],
        2,
        1,
      );
      const { css } = convertAnimated(anim, {
        backgroundInKeyframes: true,
        singleElement: true,
      });
      // no static background-image before the first @keyframes block
      const head = css.split("@keyframes")[0]!;
      expect(head).not.toContain("background-image:");
      expect(css).toContain("@keyframes pxc-bg");
      expect(css).toContain("0%, 100%");
      expect(css).toContain("will-change: background-image;");
      // pxc-bg and the palette tracks share the single element's animation list
      expect(css).toMatch(/animation:\s*pxc-bg[^;]*pxc-\d+/);
    });

    it("inlineStaticColors keeps only animating colors as variables", () => {
      // pixel 0 is always RED (static → inline), pixel 1 GREEN→BLUE (animated → var).
      const GREEN = [0, 255, 0, 255];
      const anim = frames(
        [
          [RED, GREEN],
          [RED, BLUE],
        ],
        2,
        1,
      );
      const plain = convertAnimated(anim);
      const inlined = convertAnimated(anim, { inlineStaticColors: true });
      const refCount = (css: string) =>
        (css.match(/var\(--color-\d+\)/g) ?? []).length;
      // far fewer var() references once the static color is inlined
      expect(refCount(inlined.css)).toBeLessThan(refCount(plain.css));
      // the constant red is now a literal in the gradient
      expect(inlined.css).toContain("#ff0000");
      // an animating color is still a variable (so it can be keyframed)
      expect(inlined.css).toMatch(/var\(--color-\d+\)/);
    });

    it("layered: each layer animates its own held background", () => {
      // 4 rows tall, chunk 2 → 2 layers; palette cycles on the container.
      const anim: DecodedFrames = {
        width: 1,
        height: 4,
        frames: [
          Uint8Array.from([[RED], [RED], [BLUE], [BLUE]].flat().flat()),
          Uint8Array.from([[BLUE], [BLUE], [RED], [RED]].flat().flat()),
        ],
        delays: [100, 100],
      };
      const { css } = convertAnimated(anim, {
        backgroundInKeyframes: true,
        layerChunkSize: 2,
      });
      // per-layer held background keyframes, targeted at the layer children
      expect(css).toContain("@keyframes pxc-bg-0");
      expect(css).toContain("@keyframes pxc-bg-1");
      expect(css).toMatch(/\.pixel-image__layer:nth-child\(1\)[^}]*animation: pxc-bg-0/);
      expect(css).toContain("will-change: background-image;");
      // no static background-image anywhere (all delivered via keyframes)
      const head = css.split("@keyframes")[0]!;
      expect(head).not.toContain("background-image:");
    });
  });
});
