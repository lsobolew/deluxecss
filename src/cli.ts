#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  animateImageToCss,
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
      --html <file>           Also write a demo HTML fragment here
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
      --palette-keyframes <m> per-color | combined | <n> (default per-color):
                              one @keyframes per color, one for all, or grouped
                              into @keyframes of n colors each
      --no-will-change        Omit the will-change hint (frames mode)
      --bg-in-keyframes       Deliver background-image via a held @keyframes rule
                              (compositing-layer promotion; single or per-layer)
      --inline-static-colors  Inline non-animating colors as literals; keep only
                              animating colors as --color-* variables (palette anim)
      --inline-palette        Inline ALL colors as literals; emit no --color-*
                              palette (static + frames; smaller, not recolorable)
      --duration <s>          Animation loop duration in seconds (default: from GIF)
      --resize <w>            Downscale to width w before converting (nearest)
      --single-element        Paint on one element (no layer divs); 1 layer only
      --max-colors <n>        Quantize to at most n colors (default: all; anim: 64)
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
      animate: { type: "boolean" },
      "anim-mode": { type: "string" },
      "max-frames": { type: "string" },
      "change-threshold": { type: "string" },
      "palette-keyframes": { type: "string" },
      "no-will-change": { type: "boolean" },
      "bg-in-keyframes": { type: "boolean" },
      "inline-static-colors": { type: "boolean" },
      "inline-palette": { type: "boolean" },
      duration: { type: "string" },
      resize: { type: "string" },
      "single-element": { type: "boolean" },
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
    resize: num(values.resize),
    singleElement: values["single-element"],
    duration: num(values.duration),
    animationMode: values["anim-mode"] as Options["animationMode"],
    maxFrames: num(values["max-frames"]),
    changeThreshold: num(values["change-threshold"]),
    paletteKeyframes: parsePaletteKeyframes(values["palette-keyframes"]),
    willChange: values["no-will-change"] ? false : undefined,
    backgroundInKeyframes: values["bg-in-keyframes"],
    inlineStaticColors: values["inline-static-colors"],
    inlinePalette: values["inline-palette"],
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

  // Blink (Chrome) discards any single CSS property value longer than 2^21
  // (~2 MiB) characters — the declaration is dropped and the element renders
  // blank. WebKit (Safari) has no such cap. Single-element output packs every
  // row into one `background-image` value, so it can blow past this; warn rather
  // than let it fail silently in Chrome only.
  const BLINK_VALUE_CAP = 2 ** 21; // 2,097,152
  let maxValueLen = 0;
  for (const m of css.matchAll(/background-image:\s*([^;]*)/g)) {
    if (m[1]!.length > maxValueLen) maxValueLen = m[1]!.length;
  }
  if (maxValueLen > BLINK_VALUE_CAP) {
    process.stderr.write(
      `warning: a background-image value is ${maxValueLen.toLocaleString("en-US")} chars, ` +
        `over Chrome/Blink's ${BLINK_VALUE_CAP.toLocaleString("en-US")}-char (2^21) cap for a single CSS value. ` +
        `Chrome will drop it and render blank (Safari is unaffected). ` +
        `Drop --single-element for multi-layer output, or reduce --resize/--max-frames.\n`,
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

function parsePaletteKeyframes(
  v: string | undefined,
): Options["paletteKeyframes"] {
  if (v === undefined) return undefined;
  if (v === "per-color" || v === "combined") return v;
  const n = Number(v);
  if (Number.isNaN(n)) {
    throw new Error(`--palette-keyframes: expected per-color|combined|<number>, got "${v}"`);
  }
  return n;
}

main().catch((err: unknown) => {
  process.stderr.write(`pixel-css: ${(err as Error).message}\n`);
  process.exit(1);
});
