import { buildPaletteSync, utils } from "image-q";
import { buildCss } from "./css.js";
import { decodeFrames } from "./decode.js";
import { packLayers } from "./layers.js";
import { buildMeta } from "./meta.js";
import { buildRowGradients } from "./rle.js";
import { resolveOptions } from "./options.js";
import type {
  ConvertResult,
  DecodedFrames,
  IndexedImage,
  Options,
} from "./types.js";

type RGB = readonly [number, number, number];

const TRANSPARENT_TOKEN = -1;

/**
 * Convert an animated image into a single static pixel-art layout plus pure-CSS
 * `@keyframes` that cycle the palette. Pixels never move — each pixel keeps one
 * palette slot forever, and only the slot's *color value* animates over time, so
 * the whole animation is expressed as animated CSS custom properties. No
 * JavaScript, no custom element.
 */
export function convertAnimated(
  rawInput: DecodedFrames,
  options: Options = {},
): ConvertResult {
  if (rawInput.frames.length === 0) throw new Error("No frames to convert");
  if (rawInput.width < 1 || rawInput.height < 1) {
    throw new Error("Image must have non-zero width and height");
  }

  const input = sampleFrames(rawInput, options.maxFrames);

  if ((options.animationMode ?? "palette") === "frames") {
    return convertFrameSwap(input, options);
  }

  const { width, height, frames, delays } = input;
  const opts = resolveOptions(options);
  const maxColors = options.maxColors ?? 64;
  const pixelCount = width * height;

  // 1. One quantized RGB palette shared across every frame.
  const palette = buildGlobalPalette(frames, width, height, maxColors);

  // 2. Map every frame to per-pixel tokens (palette index, or -1 for transparent).
  const cache = new Map<number, number>();
  const tokenFrames = frames.map((frame) =>
    tokenizeFrame(frame, palette, opts.alphaThreshold, cache),
  );

  // 3. Group pixels by their temporal token sequence. Each unique sequence
  //    becomes one palette slot ("track"); the pixel layout is then constant.
  const seqToTrack = new Map<string, number>();
  const trackSequences: number[][] = [];
  const indices = new Int32Array(pixelCount);

  for (let p = 0; p < pixelCount; p++) {
    let key = "";
    const seq: number[] = new Array(frames.length);
    for (let f = 0; f < frames.length; f++) {
      const t = tokenFrames[f]![p]!;
      seq[f] = t;
      key += t + ",";
    }
    let track = seqToTrack.get(key);
    if (track === undefined) {
      track = trackSequences.length;
      seqToTrack.set(key, track);
      trackSequences.push(seq);
    }
    indices[p] = track;
  }

  // 4. Static layout: each track's colour is its frame-0 value.
  const tokenToColor = (t: number): string =>
    t === TRANSPARENT_TOKEN
      ? "transparent"
      : formatColor(palette[t]!, opts.colorFormat);

  const colors = trackSequences.map((seq) => tokenToColor(seq[0]!));
  const hasAlpha = trackSequences.some((seq) =>
    seq.includes(TRANSPARENT_TOKEN),
  );

  const indexed: IndexedImage = { width, height, colors, indices, hasAlpha };

  const rows = buildRowGradients(indexed, opts.cssVarPrefix);
  const chunk = opts.singleElement ? Infinity : opts.layerChunkSize;
  const stopBudget = opts.singleElement ? Infinity : opts.maxStopsPerLayer;
  const layers = packLayers(rows, chunk, stopBudget);
  const { css: baseCss, layerClass } = buildCss(indexed, layers, opts);
  const meta = buildMeta(indexed, layers, opts, layerClass);

  // 5. Animation: keyframes + an animation list for the tracks that change.
  const totalDelay = delays.reduce((a, b) => a + b, 0) || frames.length * 100;
  const duration = options.duration ?? totalDelay / 1000;

  const keyframeBlocks: string[] = [];
  const animationNames: string[] = [];

  trackSequences.forEach((seq, track) => {
    if (isConstant(seq)) return;
    const name = `pxc-${track}`;
    animationNames.push(name);
    keyframeBlocks.push(
      buildKeyframes(name, track, seq, delays, totalDelay, opts.cssVarPrefix, tokenToColor),
    );
  });

  let css = baseCss;
  if (animationNames.length > 0) {
    const list = animationNames
      .map((n) => `${n} var(--pixel-anim-duration, ${duration}s) step-end infinite`)
      .join(", ");
    css +=
      `\n${opts.selector} {\n  animation: ${list};\n}\n\n` +
      keyframeBlocks.join("\n\n") +
      "\n";
  }

  meta.animation = {
    mode: "palette",
    duration,
    frames: frames.length,
    animatedSlots: animationNames.length,
  };

  const result: ConvertResult = { css, meta };
  if (opts.emitHtml) {
    result.html = buildHtml(meta.selector, layerClass, layers.length, opts.singleElement);
  }
  return result;
}

