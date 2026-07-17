#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { imageToCss } from "./index.js";
import type { Options } from "./types.js";

const HELP = `pixel-css — convert an image into pure CSS pixel-art with a controllable palette

Usage:
  pixel-css <input> [options]

Options:
  -o, --out <file>            Write CSS here (default: stdout)
      --meta <file>           Also write metadata JSON here
      --html <file>           Also write a demo HTML fragment here
      --max-colors <n>        Quantize to at most n colors (default: keep all)
      --dither <mode>         floyd-steinberg | atkinson (default: off)
      --alpha-threshold <n>   Alpha (0-255) below which a pixel is transparent (default: 128)
      --alpha-mode <mode>     binary | keep (default: binary)
      --scale <n>             Zoom multiplier written to --scale (default: 1)
      --sizing <mode>         container | percent | pixel (default: container)
      --chunk <n>             Rows per background layer (default: 50)
      --max-stops <n>         Max color stops per layer before splitting (default: 4000)
      --layer-element <mode>  div | pseudo (default: div)
      --prefix <name>         Palette custom-property prefix (default: color)
      --selector <sel>        Container class selector (default: .pixel-image)
      --palette-selector <s>  Selector carrying the palette (default: ":host, .palette")
      --format <fmt>          hex | rgb (default: hex)
      --at-property           Register palette vars with @property (animatable)
      --minify                Minify the CSS output
  -h, --help                  Show this help
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      meta: { type: "string" },
      html: { type: "string" },
      "max-colors": { type: "string" },
      dither: { type: "string" },
      "alpha-threshold": { type: "string" },
      "alpha-mode": { type: "string" },
      scale: { type: "string" },
      sizing: { type: "string" },
      chunk: { type: "string" },
      "max-stops": { type: "string" },
      "layer-element": { type: "string" },
      prefix: { type: "string" },
      selector: { type: "string" },
      "palette-selector": { type: "string" },
      format: { type: "string" },
      "at-property": { type: "boolean" },
      minify: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    process.exit(values.help ? 0 : 1);
  }

  const input = positionals[0]!;
  const options: Options = {
    maxColors: num(values["max-colors"]),
    dither: (values.dither as Options["dither"]) ?? false,
    alphaThreshold: num(values["alpha-threshold"]),
    alphaMode: values["alpha-mode"] as Options["alphaMode"],
    scale: num(values.scale),
    sizing: values.sizing as Options["sizing"],
    layerChunkSize: num(values.chunk),
    maxStopsPerLayer: num(values["max-stops"]),
    layerElement: values["layer-element"] as Options["layerElement"],
    cssVarPrefix: values.prefix,
    selector: values.selector,
    paletteSelector: values["palette-selector"],
    colorFormat: values.format as Options["colorFormat"],
    emitMeta: Boolean(values.meta),
    emitHtml: Boolean(values.html),
    emitAtProperty: values["at-property"],
    minify: values.minify,
  };

  const { css, meta, html } = await imageToCss(input, options);

  if (values.out) {
    await writeFile(values.out, css, "utf8");
    process.stderr.write(
      `Wrote ${values.out} (${meta.width}x${meta.height}, ${meta.colors.length} colors, ${meta.layerCount} layers)\n`,
    );
  } else {
    process.stdout.write(css);
  }

  if (values.meta) {
    await writeFile(values.meta, JSON.stringify(meta, null, 2), "utf8");
    process.stderr.write(`Wrote ${values.meta}\n`);
  }
  if (values.html && html) {
    await writeFile(values.html, html, "utf8");
    process.stderr.write(`Wrote ${values.html}\n`);
  }
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Expected a number, got "${v}"`);
  return n;
}

main().catch((err: unknown) => {
  process.stderr.write(`pixel-css: ${(err as Error).message}\n`);
  process.exit(1);
});
