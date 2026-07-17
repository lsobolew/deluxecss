import { buildCss } from "./css.js";
import { decode } from "./decode.js";
import { packLayers } from "./layers.js";
import { buildMeta } from "./meta.js";
import { buildIndexedImage } from "./palette.js";
import { buildRowGradients } from "./rle.js";
import type {
  ConvertResult,
  DecodedImage,
  Meta,
  Options,
  ResolvedOptions,
} from "./types.js";

export type {
  ConvertResult,
  DecodedImage,
  IndexedImage,
  Meta,
  Options,
} from "./types.js";
export { decode } from "./decode.js";

const DEFAULTS: ResolvedOptions = {
  maxColors: undefined,
  dither: false,
  alphaThreshold: 128,
  alphaMode: "binary",
  scale: 1,
  sizing: "container",
  layerChunkSize: 50,
  layerElement: "div",
  maxStopsPerLayer: 4000,
  cssVarPrefix: "color",
  selector: ".pixel-image",
  paletteSelector: ":host, .palette",
  colorFormat: "hex",
  emitMeta: true,
  emitHtml: false,
  emitAtProperty: false,
  minify: false,
};

export function resolveOptions(options: Options = {}): ResolvedOptions {
  return { ...DEFAULTS, ...clean(options) };
}

/** Drop `undefined` values so they don't clobber defaults via spread. */
function clean<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

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
  const layers = packLayers(rows, opts.layerChunkSize, opts.maxStopsPerLayer);
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
  const image = await decode(input);
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
