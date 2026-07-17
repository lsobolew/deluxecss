import type { Layer } from "./layers.js";
import type { IndexedImage, Meta, ResolvedOptions } from "./types.js";

export function buildMeta(
  image: IndexedImage,
  layers: Layer[],
  opts: ResolvedOptions,
  layerClass: string,
): Meta {
  return {
    width: image.width,
    height: image.height,
    colors: image.colors,
    layerCount: layers.length,
    chunkSize: opts.layerChunkSize,
    scale: opts.scale,
    cssVarPrefix: opts.cssVarPrefix,
    selector: opts.selector,
    layerClass,
    hasAlpha: image.hasAlpha,
  };
}
