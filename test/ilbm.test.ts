import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ilbmToFrames,
  ilbmToImage,
  isIff,
  parseIlbm,
} from "../src/ilbm.js";

const iff = readFileSync(
  fileURLToPath(new URL("../examples/assets/ljl_ArtificialHeart.iff", import.meta.url)),
);

describe("IFF ILBM decoder", () => {
  it("recognizes an IFF container (and rejects other bytes)", () => {
    expect(isIff(iff)).toBe(true);
    expect(isIff(Buffer.from("not an iff file at all"))).toBe(false);
    expect(isIff(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false); // PNG magic
  });

  it("parses BMHD, CMAP and the color-cycling range", () => {
    const img = parseIlbm(iff);
    expect(img.width).toBe(320);
    expect(img.height).toBe(200);
    expect(img.palette.length).toBe(32); // 5 bitplanes
    expect(img.indices.length).toBe(320 * 200);
    // the CCRT range: 7 entries (16..22) cycling forward
    expect(img.cycles.length).toBe(1);
    expect(img.cycles[0]).toMatchObject({ low: 16, high: 22, dir: 1 });
    expect(img.cycles[0]!.stepMs).toBeGreaterThan(0);
  });

  it("renders the base frame as full RGBA", () => {
    const { width, height, data } = ilbmToImage(parseIlbm(iff));
    expect(data.length).toBe(width * height * 4);
    // not a blank image: more than one distinct color present
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    expect(seen.size).toBeGreaterThan(1);
  });

  it("synthesizes one frame per cycle step, and they differ", () => {
    const frames = ilbmToFrames(parseIlbm(iff));
    // range of 7 entries → 7 frames
    expect(frames.frames.length).toBe(7);
    expect(frames.delays.every((d) => d > 0)).toBe(true);
    // consecutive frames are not identical (the cycled pixels moved)
    expect(Buffer.compare(Buffer.from(frames.frames[0]!), Buffer.from(frames.frames[1]!))).not.toBe(0);
    // ...but pixels outside the cycle range are unchanged between frames
    const a = frames.frames[0]!, b = frames.frames[1]!;
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(320 * 200); // only some pixels cycle
  });
});
