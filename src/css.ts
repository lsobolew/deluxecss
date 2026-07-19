import type { Layer } from "./layers.js";
import type { IndexedImage, ResolvedOptions } from "./types.js";

export interface CssParts {
  css: string;
  layerClass: string;
  /**
   * Present when `backgroundInKeyframes` is set: one entry per stacked layer (in
   * order) that the caller must emit inside a held `@keyframes` rule instead of
   * statically. A single-element image yields one entry; a layered image yields
   * one per `.__layer` child.
   */
  baseBackgrounds?: Array<{ image: string; position: string }>;
}

/** Assemble the final stylesheet from the palette and packed layers. */
export function buildCss(
  image: IndexedImage,
  layers: Layer[],
  opts: ResolvedOptions,
  /**
   * Which palette indices to emit as custom properties. Omit to emit all; pass a
   * set to skip colors that were inlined as literals in the gradients.
   */
  paletteIndices?: Set<number>,
  /**
   * Whether to paint the static `background-image`/`background-position` on the
   * element(s). Pass false when the caller animates the background via
   * `@keyframes` (frames mode with position-in-keyframe) — the element then only
   * gets sizing, repeat and background-size, and the layer slots stay empty.
   */
  paintBackground = true,
): CssParts {
  const { width, height, colors } = image;
  const {
    cssVarPrefix,
    selector,
    paletteSelector,
    sizing,
    scale,
    layerElement,
    emitAtProperty,
    minify,
  } = opts;

  if (layerElement === "pseudo" && layers.length > 2) {
    throw new Error(
      `layerElement: 'pseudo' supports at most 2 layers, but this image needs ${layers.length}. ` +
        `Use layerElement: 'div' or a larger layerChunkSize.`,
    );
  }

  const single = opts.singleElement;
  if (single && layers.length > 1) {
    throw new Error(
      `singleElement requires the image to fit in one layer, but it needs ${layers.length}. ` +
        `Increase layerChunkSize/maxStopsPerLayer, or set singleElement: false.`,
    );
  }

  const baseClass = selector.startsWith(".") ? selector.slice(1) : selector;
  const layerClass = `${baseClass}__layer`;
  // Deliver the background from a held keyframe (folder-9 technique). Works for a
  // single element and, per-layer, for a stack of `<div>` layers.
  const bgInKeyframes = opts.backgroundInKeyframes && layerElement !== "pseudo";
  const baseBackgrounds: Array<{ image: string; position: string }> = [];

  const blocks: string[] = [];

  // @property registration — lets palette colors interpolate when transitioned.
  if (emitAtProperty) {
    for (let i = 0; i < colors.length; i++) {
      if (paletteIndices && !paletteIndices.has(i)) continue;
      blocks.push(
        `@property --${cssVarPrefix}-${i} {\n  syntax: "<color>";\n  inherits: true;\n  initial-value: ${colors[i]};\n}`,
      );
    }
  }

  // Palette custom properties (only the ones actually referenced as variables).
  const paletteVars = colors
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => !paletteIndices || paletteIndices.has(i))
    .map(({ c, i }) => `  --${cssVarPrefix}-${i}: ${c};`)
    .join("\n");
  blocks.push(`${paletteSelector} {\n${paletteVars}\n}`);

  // Container / sizing (+ background painted directly on it in single-element mode).
  let containerBody = sizingDecls(width, height, sizing, scale);
  if (single && layers.length === 1) {
    const layer = layers[0]!;
    containerBody +=
      `\n  background-repeat: no-repeat;` +
      `\n  background-size: 100% var(--pixel-height);`;
    if (bgInKeyframes) {
      // Background is delivered by the caller via a held @keyframes rule; the
      // element only sets the size/repeat so the animated image lands correctly.
      baseBackgrounds.push({
        image: layer.backgroundImage,
        position: layer.backgroundPosition,
      });
    } else if (paintBackground) {
      containerBody +=
        `\n  background-image: ${layer.backgroundImage};` +
        `\n  background-position: ${layer.backgroundPosition};`;
    }
    // paintBackground === false: caller animates background-image + -position
    // via @keyframes (frames mode); leave the element with only size/repeat.
  }
  blocks.push(`${selector} {\n${containerBody}\n}`);

  // Layers.
  if (single) {
    // Painted on the container above; no child layers emitted.
  } else if (layerElement === "pseudo") {
    const pseudos = ["::before", "::after"];
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]!;
      blocks.push(
        `${selector}${pseudos[i]} {\n` +
          `  content: "";\n` +
          `  grid-column: 1;\n` +
          `  grid-row: 1;\n` +
          `  background-repeat: no-repeat;\n` +
          `  background-size: 100% var(--pixel-height);\n` +
          `  background-image: ${layer.backgroundImage};\n` +
          `  background-position: ${layer.backgroundPosition};\n` +
          `}`,
      );
    }
  } else {
    // Shared layer declarations.
    blocks.push(
      `${selector} > .${layerClass} {\n` +
        `  grid-column: 1;\n` +
        `  grid-row: 1;\n` +
        `  width: 100%;\n` +
        `  height: 100%;\n` +
        `  background-repeat: no-repeat;\n` +
        `  background-size: 100% var(--pixel-height);\n` +
        `}`,
    );
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]!;
      if (bgInKeyframes) {
        // The caller animates each layer's background via a held keyframe.
        baseBackgrounds.push({
          image: layer.backgroundImage,
          position: layer.backgroundPosition,
        });
      } else if (paintBackground) {
        blocks.push(
          `${selector} > .${layerClass}:nth-child(${i + 1}) {\n` +
            `  background-image: ${layer.backgroundImage};\n` +
            `  background-position: ${layer.backgroundPosition};\n` +
            `}`,
        );
      }
    }
  }

  const css = minify ? minifyCss(blocks.join("\n")) : blocks.join("\n\n") + "\n";
  return {
    css,
    layerClass,
    baseBackgrounds: bgInKeyframes ? baseBackgrounds : undefined,
  };
}

