import type { Layer } from "./layers.js";
import type { IndexedImage, ResolvedOptions } from "./types.js";

export interface CssParts {
  css: string;
  layerClass: string;
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
    emitAtProperty,
    minify,
  } = opts;

  const single = opts.singleElement;
  if (single && layers.length > 1) {
    throw new Error(
      `singleElement requires the image to fit in one layer, but it needs ${layers.length}. ` +
        `Increase layerChunkSize/maxStopsPerLayer, or set singleElement: false.`,
    );
  }

  const baseClass = selector.startsWith(".") ? selector.slice(1) : selector;
  const layerClass = `${baseClass}__layer`;

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
  // With an empty paletteIndices set (inlinePalette) there are no variables at
  // all, so skip the palette rule entirely rather than emit an empty block.
  const paletteVars = colors
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => !paletteIndices || paletteIndices.has(i))
    .map(({ c, i }) => `  --${cssVarPrefix}-${i}: ${c};`)
    .join("\n");
  if (paletteVars.length > 0) {
    blocks.push(`${paletteSelector} {\n${paletteVars}\n}`);
  }

  // Container / sizing (+ background painted directly on it in single-element mode).
  let containerBody = sizingDecls(width, height, sizing, scale);
  if (single && layers.length === 1) {
    const layer = layers[0]!;
    containerBody +=
      `\n  background-repeat: no-repeat;` +
      `\n  background-size: 100% var(--pixel-height);`;
    if (paintBackground) {
      containerBody +=
        `\n  background-image: ${layer.backgroundImage};` +
        `\n  background-position: ${layer.backgroundPosition};`;
    }
    // paintBackground === false: caller animates background-image + -position
    // via @keyframes (frames mode); leave the element with only size/repeat.
  }
  blocks.push(`${selector} {\n${containerBody}\n}`);

  // Layers (child `<div>`s in a grid overlay). Single-element paints on the
  // container above, so no children are emitted.
  if (!single) {
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
    if (paintBackground) {
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i]!;
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
  return { css, layerClass };
}

function sizingDecls(
  width: number,
  height: number,
  sizing: ResolvedOptions["sizing"],
  scale: number,
): string {
  const lines: string[] = [];
  lines.push("  display: grid;");
  // Container mode is fully responsive: the pixel grid is expressed in cqw/cqh
  // (below), so there is no scale factor and no pixel maths in the gradients.
  // The width here is just an overridable default at the image's native size —
  // set any `width` (px, %, vw, …) and the art fills it, height following the
  // aspect-ratio. Other modes keep the `--scale` zoom multiplier.
  if (sizing === "container") {
    lines.push(`  width: ${width}px;`);
    lines.push(`  max-width: 100%;`);
  } else {
    lines.push(`  width: calc(${width}px * var(--scale, ${scale}));`);
  }
  lines.push(`  aspect-ratio: ${width} / ${height};`);
  // Size containment in every mode: the element's size comes from width +
  // aspect-ratio (never its contents), so this is safe and isolates the subtree
  // from outside layout — a free perf hint. In `container` mode it is also what
  // makes cqw/cqh resolve against this element for the child layers.
  lines.push("  container-type: size;");

  if (sizing === "container") {
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
