import { buildPaletteSync, utils } from "image-q";
import { buildCss, heldBackgroundCss } from "./css.js";
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

  const mode = options.animationMode ?? "palette";
  if (mode === "frames") return convertFrameSwap(input, options);
  if (mode === "overlay") return convertOverlay(input, options);
  if (mode === "overlay-palette") return convertOverlayPalette(input, options);

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

  // Which slots (tracks) actually change over the loop — only these need to be
  // custom properties. With inlineStaticColors, constant slots become literals.
  const animatedSlots = new Set<number>();
  trackSequences.forEach((seq, track) => {
    if (!isConstant(seq)) animatedSlots.add(track);
  });

  const colorRef = opts.inlineStaticColors
    ? (i: number) =>
        animatedSlots.has(i) ? `var(--${opts.cssVarPrefix}-${i})` : colors[i]!
    : undefined;
  const paletteIndices = opts.inlineStaticColors ? animatedSlots : undefined;

  const rows = buildRowGradients(indexed, opts.cssVarPrefix, colorRef);
  const chunk = opts.singleElement ? Infinity : opts.layerChunkSize;
  const stopBudget = opts.singleElement ? Infinity : opts.maxStopsPerLayer;
  const layers = packLayers(rows, chunk, stopBudget);
  const { css: baseCss, layerClass, baseBackgrounds } = buildCss(
    indexed,
    layers,
    opts,
    paletteIndices,
  );
  const meta = buildMeta(indexed, layers, opts, layerClass);

  // 5. Animation: one keyframes rule per palette slot that changes, plus (with
  //    backgroundInKeyframes) the held background keyframes.
  const totalDelay = delays.reduce((a, b) => a + b, 0) || frames.length * 100;
  const duration = options.duration ?? totalDelay / 1000;
  const dur = `var(--pixel-anim-duration, ${duration}s)`;

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
  const paletteSlotCount = animationNames.length;

  // Folder-9 technique: hold the background-image in its own animation so the
  // element is composited on its own layer while the palette cycles. For a
  // single element it must share the one `animation` list with the palette
  // tracks; for layered output each layer animates its own held background.
  let selectorWillChange = "";
  let layerBgCss = "";
  if (baseBackgrounds && opts.singleElement) {
    animationNames.unshift("pxc-bg");
    keyframeBlocks.unshift(
      `@keyframes pxc-bg {\n  0%, 100% {\n    background-image: ${baseBackgrounds[0]!.image};\n    background-position: ${baseBackgrounds[0]!.position};\n  }\n}`,
    );
    selectorWillChange = opts.willChange
      ? `\n  will-change: background-image;`
      : "";
  } else if (baseBackgrounds) {
    layerBgCss = heldBackgroundCss(baseBackgrounds, opts, layerClass, dur);
  }

  let css = baseCss;
  if (animationNames.length > 0) {
    const list = animationNames
      .map((n) => `${n} ${dur} step-end infinite`)
      .join(", ");
    css +=
      `\n${opts.selector} {\n  animation: ${list};${selectorWillChange}\n}\n\n` +
      keyframeBlocks.join("\n\n") +
      "\n";
  }
  css += layerBgCss;

  meta.animation = {
    mode: "palette",
    duration,
    frames: frames.length,
    animatedSlots: paletteSlotCount,
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

  // 2. Reserve a transparent slot up front if any frame needs one, so the color
  //    list (and thus every frame's indices) is consistent.
  const cache = new Map<number, number>();
  const tokenFrames = frames.map((frame) =>
    tokenizeFrame(frame, palette, opts.alphaThreshold, cache),
  );
  let transparentIndex = -1;
  const hasAlpha = tokenFrames.some((t) => t.includes(TRANSPARENT_TOKEN));
  if (hasAlpha) {
    transparentIndex = colors.length;
    colors.push("transparent");
  }

  const toIndices = (tokens: Int32Array): Int32Array => {
    const indices = new Int32Array(tokens.length);
    for (let p = 0; p < tokens.length; p++) {
      const t = tokens[p]!;
      indices[p] = t === TRANSPARENT_TOKEN ? transparentIndex : t;
    }
    return indices;
  };

  // 3. Build every frame's layers with a FIXED row-chunking, so layer i covers
  //    the same rows in every frame (keeping the stacked layers aligned). Large
  //    images spread across several `<div>` layers — each stays simple enough to
  //    paint, which single-element painting cannot do at high resolution.
  const chunkRows = opts.singleElement ? Infinity : opts.layerChunkSize;
  const perFrameLayers = tokenFrames.map((tokens) => {
    const indexed: IndexedImage = {
      width,
      height,
      colors,
      indices: toIndices(tokens),
      hasAlpha,
    };
    const rows = buildRowGradients(indexed, opts.cssVarPrefix);
    return packLayers(rows, chunkRows, Infinity); // fixed N-row chunks
  });

  const layerCount = perFrameLayers[0]!.length;

  // 4. Palette + container + layer scaffolding only — the background itself is
  //    delivered by the @keyframes below (background-image AND -position together,
  //    the `10m` technique), so no static frame-0 background is painted.
  const baseImage: IndexedImage = {
    width,
    height,
    colors,
    indices: toIndices(tokenFrames[0]!),
    hasAlpha,
  };
  const { css: baseCss, layerClass } = buildCss(
    baseImage,
    perFrameLayers[0]!,
    opts,
    undefined,
    /* paintBackground */ false,
  );
  const meta = buildMeta(baseImage, perFrameLayers[0]!, opts, layerClass);

  // 5. Per-frame keyframes swapping background-image AND background-position
  //    together (step-end, no tween). Declaring the position inside the keyframe
  //    is what binds every stacked layer — animating background-image alone would
  //    paint only the first layer. The layout is fixed, so the position list is
  //    the same in every stop (taken from frame 0).
  const totalDelay = delays.reduce((a, b) => a + b, 0) || frames.length * 100;
  const duration = options.duration ?? totalDelay / 1000;
  const willChange = opts.willChange
    ? `\n  will-change: background-image;`
    : "";
  const dur = `var(--pixel-anim-duration, ${duration}s)`;

  const framePct: number[] = [];
  {
    let elapsed = 0;
    for (let f = 0; f < frames.length; f++) {
      framePct.push(f === 0 ? 0 : round((elapsed / totalDelay) * 100));
      elapsed += delays[f] ?? 0;
    }
  }

  const keyframesFor = (
    name: string,
    bgFor: (f: number) => string,
    position: string,
  ): string => {
    const stops = framePct
      .map(
        (pct, f) =>
          `  ${pct}% { background-image: ${bgFor(f)}; background-position: ${position}; }`,
      )
      .join("\n");
    return `@keyframes ${name} {\n${stops}\n}`;
  };

  let css = baseCss + "\n";

  if (opts.singleElement) {
    const name = "pxc-frames";
    css +=
      `\n${opts.selector} {` +
      `\n  animation: ${name} ${dur} step-end infinite;` +
      willChange +
      `\n}\n\n` +
      keyframesFor(
        name,
        (f) => perFrameLayers[f]![0]!.backgroundImage,
        perFrameLayers[0]![0]!.backgroundPosition,
      ) +
      "\n";
  } else {
    for (let i = 0; i < layerCount; i++) {
      const name = `pxc-frames-${i}`;
      css +=
        `\n${opts.selector} > .${layerClass}:nth-child(${i + 1}) {` +
        `\n  animation: ${name} ${dur} step-end infinite;` +
        willChange +
        `\n}\n\n` +
        keyframesFor(
          name,
          (f) => perFrameLayers[f]![i]!.backgroundImage,
          perFrameLayers[0]![i]!.backgroundPosition,
        ) +
        "\n";
    }
  }

  meta.animation = {
    mode: "frames",
    duration,
    frames: frames.length,
  };

  const result: ConvertResult = { css, meta };
  if (opts.emitHtml) {
    result.html = buildHtml(
      meta.selector,
      layerClass,
      layerCount,
      opts.singleElement,
    );
  }
  return result;
}

