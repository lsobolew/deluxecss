import { readFileSync } from "node:fs";
import type { DecodedFrames, DecodedImage } from "./types.js";

/**
 * Minimal IFF ILBM / PBM decoder (Amiga "Interleaved BitMap"). Handles BMHD,
 * CMAP, CAMG (EHB), BODY (uncompressed or ByteRun1), and the color-cycling
 * chunks CRNG (DPaint) and CCRT (Graphicraft). No dependencies.
 *
 * The color-cycling chunks are the point: this format encodes palette animation
 * natively — a range of palette entries that rotates over time. We turn each
 * range into synthesized frames so the rest of the pipeline (overlay-palette)
 * can render the exact cycle as pure CSS.
 */

type RGB = [number, number, number];

interface Cycle {
  low: number;
  high: number;
  /** +1 forward, -1 reverse. */
  dir: number;
  /** Milliseconds per one-step rotation. */
  stepMs: number;
}

export interface Ilbm {
  width: number;
  height: number;
  palette: RGB[];
  /** One palette index per pixel (row-major). */
  indices: Uint8Array;
  cycles: Cycle[];
}

const ascii = (b: Buffer, o: number) => b.toString("latin1", o, o + 4);

/** True if the bytes are an IFF ILBM/PBM container. */
export function isIff(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    ascii(buf, 0) === "FORM" &&
    (ascii(buf, 8) === "ILBM" || ascii(buf, 8) === "PBM ")
  );
}

export function toBuffer(input: string | Buffer | Uint8Array): Buffer {
  if (typeof input === "string") return readFileSync(input);
  return Buffer.isBuffer(input) ? input : Buffer.from(input);
}

export function parseIlbm(buf: Buffer): Ilbm {
  const u16 = (o: number) => buf.readUInt16BE(o);
  const u32 = (o: number) => buf.readUInt32BE(o);
  const isPBM = ascii(buf, 8) === "PBM ";

  let bmhd: { w: number; h: number; nPlanes: number; masking: number; compression: number } | undefined;
  let cmap: RGB[] = [];
  let camg = 0;
  let body: Buffer | undefined;
  const cycles: Cycle[] = [];

  let p = 12;
  while (p + 8 <= buf.length) {
    const ck = ascii(buf, p);
    const len = u32(p + 4);
    const d = p + 8;
    if (ck === "BMHD") {
      bmhd = { w: u16(d), h: u16(d + 2), nPlanes: buf[d + 8]!, masking: buf[d + 9]!, compression: buf[d + 10]! };
    } else if (ck === "CMAP") {
      cmap = [];
      for (let i = 0; i + 2 < len; i += 3) cmap.push([buf[d + i]!, buf[d + i + 1]!, buf[d + i + 2]!]);
    } else if (ck === "CAMG") {
      camg = u32(d);
    } else if (ck === "CRNG") {
      // rate: 16384 == 60 steps/s (one advance per 1/60 s); flags bit0 = active, bit1 = reverse.
      const rate = u16(d + 2);
      const flags = u16(d + 4);
      const low = buf[d + 6]!;
      const high = buf[d + 7]!;
      if (flags & 1 && rate > 0 && high > low) {
        const stepsPerSec = (rate / 16384) * 60;
        cycles.push({ low, high, dir: flags & 2 ? -1 : 1, stepMs: 1000 / stepsPerSec });
      }
    } else if (ck === "CCRT") {
      // direction: 1 fwd, -1 back, 0 none; time per step = sec + usec/1e6.
      const dir = buf.readInt16BE(d);
      const low = buf[d + 2]!;
      const high = buf[d + 3]!;
      const sec = u32(d + 4);
      const usec = u32(d + 8);
      const stepMs = sec * 1000 + usec / 1000;
      if (dir !== 0 && high > low && stepMs > 0) {
        cycles.push({ low, high, dir: dir > 0 ? 1 : -1, stepMs });
      }
    } else if (ck === "BODY") {
      body = buf.subarray(d, d + len);
    }
    p = d + len + (len & 1); // chunks are word-aligned
  }

  if (!bmhd) throw new Error("IFF: missing BMHD chunk");
  if (!body) throw new Error("IFF: missing BODY chunk");

  // Extra-Half-Brite: entries 32..63 are half-brightness of 0..31.
  if (camg & 0x0080) {
    const half = cmap.slice(0, 32).map(([r, g, b]) => [r >> 1, g >> 1, b >> 1] as RGB);
    cmap = [...cmap.slice(0, 32), ...half];
  }
  if (camg & 0x0800) {
    throw new Error("IFF: HAM images are not supported");
  }

  const { w, h, nPlanes, masking, compression } = bmhd;
  const indices = new Uint8Array(w * h);

  if (isPBM) {
    // Chunky: one byte per pixel, rows padded to even width.
    const rowBytes = w + (w & 1);
    const readRow = decompressor(body, compression, rowBytes);
    for (let y = 0; y < h; y++) {
      const row = readRow();
      for (let x = 0; x < w; x++) indices[y * w + x] = row[x]!;
    }
  } else {
    // Planar: nPlanes bitplanes per row (+ 1 mask plane if masking===1).
    const rowBytes = ((w + 15) >> 4) << 1;
    const planesPerRow = nPlanes + (masking === 1 ? 1 : 0);
    const readRow = decompressor(body, compression, rowBytes);
    for (let y = 0; y < h; y++) {
      const rows: Uint8Array[] = [];
      for (let pl = 0; pl < planesPerRow; pl++) rows.push(readRow());
      for (let x = 0; x < w; x++) {
        let val = 0;
        const byte = x >> 3;
        const bit = 7 - (x & 7);
        for (let pl = 0; pl < nPlanes; pl++) {
          val |= ((rows[pl]![byte]! >> bit) & 1) << pl;
        }
        indices[y * w + x] = val;
      }
    }
  }

  if (cmap.length === 0) {
    // No palette: synthesize greyscale ramp across the used bit depth.
    const n = 1 << nPlanes;
    for (let i = 0; i < n; i++) {
      const v = Math.round((i / (n - 1)) * 255);
      cmap.push([v, v, v]);
    }
  }

  return { width: w, height: h, palette: cmap, indices, cycles };
}

