/** Options controlling how an image is converted to CSS. All are optional. */
export interface Options {
  /**
   * Reduce the image to at most this many colors (median-cut/Wu quantization).
   * Omit for a raw palette built from every unique color in the source — best
   * for true pixel art with a small palette.
   */
  maxColors?: number;

  /**
   * Error-diffusion dithering applied during quantization. Off by default:
   * dithering scatters isolated pixels, which destroys flat runs and can grow
   * the CSS several-fold. Only meaningful when `maxColors` is set.
   */
  dither?: false | "floyd-steinberg" | "atkinson";

  /** Alpha value (0-255) below which a pixel is treated as transparent. Default 128. */
  alphaThreshold?: number;

  /**
   * `binary` (default): pixels are either fully opaque (alpha discarded) or
   * fully transparent (a dedicated `transparent` palette slot). `keep`: preserve
   * per-pixel alpha as `rgba(...)` — multiplies palette size, use with care.
   */
  alphaMode?: "binary" | "keep";

  /** Zoom multiplier written into the `--scale` custom property. Default 1. */
  scale?: number;

  /**
   * How the paint surface is sized.
   * - `container` (default): container queries (`cqw`/`cqh`) — crisp and responsive,
   *   but the host element must have an explicit size.
   * - `percent`: `calc(100% / W)` — widest support, works without a sized container.
   * - `pixel`: integer pixel units — crispest, no sub-pixel seams, not fluid.
   */
  sizing?: "container" | "percent" | "pixel";

  /** Rows of the image packed into a single background layer element. Default 50. */
  layerChunkSize?: number;

  /**
   * Element used to stack background layers.
   * - `div` (default): real child `<div>`s in a grid overlay — scales to any layer count.
   * - `pseudo`: `::before`/`::after` — childless, but limited to 2 layers.
   */
  layerElement?: "div" | "pseudo";

  /** Secondary guard: split a layer further if its color-stop count would exceed this. Default 4000. */
  maxStopsPerLayer?: number;

  /** Prefix for palette custom properties. Default `color` → `--color-0`. */
  cssVarPrefix?: string;

  /**
   * Downscale the source to this width (preserving aspect ratio, nearest-neighbor)
   * before converting. Recommended for large or animated images — the CSS grows
   * with pixel count. Omit to keep the original resolution.
   */
  resize?: number;

  /**
   * Paint the whole image onto the container element itself instead of child
   * layer `<div>`s. Only valid when the image fits in a single layer; lets you
   * render with just one element and no custom component. Default false.
   */
  singleElement?: boolean;

  /** Class selector for the image container. Default `.pixel-image`. */
  selector?: string;

  /** Selector(s) that carry the palette custom properties. Default `:host, .palette`. */
  paletteSelector?: string;

  /** Format used for palette color values. Default `hex`. */
  colorFormat?: "hex" | "rgb";

  /** Emit a `Meta` object describing the result. Default true. */
  emitMeta?: boolean;

  /** Also emit a self-contained HTML fragment demonstrating the image. Default false. */
  emitHtml?: boolean;

  /**
   * Register palette variables with `@property { syntax: '<color>' }` so their
   * values can be smoothly transitioned/animated. Default false.
   */
  emitAtProperty?: boolean;

  /** Strip insignificant whitespace from the emitted CSS. Default false. */
  minify?: boolean;

  /**
   * Animation only: total loop duration in seconds. Omit to derive it from the
   * source frame delays.
   */
  duration?: number;

  /**
   * Animation only: how the animation is expressed in CSS.
   * - `palette` (default): animate the `--color-*` custom properties. The pixel
   *   layout is fixed and only color *values* cycle — ideal for color-cycling
   *   art (water, fire, neon). Compact, but recolors continuously on the CPU.
   * - `frames`: swap the whole `background-image` per frame inside `@keyframes`.
   *   Works for *any* animation (pixels may move), and because each frame is a
   *   fixed background value the browser rasterizes it once and caches it — with
   *   the element promoted to its own compositing layer (`will-change`), playback
   *   is offloaded from the main paint path. Larger CSS.
   */
  animationMode?: "palette" | "frames";

  /**
   * Animation only: sample the source down to at most this many frames (evenly
   * spaced). Useful for `frames` mode, where CSS size scales with frame count.
   */
  maxFrames?: number;

  /**
   * Animation only (`frames` mode): emit a `will-change: background-image` hint
   * to promote the element to its own compositing layer. Default true.
   */
  willChange?: boolean;

  /**
   * Deliver the `background-image` from inside a held `@keyframes` rule
   * (`0%,100%`) driven by an animation, instead of as a static property. This
   * promotes the element to its own compositing layer even for a still image,
   * and composes with palette animation (the background layout is held while
   * `--color-*` cycle). Works for a single element and, per layer, for a stack
   * of `<div>` layers (so it scales to full-resolution images). Default false.
   */
  backgroundInKeyframes?: boolean;
}

/** Fully-resolved options with every default applied. */
export type ResolvedOptions = Required<
  Omit<
    Options,
    "maxColors" | "emitHtml" | "resize" | "duration" | "maxFrames"
  >
> & {
  maxColors: number | undefined;
  resize: number | undefined;
  maxFrames: number | undefined;
  emitHtml: boolean;
};

/** Metadata describing a conversion result — consumed by the `<pixel-image>` widget. */
export interface Meta {
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Palette color values, indexed by `--<prefix>-<i>`. */
  colors: string[];
  /** Number of stacked background layer elements the CSS expects. */
  layerCount: number;
  /** Rows packed into each layer. */
  chunkSize: number;
  /** The `--scale` value baked into the CSS. */
  scale: number;
  /** Prefix used for palette custom properties (e.g. `color`). */
  cssVarPrefix: string;
  /** Class selector for the image container (e.g. `.pixel-image`). */
  selector: string;
  /** Class name applied to each stacked background layer. */
  layerClass: string;
  /** Whether the palette contains a `transparent` slot. */
  hasAlpha: boolean;
  /** Present only for animated conversions. */
  animation?: {
    /** Which CSS strategy was used. */
    mode: "palette" | "frames";
    /** Total loop duration in seconds. */
    duration: number;
    /** Number of frames emitted (after any `maxFrames` sampling). */
    frames: number;
    /** `palette` mode: how many palette slots animate (the rest are static). */
    animatedSlots?: number;
  };
}

/** The return value of {@link imageToCss}. */
export interface ConvertResult {
  /** The generated stylesheet. */
  css: string;
  /** Metadata describing the result (unless `emitMeta: false`). */
  meta: Meta;
  /** A self-contained HTML fragment, if `emitHtml: true`. */
  html?: string;
}

/** Decoded raster image: tightly-packed RGBA, 4 bytes per pixel, row-major. */
export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A decoded animation: a shared canvas size plus one RGBA buffer per frame. */
export interface DecodedFrames {
  width: number;
  height: number;
  /** One tightly-packed RGBA buffer per frame. */
  frames: Uint8Array[];
  /** Per-frame display duration in milliseconds. */
  delays: number[];
}

/**
 * A resolved palette plus a per-pixel index buffer.
 * `indices[y * width + x]` is an index into `colors`.
 */
export interface IndexedImage {
  width: number;
  height: number;
  colors: string[];
  indices: Int32Array;
  hasAlpha: boolean;
}
