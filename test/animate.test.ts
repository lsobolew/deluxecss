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
  });
});
