import sharp from "sharp";
import type { DecodedImage } from "./types.js";

/**
 * Decode an image (PNG/JPEG/WebP/GIF/…) into tightly-packed RGBA pixels.
 * Accepts a file path, or an in-memory Buffer/Uint8Array of encoded image bytes.
 */
export async function decode(
  input: string | Buffer | Uint8Array,
): Promise<DecodedImage> {
  const pipeline = sharp(input as Parameters<typeof sharp>[0]);
  const { data, info } = await pipeline
    .ensureAlpha() // guarantee 4 channels regardless of source
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
