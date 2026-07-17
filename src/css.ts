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

  const blocks: string[] = [];

  // @property registration — lets palette colors interpolate when transitioned.
  if (emitAtProperty) {
    for (let i = 0; i < colors.length; i++) {
      blocks.push(
        `@property --${cssVarPrefix}-${i} {\n  syntax: "<color>";\n  inherits: true;\n  initial-value: ${colors[i]};\n}`,
      );
    }
  }

  // Palette custom properties.
  const paletteVars = colors
    .map((c, i) => `  --${cssVarPrefix}-${i}: ${c};`)
    .join("\n");
  blocks.push(`${paletteSelector} {\n${paletteVars}\n}`);

  // Container / sizing (+ background painted directly on it in single-element mode).
  let containerBody = sizingDecls(width, height, sizing, scale);
  if (single && layers.length === 1) {
    const layer = layers[0]!;
    containerBody +=
      `\n  background-repeat: no-repeat;` +
      `\n  background-size: 100% var(--pixel-height);` +
      `\n  background-image: ${layer.backgroundImage};` +
      `\n  background-position: ${layer.backgroundPosition};`;
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
      blocks.push(
        `${selector} > .${layerClass}:nth-child(${i + 1}) {\n` +
          `  background-image: ${layer.backgroundImage};\n` +
          `  background-position: ${layer.backgroundPosition};\n` +
          `}`,
      );
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
