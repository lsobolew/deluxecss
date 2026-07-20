/** Options controlling how an image is converted to CSS. All are optional. */
export interface Options {
  /**
   * Reduce the image to at most this many colors (median-cut/Wu quantization).
   * Omit for a raw palette built from every unique color in the source — best
   * for true pixel art with a small palette.
   */
  maxColors?: number;

  /**
   * `overlay-palette` mode only: split the color budget between the parts of the
   * image. The **static base** is rasterized once, so its palette size costs
   * nothing at playback — give it many colors (`maxColorsStatic`) for a crisp
   * background. The **animated overlay** is repainted every tick, and a smaller
   * palette there (`maxColorsAnimated`, e.g. 24) makes each repaint far cheaper.
   * When either is set the two regions are quantized independently; when both are
   * omitted the whole animation shares one `maxColors` palette (unchanged).
   */
  maxColorsStatic?: number;
  maxColorsAnimated?: number;

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
   * - `overlay`: paint the pixels that never change once as a static background,
   *   and animate only a mostly-transparent overlay layer that defines just the
   *   changing pixels (frame-swapped). The browser only repaints the small moving
   *   region each frame.
   * - `overlay-palette`: like `overlay`, but the moving region cycles its palette
   *   (`--color-*` value changes in the keyframes) instead of swapping the whole
   *   background. The static base references only static color slots (so it never
   *   recomputes); only the small overlay references the animated slots.
   */
  animationMode?: "palette" | "frames" | "overlay" | "overlay-palette";

  /**
   * Animation only: sample the source down to at most this many frames (evenly
   * spaced). Useful for `frames` mode, where CSS size scales with frame count.
   */
  maxFrames?: number;

  /**
   * `overlay` mode only: a pixel counts as "changing" only if its color varies
   * by more than this (0-255, per channel) across the loop. Filters out
   * quantization flicker so the animated region — and the overlay's bounding box
   * — stays tight around what actually moves. Default 16; 0 = any change.
   */
  changeThreshold?: number;

  /**
   * Animation only (`frames` mode): emit a `will-change: background-image` hint
   * to promote the element to its own compositing layer. Default true.
   */
  willChange?: boolean;

  /**
   * Palette animation only: inline colors that never change during the loop as
   * literal hex/rgb values in the gradients, keeping only the colors that *do*
   * animate as `--color-*` custom properties. Cuts the number of variables and
   * `var()` lookups sharply (static regions dominate most images). Default false.
   */
  inlineStaticColors?: boolean;

  /**
   * Emit every color as a literal in the gradients and drop the `--color-*`
   * palette entirely (no palette rule, no `@property`). This trades away live
   * recolorability for a smaller, palette-free stylesheet — the right choice for
   * frame-by-frame animations (`frames` mode) and one-off static images, where
   * the palette is never touched. Applies to static + `frames` output; ignored
   * in palette-cycling modes, which need the variables to animate. Default false.
   */
  inlinePalette?: boolean;
}

/** Fully-resolved options with every default applied. */
export type ResolvedOptions = Required<
  Omit<
    Options,
    | "maxColors"
    | "maxColorsStatic"
    | "maxColorsAnimated"
    | "emitHtml"
    | "resize"
    | "duration"
    | "maxFrames"
  >
> & {
  maxColors: number | undefined;
  maxColorsStatic: number | undefined;
  maxColorsAnimated: number | undefined;
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
    mode: "palette" | "frames" | "overlay" | "overlay-palette";
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