/**
 * Overlay animation: paint the pixels that never change once as a static
 * background on the element, then animate only a mostly-transparent overlay
 * layer whose gradients define just the changing pixels (frame-swapped). Every
 * frame the browser repaints only the small moving region; the static base is
 * rasterized once. The palette stays controllable via `--color-*`.
 */
function convertOverlay(
  input: DecodedFrames,
  options: Options,
): ConvertResult {
  const { width, height, frames, delays } = input;
  const opts = resolveOptions(options);
  const maxColors = options.maxColors ?? 64;
  const pixelCount = width * height;

  const palette = buildGlobalPalette(frames, width, height, maxColors);
  const colors = palette.map((rgb) => formatColor(rgb, opts.colorFormat));
  const transparentIndex = colors.length;
  colors.push("transparent");

  // Tokenize every frame (palette index, or -1 for source-transparent).
  const cache = new Map<number, number>();
  const tokenFrames = frames.map((frame) =>
    tokenizeFrame(frame, palette, opts.alphaThreshold, cache),
  );
  const slot = (t: number) => (t === TRANSPARENT_TOKEN ? transparentIndex : t);

  // A pixel is "changing" only if its ORIGINAL colour varies by more than
  // `changeThreshold` (per channel) across the loop. Using the source colours
  // (not the quantized tokens) ignores quantization flicker between near-
  // identical colours, keeping the animated region tight around real motion.
  const threshold = opts.changeThreshold;
  const changing = new Uint8Array(pixelCount);
  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const r0 = frames[0]![i]!;
    const g0 = frames[0]![i + 1]!;
    const b0 = frames[0]![i + 2]!;
    for (let f = 1; f < frames.length; f++) {
      const fr = frames[f]!;
      if (
        Math.abs(fr[i]! - r0) > threshold ||
        Math.abs(fr[i + 1]! - g0) > threshold ||
        Math.abs(fr[i + 2]! - b0) > threshold
      ) {
        changing[p] = 1;
        break;
      }
    }
  }

  // Static base: unchanging pixels keep their colour, changing ones are cut out
  // (transparent) so the animated overlay shows through.
  const baseIndices = new Int32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    baseIndices[p] = changing[p] ? transparentIndex : slot(tokenFrames[0]![p]!);
  }
  const baseImage: IndexedImage = {
    width,
    height,
    colors,
    indices: baseIndices,
    hasAlpha: true,
  };
  const baseRows = buildRowGradients(baseImage, opts.cssVarPrefix);
  // Static base as STACKED LAYERS (not one element). A single element can't paint
  // a full-resolution frame, but split across <div> layers it renders at any
  // size. The base is painted once; only the small overlay repaints per frame.
  const baseLayers = packLayers(
    baseRows,
    opts.singleElement ? Infinity : opts.layerChunkSize,
    opts.singleElement ? Infinity : opts.maxStopsPerLayer,
  );
  const { css: baseCss, layerClass } = buildCss(baseImage, baseLayers, opts);
  const meta = buildMeta(baseImage, baseLayers, opts, layerClass);
  const overlayClass = layerClass.replace(/__layer$/, "__overlay");

  // Bounding box of every pixel that ever changes. The overlay only needs to
  // cover this rectangle (where the water flows) — not the whole frame — so its
  // gradients are short and it's positioned into place.
  let minX = width,
    maxX = -1,
    minY = height,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (changing[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    // Nothing animates — degenerate to a 1×1 box so the code below is valid.
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;

  // Rows within the box that actually contain a changing pixel (positions are
  // box-local, so the static background shows through the omitted ones).
  const activeRows: number[] = [];
  for (let r = 0; r < boxH; r++) {
    const gy = minY + r;
    for (let c = 0; c < boxW; c++) {
      if (changing[gy * width + minX + c]) {
        activeRows.push(r);
        break;
      }
    }
  }
  const overlayPosition = activeRows
    .map((r) => `0 calc(var(--pixel-height) * ${r})`)
    .join(", ");

  // Overlay per frame: a box-sized image (boxW × boxH) where only changing
  // pixels are defined; everything else is transparent.
  const boxPixels = boxW * boxH;
  const overlayBg = tokenFrames.map((tokens) => {
    const idx = new Int32Array(boxPixels);
    for (let r = 0; r < boxH; r++) {
      const gy = minY + r;
      for (let c = 0; c < boxW; c++) {
        const gp = gy * width + minX + c;
        idx[r * boxW + c] = changing[gp] ? slot(tokens[gp]!) : transparentIndex;
      }
    }
    const rows = buildRowGradients(
      { width: boxW, height: boxH, colors, indices: idx, hasAlpha: true },
      opts.cssVarPrefix,
    );
    return activeRows.map((r) => rows.gradients[r]!).join(", ");
  });

  const totalDelay = delays.reduce((a, b) => a + b, 0) || frames.length * 100;
  const duration = options.duration ?? totalDelay / 1000;
  const dur = `var(--pixel-anim-duration, ${duration}s)`;
  const willChange = opts.willChange
    ? `\n  will-change: background-image;`
    : "";

  const stops: string[] = [];
  let elapsed = 0;
  for (let f = 0; f < frames.length; f++) {
    const pct = f === 0 ? 0 : round((elapsed / totalDelay) * 100);
    stops.push(`  ${pct}% { background-image: ${overlayBg[f]!}; }`);
    elapsed += delays[f] ?? 0;
  }

  let css = baseCss + "\n";
  css +=
    // Anchor the absolutely-positioned overlay to the container.
    `\n${opts.selector} { position: relative; }\n` +
    `\n${opts.selector} > .${overlayClass} {` +
    `\n  position: absolute;` +
    `\n  left: calc(var(--pixel-width) * ${minX});` +
    `\n  top: calc(var(--pixel-height) * ${minY});` +
    `\n  width: calc(var(--pixel-width) * ${boxW});` +
    `\n  height: calc(var(--pixel-height) * ${boxH});` +
    `\n  background-repeat: no-repeat;` +
    `\n  background-size: 100% var(--pixel-height);` +
    `\n  background-position: ${overlayPosition};` +
    // Static frame 0 so the overlay is correct even before/without the animation
    // (reduced-motion, or first paint); the keyframes then swap it per frame.
    `\n  background-image: ${overlayBg[0]!};` +
    `\n  animation: pxc-overlay ${dur} step-end infinite;` +
    willChange +
    `\n}\n\n` +
    `@keyframes pxc-overlay {\n${stops.join("\n")}\n}\n`;

  meta.animation = { mode: "overlay", duration, frames: frames.length };

  const result: ConvertResult = { css, meta };
  if (opts.emitHtml) {
    const baseClass = meta.selector.replace(/^\./, "");
    const layerDivs = Array.from(
      { length: baseLayers.length },
      () => `  <div class="${layerClass}"></div>`,
    ).join("\n");
    result.html =
      `<div class="${baseClass} palette">\n${layerDivs}\n` +
      `  <div class="${overlayClass}"></div>\n</div>`;
  }
  return result;
}

/**
 * Overlay + palette hybrid: a static base painted once (stacked layers), plus a
 * cropped overlay covering only the moving region whose colors cycle via the
 * palette (`--color-*` value changes in the keyframes — no background-image
 * swap). The base references only static color slots, so it never recomputes;
 * only the small overlay references the animated slots, so only it repaints.
 */
function convertOverlayPalette(
  input: DecodedFrames,
  options: Options,
): ConvertResult {
  const { width, height, frames, delays } = input;
  const opts = resolveOptions(options);
  const maxColors = options.maxColors ?? 64;
  const pixelCount = width * height;

  const palette = buildGlobalPalette(frames, width, height, maxColors);
  const colors = palette.map((rgb) => formatColor(rgb, opts.colorFormat));
  const transparentIndex = colors.length;
  colors.push("transparent");

  const cache = new Map<number, number>();
  const tokenFrames = frames.map((frame) =>
    tokenizeFrame(frame, palette, opts.alphaThreshold, cache),
  );
  const slot = (t: number) => (t === TRANSPARENT_TOKEN ? transparentIndex : t);
  const tokenToColor = (t: number): string =>
    t === transparentIndex ? "transparent" : colors[t]!;

  // Changing pixels (by source-color delta) + their bounding box.
  const threshold = opts.changeThreshold;
  const changing = new Uint8Array(pixelCount);
  let minX = width,
    maxX = -1,
    minY = height,
    maxY = -1;
  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const r0 = frames[0]![i]!;
    const g0 = frames[0]![i + 1]!;
    const b0 = frames[0]![i + 2]!;
    for (let f = 1; f < frames.length; f++) {
      const fr = frames[f]!;
      if (
        Math.abs(fr[i]! - r0) > threshold ||
        Math.abs(fr[i + 1]! - g0) > threshold ||
        Math.abs(fr[i + 2]! - b0) > threshold
      ) {
        changing[p] = 1;
        const x = p % width;
        const y = (p / width) | 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        break;
      }
    }
  }
  if (maxX < 0) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;

  // Group changing pixels in the box by temporal token sequence → one animated
  // slot ("track") each, appended after the palette + transparent slots. Non-
  // changing box pixels map to the transparent slot (base shows through).
  const trackBase = colors.length;
  const seqToTrack = new Map<string, number>();
  const trackSeqs: number[][] = [];
  const overlayIdx = new Int32Array(boxW * boxH);
  for (let r = 0; r < boxH; r++) {
    for (let c = 0; c < boxW; c++) {
      const gp = (minY + r) * width + (minX + c);
      const bp = r * boxW + c;
      if (!changing[gp]) {
        overlayIdx[bp] = transparentIndex;
        continue;
      }
      let key = "";
      const seq: number[] = new Array(frames.length);
      for (let f = 0; f < frames.length; f++) {
        const t = slot(tokenFrames[f]![gp]!);
        seq[f] = t;
        key += t + ",";
      }
      let track = seqToTrack.get(key);
      if (track === undefined) {
        track = trackSeqs.length;
        seqToTrack.set(key, track);
        trackSeqs.push(seq);
        colors.push(tokenToColor(seq[0]!)); // frame-0 value of this animated slot
      }
      overlayIdx[bp] = trackBase + track;
    }
  }

  // Static base (stacked layers so it renders at any size); changing cut out.
  const baseIndices = new Int32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    baseIndices[p] = changing[p] ? transparentIndex : slot(tokenFrames[0]![p]!);
  }
  const baseImage: IndexedImage = {
    width,
    height,
    colors,
    indices: baseIndices,
    hasAlpha: true,
  };
  const baseRows = buildRowGradients(baseImage, opts.cssVarPrefix);
  const baseLayers = packLayers(
    baseRows,
    opts.singleElement ? Infinity : opts.layerChunkSize,
    opts.singleElement ? Infinity : opts.maxStopsPerLayer,
  );
  const { css: baseCss, layerClass } = buildCss(baseImage, baseLayers, opts);
  const meta = buildMeta(baseImage, baseLayers, opts, layerClass);
  const overlayClass = layerClass.replace(/__layer$/, "__overlay");

  // Overlay gradients (box-local), referencing the (static or animated) slots.
  const overlayRows = buildRowGradients(
    { width: boxW, height: boxH, colors, indices: overlayIdx, hasAlpha: true },
    opts.cssVarPrefix,
  );
  const activeRows: number[] = [];
  for (let r = 0; r < boxH; r++) {
    for (let c = 0; c < boxW; c++) {
      if (changing[(minY + r) * width + minX + c]) {
        activeRows.push(r);
        break;
      }
    }
  }
  const overlayBg = activeRows.map((r) => overlayRows.gradients[r]!).join(", ");
  const overlayPosition = activeRows
    .map((r) => `0 calc(var(--pixel-height) * ${r})`)
    .join(", ");

  // Palette keyframes. Only tracks that actually change over the loop animate.
  const totalDelay = delays.reduce((a, b) => a + b, 0) || frames.length * 100;
  const duration = options.duration ?? totalDelay / 1000;
  const dur = `var(--pixel-anim-duration, ${duration}s)`;
  const animated = trackSeqs
    .map((seq, track) => ({ idx: trackBase + track, seq }))
    .filter((t) => !isConstant(t.seq));
  const framePct: number[] = [];
  {
    let elapsed = 0;
    for (let f = 0; f < frames.length; f++) {
      framePct.push(f === 0 ? 0 : round((elapsed / totalDelay) * 100));
      elapsed += delays[f] ?? 0;
    }
  }

  let animRule = "";
  const kfBlocks: string[] = [];
  if (animated.length > 0 && opts.paletteKeyframes === "combined") {
    // ONE animation; every keyframe stop defines ALL the changing colors.
    animRule = `\n${opts.selector} { animation: pxc-cycle ${dur} step-end infinite; }\n`;
    const stops = framePct
      .map(
        (pct, f) =>
          `  ${pct}% { ${animated
            .map((t) => `--${opts.cssVarPrefix}-${t.idx}: ${tokenToColor(t.seq[f]!)};`)
            .join(" ")} }`,
      )
      .join("\n");
    kfBlocks.push(`@keyframes pxc-cycle {\n${stops}\n}`);
  } else if (animated.length > 0) {
    // One @keyframes per animated slot (per-color, with per-slot dedup).
    const names: string[] = [];
    for (const t of animated) {
      const name = `pxc-${t.idx}`;
      names.push(name);
      const kfStops: string[] = [];
      let prev: string | null = null;
      for (let f = 0; f < t.seq.length; f++) {
        const color = tokenToColor(t.seq[f]!);
        if (color !== prev) {
          kfStops.push(`  ${framePct[f]}% { --${opts.cssVarPrefix}-${t.idx}: ${color}; }`);
          prev = color;
        }
      }
      kfBlocks.push(`@keyframes ${name} {\n${kfStops.join("\n")}\n}`);
    }
    animRule = `\n${opts.selector} { animation: ${names
      .map((n) => `${n} ${dur} step-end infinite`)
      .join(", ")}; }\n`;
  }

  let css = baseCss + "\n";
  css += `\n${opts.selector} { position: relative; }\n`;
  // The animation (palette cycling) lives on the container; only the overlay's
  // gradients reference the animated slots, so only the overlay repaints.
  css += animRule;
  css +=
    `\n${opts.selector} > .${overlayClass} {` +
    `\n  position: absolute;` +
    `\n  left: calc(var(--pixel-width) * ${minX});` +
    `\n  top: calc(var(--pixel-height) * ${minY});` +
    `\n  width: calc(var(--pixel-width) * ${boxW});` +
    `\n  height: calc(var(--pixel-height) * ${boxH});` +
    `\n  background-repeat: no-repeat;` +
    `\n  background-size: 100% var(--pixel-height);` +
    `\n  background-position: ${overlayPosition};` +
    `\n  background-image: ${overlayBg};` +
    `\n}\n`;
  if (kfBlocks.length > 0) css += "\n" + kfBlocks.join("\n\n") + "\n";

  meta.animation = {
    mode: "overlay-palette",
    duration,
    frames: frames.length,
    animatedSlots: animated.length,
  };

  const result: ConvertResult = { css, meta };
  if (opts.emitHtml) {
    const baseClass = meta.selector.replace(/^\./, "");
    const layerDivs = Array.from(
      { length: baseLayers.length },
      () => `  <div class="${layerClass}"></div>`,
    ).join("\n");
    result.html =
      `<div class="${baseClass} palette">\n${layerDivs}\n` +
      `  <div class="${overlayClass}"></div>\n</div>`;
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
