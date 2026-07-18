import sharp from "sharp";
import type { DecodedFrames, DecodedImage } from "./types.js";

type SharpInput = Parameters<typeof sharp>[0];

/**
 * Decode an image (PNG/JPEG/WebP/GIF/…) into tightly-packed RGBA pixels.
 * Accepts a file path, or an in-memory Buffer/Uint8Array of encoded image bytes.
 * Pass `resize` to downscale to that width (nearest-neighbor, aspect preserved).
 */
export async function decode(
  input: string | Buffer | Uint8Array,
  resize?: number,
): Promise<DecodedImage> {
  let pipeline = sharp(input as SharpInput);
  if (resize) pipeline = pipeline.resize({ width: resize, kernel: "nearest" });

  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    throw new Error(
      `Expected 4 channels after ensureAlpha, got ${info.channels}`,
    );
  }

  return {
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  };
}

/**
 * Decode every frame of an animated image (GIF/WebP/APNG) into RGBA buffers that
 * share one canvas size. Pass `resize` to downscale each frame's width.
 */
export async function decodeFrames(
  input: string | Buffer | Uint8Array,
  resize?: number,
): Promise<DecodedFrames> {
  const meta = await sharp(input as SharpInput, { animated: true }).metadata();
  const pageCount = meta.pages ?? 1;
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.pageHeight ?? meta.height ?? 0;
  const delaysMeta = meta.delay ?? [];

  const width = resize ?? srcWidth;
  const height = resize ? Math.round((resize * srcHeight) / srcWidth) : srcHeight;

  const frames: Uint8Array[] = [];
  const delays: number[] = [];

  for (let page = 0; page < pageCount; page++) {
    let pipeline = sharp(input as SharpInput, { page });
    if (resize) pipeline = pipeline.resize({ width: resize, kernel: "nearest" });
    const { data } = await pipeline
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    delays.push(delaysMeta[page] ?? 100);
  }

  return { width, height, frames, delays };
}

/**
 * Decode several still images as the frames of one animation (e.g. a numbered
 * sprite sequence). All frames must share the same dimensions after optional
 * `resize`. Delays default to `frameDelayMs` each (100ms unless overridden).
 */
export async function decodeFilesToFrames(
  paths: string[],
  resize?: number,
  frameDelayMs = 100,
): Promise<DecodedFrames> {
  if (paths.length === 0) throw new Error("No frame files provided");
  const decoded = await Promise.all(paths.map((p) => decode(p, resize)));
  const { width, height } = decoded[0]!;
  for (let i = 1; i < decoded.length; i++) {
    const d = decoded[i]!;
    if (d.width !== width || d.height !== height) {
      throw new Error(
        `Frame ${i} (${paths[i]}) is ${d.width}x${d.height}, expected ${width}x${height}. ` +
          `All frames must share dimensions — use --resize to normalize widths.`,
      );
    }
  }
  return {
    width,
    height,
    frames: decoded.map((d) => d.data),
    delays: decoded.map(() => frameDelayMs),
  };
}