/**
 * Emit the held `@keyframes` that deliver each layer's background (folder-9
 * technique), targeting the container in single-element mode or each `.__layer`
 * child otherwise. `duration` is the CSS time (e.g. `1s`) for the held loop.
 */
export function heldBackgroundCss(
  baseBackgrounds: Array<{ image: string; position: string }>,
  opts: ResolvedOptions,
  layerClass: string,
  duration: string,
): string {
  const willChange = opts.willChange
    ? `\n  will-change: background-image;`
    : "";
  const blocks: string[] = [];
  baseBackgrounds.forEach((bg, i) => {
    const name = opts.singleElement ? "pxc-bg" : `pxc-bg-${i}`;
    const target = opts.singleElement
      ? opts.selector
      : `${opts.selector} > .${layerClass}:nth-child(${i + 1})`;
    blocks.push(
      `${target} {\n  animation: ${name} ${duration} step-end infinite;${willChange}\n}`,
    );
    blocks.push(
      `@keyframes ${name} {\n  0%, 100% {\n    background-image: ${bg.image};\n    background-position: ${bg.position};\n  }\n}`,
    );
  });
  return "\n" + blocks.join("\n\n") + "\n";
}

function sizingDecls(
  width: number,
  height: number,
  sizing: ResolvedOptions["sizing"],
  scale: number,
): string {
  const lines: string[] = [];
  lines.push("  display: grid;");
  lines.push(`  width: calc(${width}px * var(--scale, ${scale}));`);
  lines.push(`  aspect-ratio: ${width} / ${height};`);

  if (sizing === "container") {
    lines.push("  container-type: size;");
    lines.push(`  --pixel-width: calc(100cqw / ${width});`);
    lines.push(`  --pixel-height: calc(100cqh / ${height});`);
  } else if (sizing === "pixel") {
    lines.push(`  --pixel-width: calc(1px * var(--scale, ${scale}));`);
    lines.push(`  --pixel-height: calc(1px * var(--scale, ${scale}));`);
  } else {
    // percent
    lines.push(`  --pixel-width: calc(100% / ${width});`);
    lines.push(`  --pixel-height: calc(100% / ${height});`);
  }

  return lines.join("\n");
}

/** Naive but safe minifier: drops comments and collapses insignificant whitespace. */
function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .replace(/\s+/g, " ")
    .trim();
}
