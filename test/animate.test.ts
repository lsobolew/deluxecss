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
      // each stop swaps background-image
      expect((css.match(/% \{ background-image:/g) ?? []).length).toBe(2);
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

  describe("backgroundInKeyframes (folder-9 technique)", () => {
    it("delivers background-image via a held keyframe, not statically", () => {
      const anim = frames(
        [
          [RED, BLUE],
          [BLUE, RED],
        ],
        2,
        1,
      );
      const { css } = convertAnimated(anim, { backgroundInKeyframes: true });
      // no static background-image before the first @keyframes block
      const head = css.split("@keyframes")[0]!;
      expect(head).not.toContain("background-image:");
      // a held bg keyframe + layer promotion, plus palette still cycles
      expect(css).toContain("@keyframes pxc-bg");
      expect(css).toContain("0%, 100%");
      expect(css).toContain("will-change: background-image;");
      expect(css).toMatch(/animation:\s*pxc-bg[^;]*pxc-\d+/);
    });
  });
});
