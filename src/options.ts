import type { Options, ResolvedOptions } from "./types.js";

export const DEFAULTS: ResolvedOptions = {
  maxColors: undefined,
  dither: false,
  alphaThreshold: 128,
  alphaMode: "binary",
  scale: 1,
  resize: undefined,
  singleElement: false,
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
  animationMode: "palette",
  maxFrames: undefined,
  changeThreshold: 16,
  willChange: true,
  backgroundInKeyframes: false,
  inlineStaticColors: false,
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
