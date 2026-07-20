#!/usr/bin/env node
import { basename } from "node:path";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  animateImageToCss,
  buildExampleHtml,
  convertAnimated,
  decodeFilesToFrames,
  imageToCss,
} from "./index.js";
import type { Options } from "./types.js";

const HELP = `pixel-css — convert an image into pure CSS pixel-art with a controllable palette

Usage:
  pixel-css <input> [options]

Options:
  -o, --out <file>            Write CSS here (default: stdout)
      --meta <file>           Also write metadata JSON here
      --html <file>           Also write a complete example HTML page (links --out)
      --animate               Treat input as animated (GIF/WebP): emit CSS
                              keyframes that play it (no JS, no custom element)
      --anim-mode <mode>      palette | frames | overlay (default: palette)
                                palette: cycle --color-* vars (compact; art whose
                                  pixels don't move — water/fire/neon)
                                frames: swap whole background-image per frame
                                  (any animation; per-frame raster cached, layer-
                                  promoted; larger CSS)
                                overlay: static base + a mostly-transparent
                                  overlay that animates only the changing pixels
                                overlay-palette: overlay, but the moving region
                                  cycles the palette (only --color-* values change)
      --max-frames <n>        Sample down to at most n frames (evenly spaced)
      --change-threshold <n>  overlay: min per-channel color delta (0-255) for a
                              pixel to count as animated (default 16; filters noise)
      --no-will-change        Omit the will-change hint (frames mode)
      --inline-static-colors  Inline non-animating colors as literals; keep only
                              animating colors as --color-* variables (palette anim)
      --inline-palette        Inline ALL colors as literals; emit no --color-*
                              palette (static + frames; smaller, not recolorable)
      --duration <s>          Animation loop duration in seconds (default: from GIF)
      --resize <w>            Downscale to width w before converting (nearest)
      --single-element        Paint on one element (no layer divs); 1 layer only
      --max-colors <n>        Quantize to at most n colors (default: all; anim: 64)
      --max-colors-static <n> overlay-palette: colors for the static base (rich)
      --max-colors-animated <n> overlay-palette: colors for the animated overlay (few)
      --alpha-threshold <n>   Alpha (0-255) below which a pixel is transparent (default: 128)
      --alpha-mode <mode>     binary | keep (default: binary)
      --scale <n>             Zoom multiplier written to --scale (default: 1)
      --sizing <mode>         container | percent | pixel (default: container)
      --chunk <n>             Rows per background layer (default: 50)
      --max-stops <n>         Max color stops per layer before splitting (default: 4000)
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
      animate: { type: "boolean" },
      "anim-mode": { type: "string" },
      "max-frames": { type: "string" },
      "change-threshold": { type: "string" },
      "no-will-change": { type: "boolean" },
      "inline-static-colors": { type: "boolean" },
      "inline-palette": { type: "boolean" },
      duration: { type: "string" },
      resize: { type: "string" },
      "single-element": { type: "boolean" },
      "max-colors": { type: "string" },
      "max-colors-static": { type: "string" },
      "max-colors-animated": { type: "string" },
      "alpha-threshold": { type: "string" },
      "alpha-mode": { type: "string" },
      scale: { type: "string" },
      sizing: { type: "string" },
      chunk: { type: "string" },
      "max-stops": { type: "string" },
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
    maxColorsStatic: num(values["max-colors-static"]),
    maxColorsAnimated: num(values["max-colors-animated"]),
    alphaThreshold: num(values["alpha-threshold"]),
    alphaMode: values["alpha-mode"] as Options["alphaMode"],
    scale: num(values.scale),
    resize: num(values.resize),
    singleElement: values["single-element"],
    duration: num(values.duration),
    animationMode: values["anim-mode"] as Options["animationMode"],
    maxFrames: num(values["max-frames"]),
    changeThreshold: num(values["change-threshold"]),
    willChange: values["no-will-change"] ? false : undefined,
    inlineStaticColors: values["inline-static-colors"],
    inlinePalette: values["inline-palette"],
    sizing: values.sizing as Options["sizing"],
    layerChunkSize: num(values.chunk),
    maxStopsPerLayer: num(values["max-stops"]),
    cssVarPrefix: values.prefix,
    selector: values.selector,
    paletteSelector: values["palette-selector"],
    colorFormat: values.format as Options["colorFormat"],
    emitMeta: Boolean(values.meta),
    emitHtml: Boolean(values.html),
    emitAtProperty: values["at-property"],
    minify: values.minify,
  };

  let result;
  if (values.animate && positionals.length > 1) {
    // Multiple inputs = a frame sequence (e.g. sprite1.png sprite2.png …).
    const perFrameMs = options.duration
      ? (options.duration * 1000) / positionals.length
      : 100;
    const frames = await decodeFilesToFrames(
      positionals,
      options.resize,
      perFrameMs,
    );
    result = convertAnimated(frames, options);
  } else if (values.animate) {
    result = await animateImageToCss(input, options);
  } else {
    result = await imageToCss(input, options);
  }
  const { css, meta, html } = result;

  // Chrome/Blink stops substituting custom properties past roughly 50k `var()`
  // references in a single property value: it drops the whole declaration and
  // the element renders blank (WebKit is unaffected). Wide single-element output
  // packs every row's stops — each a `var(--pixel-width)` / `var(--color-*)` —
  // into one `background-image` value and can blow past this. `--inline-palette`
  // makes that value var-free and fixes it. Warn rather than fail silently.
  const BLINK_VAR_LIMIT = 50_000;
  let maxVars = 0;
  for (const m of css.matchAll(/background-image:\s*([^;]*)/g)) {
    const n = (m[1]!.match(/var\(/g) ?? []).length;
    if (n > maxVars) maxVars = n;
  }
  if (maxVars > BLINK_VAR_LIMIT) {
    process.stderr.write(
      `warning: a background-image value has ${maxVars.toLocaleString("en-US")} var() references, ` +
        `over the ~${BLINK_VAR_LIMIT.toLocaleString("en-US")} Chrome/Blink substitutes per value. ` +
        `Chrome will drop the declaration and render blank (Safari is unaffected). ` +
        `Add --inline-palette (var-free gradients), or drop --single-element for multi-layer output.\n`,
    );
  }

  if (values.out) {
    await writeFile(values.out, css, "utf8");
    const anim = meta.animation
      ? meta.animation.animatedSlots !== undefined
        ? `, ${meta.animation.mode} mode: ${meta.animation.frames} frames → ${meta.animation.animatedSlots} animated slots @ ${meta.animation.duration}s`
        : `, ${meta.animation.mode} mode: ${meta.animation.frames} frames @ ${meta.animation.duration}s`
      : "";
    process.stderr.write(
      `Wrote ${values.out} (${meta.width}x${meta.height}, ${meta.colors.length} colors, ${meta.layerCount} layers${anim})\n`,
    );
  } else {
    process.stdout.write(css);
  }

  if (values.meta) {
    await writeFile(values.meta, JSON.stringify(meta, null, 2), "utf8");
    process.stderr.write(`Wrote ${values.meta}\n`);
  }
  if (values.html) {
    // A complete, openable page that links the actual --out CSS file by name
    // (falls back to a sensible default when writing CSS to stdout).
    const cssHref = values.out ? basename(values.out) : undefined;
    const page = cssHref ? buildExampleHtml(meta, cssHref) : html;
    await writeFile(values.html, page ?? "", "utf8");
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