/**
 * Frame-swap animation: each frame is a complete `background-image` gradient set,
 * and a single `@keyframes` rule swaps the whole background per frame with
 * `step-end` timing (no tween). Because every frame's background is a fixed value
 * the browser rasterizes it once and caches it, and the element is promoted to
 * its own compositing layer — so playback runs on the browser's animation
 * pipeline instead of continuously recomputing gradients. Works for any
 * animation (pixels may move), and the palette stays controllable via `--color-*`.
 */
function convertFrameSwap(
  input: DecodedFrames,
  options: Options,
): ConvertResult {
  const { width, height, frames, delays } = input;
  const opts = resolveOptions(options);
  const maxColors = options.maxColors ?? 64;

  // 1. One shared, controllable palette across every frame.
  const palette = buildGlobalPalette(frames, width, height, maxColors);
  const colors = palette.map((rgb) => formatColor(rgb, opts.colorFormat));

  // 2. Each frame → its full single-layer gradient set (all rows, one element).
  const cache = new Map<number, number>();
  let transparentIndex = -1;
  let hasAlpha = false;

  const frameLayers = frames.map((frame) => {
    const tokens = tokenizeFrame(frame, palette, opts.alphaThreshold, cache);
    const indices = new Int32Array(width * height);
    for (let p = 0; p < tokens.length; p++) {
      const t = tokens[p]!;
      if (t === TRANSPARENT_TOKEN) {
        hasAlpha = true;
        if (transparentIndex === -1) {
          transparentIndex = colors.length;
          colors.push("transparent");
        }
        indices[p] = transparentIndex;
      } else {
        indices[p] = t;
      }
    }
    const indexed: IndexedImage = { width, height, colors, indices, hasAlpha };
    const rows = buildRowGradients(indexed, opts.cssVarPrefix);
    // Force everything onto one layer — frame-swap paints on a single element.
    return packLayers(rows, Infinity, Infinity)[0]!;
  });

  // 3. Static base render = frame 0, painted on the element itself.
  const baseOpts = resolveOptions({ ...options, singleElement: true });
  const frame0Indices = new Int32Array(width * height);
  // Reuse frame 0's layout by rebuilding its indices for the meta/base image.
  {
    const tokens = tokenizeFrame(frames[0]!, palette, opts.alphaThreshold, cache);
    for (let p = 0; p < tokens.length; p++) {
      const t = tokens[p]!;
      frame0Indices[p] = t === TRANSPARENT_TOKEN ? transparentIndex : t;
    }
  }
  const baseImage: IndexedImage = {
    width,
    height,
    colors,
    indices: frame0Indices,
    hasAlpha,
  };
  const { css: baseCss, layerClass } = buildCss(
    baseImage,
    [frameLayers[0]!],
    baseOpts,
  );
  const meta = buildMeta(baseImage, [frameLayers[0]!], baseOpts, layerClass);

  // 4. Keyframes swapping the whole background-image per frame (step-end).
  const totalDelay = delays.reduce((a, b) => a + b, 0) || frames.length * 100;
  const duration = options.duration ?? totalDelay / 1000;
  const name = "pxc-frames";

  const stops: string[] = [];
  let elapsed = 0;
  for (let f = 0; f < frameLayers.length; f++) {
    const pct = f === 0 ? 0 : round((elapsed / totalDelay) * 100);
    stops.push(`  ${pct}% { background-image: ${frameLayers[f]!.backgroundImage}; }`);
    elapsed += delays[f] ?? 0;
  }

  const willChange = opts.willChange
    ? `\n  will-change: background-image;`
    : "";
  let css = baseCss;
  css +=
    `\n${opts.selector} {` +
    `\n  animation: ${name} var(--pixel-anim-duration, ${duration}s) step-end infinite;` +
    willChange +
    `\n}\n\n` +
    `@keyframes ${name} {\n${stops.join("\n")}\n}\n`;

  meta.animation = {
    mode: "frames",
    duration,
    frames: frames.length,
  };

  const result: ConvertResult = { css, meta };
  if (opts.emitHtml) {
    result.html = buildHtml(meta.selector, layerClass, 1, true);
  }
  return result;
}