/** A row reader that decodes uncompressed (0) or ByteRun1/PackBits (1) rows. */
function decompressor(body: Buffer, compression: number, rowBytes: number): () => Uint8Array {
  let bp = 0;
  return () => {
    const out = new Uint8Array(rowBytes);
    if (compression === 0) {
      for (let i = 0; i < rowBytes; i++) out[i] = body[bp++]!;
      return out;
    }
    let o = 0;
    while (o < rowBytes) {
      const n = body[bp++]!;
      if (n < 128) {
        for (let i = 0; i <= n; i++) out[o++] = body[bp++]!;
      } else if (n > 128) {
        const v = body[bp++]!;
        for (let i = 0; i < 257 - n; i++) out[o++] = v;
      }
      // n === 128 is a no-op
    }
    return out;
  };
}

/** Render the ILBM's base (un-cycled) frame as RGBA. */
export function ilbmToImage(ilbm: Ilbm): DecodedImage {
  const { width, height, palette, indices } = ilbm;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < indices.length; i++) {
    const c = palette[indices[i]!] ?? [0, 0, 0];
    data[i * 4] = c[0];
    data[i * 4 + 1] = c[1];
    data[i * 4 + 2] = c[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/**
 * Turn the file's color-cycling ranges into animation frames: each frame is the
 * image with the active ranges rotated to their state at that moment. Pixels
 * whose palette index falls in a cycling range change color frame-to-frame;
 * everything else is identical — exactly what `overlay-palette` wants. Returns a
 * single static frame if the file has no active cycles.
 */
export function ilbmToFrames(ilbm: Ilbm, maxFrames = 64): DecodedFrames {
  const { width, height, palette, indices, cycles } = ilbm;
  const active = cycles.filter((c) => c.dir !== 0 && c.high > c.low);
  if (active.length === 0) {
    const { data } = ilbmToImage(ilbm);
    return { width, height, frames: [data], delays: [100] };
  }

  // A common time step; each range's period (in steps) is its size. Express each
  // range's loop length in base-steps and take the LCM for the whole animation.
  const baseStep = Math.min(...active.map((c) => c.stepMs));
  const periodFrames = active.map((c) =>
    Math.max(1, Math.round((c.high - c.low + 1) * (c.stepMs / baseStep))),
  );
  let N = periodFrames.reduce((a, b) => (a * b) / gcd(a, b), 1);
  N = Math.max(2, Math.min(N, maxFrames));

  const frames: Uint8Array[] = [];
  for (let f = 0; f < N; f++) {
    // Rotated palette for this frame.
    const pal = palette.slice();
    for (const c of active) {
      const size = c.high - c.low + 1;
      const steps = Math.round((f * baseStep) / c.stepMs);
      const shift = ((steps * c.dir) % size + size) % size;
      for (let j = 0; j < size; j++) {
        pal[c.low + j] = palette[c.low + ((j + shift) % size)]!;
      }
    }
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < indices.length; i++) {
      const col = pal[indices[i]!] ?? [0, 0, 0];
      data[i * 4] = col[0];
      data[i * 4 + 1] = col[1];
      data[i * 4 + 2] = col[2];
      data[i * 4 + 3] = 255;
    }
    frames.push(data);
  }
  return { width, height, frames, delays: frames.map(() => Math.round(baseStep)) };
}

/** Human-readable summary of the cycles (for CLI logging). */
export function describeCycles(ilbm: Ilbm): string {
  if (ilbm.cycles.length === 0) return "no color-cycling ranges";
  return ilbm.cycles
    .map((c) => `#${c.low}-${c.high} ${c.dir > 0 ? "→" : "←"} ${Math.round(c.stepMs)}ms/step`)
    .join(", ");
}
