import { buildCss } from "./css.js";
import { decode } from "./decode.js";
import { packLayers } from "./layers.js";
import { buildMeta } from "./meta.js";
import { resolveOptions } from "./options.js";
import { buildIndexedImage } from "./palette.js";
import { buildRowGradients } from "./rle.js";
import type { ConvertResult, DecodedImage, Meta, Options } from "./types.js";

export type {
  ConvertResult,
  DecodedFrames,
  DecodedImage,
  IndexedImage,
  Meta,
  Options,
} from "./types.js";
export { decode, decodeFrames } from "./decode.js";
export { resolveOptions } from "./options.js";
export { convertAnimated, animateImageToCss } from "./animate.js";

/**
 * Convert an already-decoded RGBA image to CSS. Synchronous and dependency-free
 * at call time (no `sharp`), which makes it convenient for tests and browsers.
 */
export function convert(
  image: DecodedImage,
  options: Options = {},
): ConvertResult {
  if (image.width < 1 || image.height < 1) {
    throw new Error("Image must have non-zero width and height");
  }
  const opts = resolveOptions(options);

  const indexed = buildIndexedImage(image, opts);
  const rows = buildRowGradients(indexed, opts.cssVarPrefix);
  const chunk = opts.singleElement ? Infinity : opts.layerChunkSize;
  const stopBudget = opts.singleElement ? Infinity : opts.maxStopsPerLayer;
  const layers = packLayers(rows, chunk, stopBudget);
  const { css, layerClass } = buildCss(indexed, layers, opts);
  const meta = buildMeta(indexed, layers, opts, layerClass);

  const result: ConvertResult = { css, meta };
  if (opts.emitHtml) {
    result.html = buildHtml(meta, opts.selector, layerClass);
  }
  return result;
}

/**
 * Decode an image from disk/memory and convert it to CSS pixel-art with a
 * controllable color palette.
 */
export async function imageToCss(
  input: string | Buffer | Uint8Array,
  options: Options = {},
): Promise<ConvertResult> {
  const image = await decode(input, options.resize);
  return convert(image, options);
}

function buildHtml(meta: Meta, selector: string, layerClass: string): string {
  const baseClass = selector.startsWith(".") ? selector.slice(1) : selector;
  const layers = Array.from(
    { length: meta.layerCount },
    () => `  <div class="${layerClass}"></div>`,
  ).join("\n");
  return `<div class="${baseClass} palette">\n${layers}\n</div>`;
}