/** Sample frames down to at most `max`, evenly spaced, preserving loop timing. */
function sampleFrames(input: DecodedFrames, max?: number): DecodedFrames {
  const total = input.frames.length;
  if (!max || max >= total || max < 1) return input;

  const frames: Uint8Array[] = [];
  const delays: number[] = [];
  // Pick `max` source indices evenly, then fold the skipped frames' delays
  // into the kept frame so the overall loop duration is unchanged.
  const picks: number[] = [];
  for (let i = 0; i < max; i++) {
    picks.push(Math.round((i * (total - 1)) / (max - 1)));
  }
  for (let i = 0; i < picks.length; i++) {
    const start = picks[i]!;
    const end = i + 1 < picks.length ? picks[i + 1]! : total;
    frames.push(input.frames[start]!);
    let d = 0;
    for (let s = start; s < end; s++) d += input.delays[s] ?? 0;
    delays.push(d);
  }
  return { width: input.width, height: input.height, frames, delays };
}

/** Decode an animated image from disk/memory and convert it to animated CSS. */
export async function animateImageToCss(
  input: string | Buffer | Uint8Array,
  options: Options = {},
): Promise<ConvertResult> {
  const frames = await decodeFrames(input, options.resize);
  return convertAnimated(frames, options);
}

// ---- helpers ----

function buildGlobalPalette(
  frames: Uint8Array[],
  width: number,
  height: number,
  maxColors: number,
): RGB[] {
  // Concatenate all frames (alpha forced opaque) so quantization sees every
  // colour that appears anywhere in the animation.
  const perFrame = width * height * 4;
  const big = new Uint8Array(perFrame * frames.length);
  frames.forEach((frame, f) => {
    const base = f * perFrame;
    for (let i = 0; i < perFrame; i += 4) {
      big[base + i] = frame[i]!;
      big[base + i + 1] = frame[i + 1]!;
      big[base + i + 2] = frame[i + 2]!;
      big[base + i + 3] = 255;
    }
  });

  const container = utils.PointContainer.fromUint8Array(
    big,
    width,
    height * frames.length,
  );
  const iqPalette = buildPaletteSync([container], {
    colorDistanceFormula: "euclidean",
    paletteQuantization: "wuquant",
    colors: Math.max(1, Math.floor(maxColors)),
  });
  return iqPalette
    .getPointContainer()
    .getPointArray()
    .map((p) => [p.r, p.g, p.b] as const);
}

function tokenizeFrame(
  frame: Uint8Array,
  palette: RGB[],
  alphaThreshold: number,
  cache: Map<number, number>,
): Int32Array {
  const count = frame.length / 4;
  const tokens = new Int32Array(count);
  for (let p = 0, i = 0; p < count; p++, i += 4) {
    const a = frame[i + 3]!;
    if (a === 0 || a < alphaThreshold) {
      tokens[p] = TRANSPARENT_TOKEN;
      continue;
    }
    const r = frame[i]!;
    const g = frame[i + 1]!;
    const b = frame[i + 2]!;
    const key = (r << 16) | (g << 8) | b;
    let idx = cache.get(key);
    if (idx === undefined) {
      idx = nearest(palette, r, g, b);
      cache.set(key, idx);
    }
    tokens[p] = idx;
  }
  return tokens;
}

function nearest(palette: RGB[], r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i]!;
    const dr = pr - r;
    const dg = pg - g;
    const db = pb - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function isConstant(seq: number[]): boolean {
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[0]) return false;
  return true;
}

function buildKeyframes(
  name: string,
  track: number,
  seq: number[],
  delays: number[],
  totalDelay: number,
  prefix: string,
  tokenToColor: (t: number) => string,
): string {
  const stops: string[] = [];
  let elapsed = 0;
  let prevColor: string | null = null;
  for (let f = 0; f < seq.length; f++) {
    const color = tokenToColor(seq[f]!);
    if (color !== prevColor) {
      const pct = f === 0 ? 0 : round((elapsed / totalDelay) * 100);
      stops.push(`  ${pct}% { --${prefix}-${track}: ${color}; }`);
      prevColor = color;
    }
    elapsed += delays[f] ?? 0;
  }
  return `@keyframes ${name} {\n${stops.join("\n")}\n}`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function formatColor(rgb: RGB, format: "hex" | "rgb"): string {
  const [r, g, b] = rgb;
  if (format === "rgb") return `rgb(${r}, ${g}, ${b})`;
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

function hx(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function buildHtml(
  selector: string,
  layerClass: string,
  layerCount: number,
  single: boolean,
): string {
  const baseClass = selector.startsWith(".") ? selector.slice(1) : selector;
  if (single) return `<div class="${baseClass} palette"></div>`;
  const layers = Array.from(
    { length: layerCount },
    () => `  <div class="${layerClass}"></div>`,
  ).join("\n");
  return `<div class="${baseClass} palette">\n${layers}\n</div>`;
}
