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
});
