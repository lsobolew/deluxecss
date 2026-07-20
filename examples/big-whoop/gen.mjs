// Big Whoop (big_whoop.png, 632×144) as pure CSS, several ways on one page:
//  - two methods at full palette: single-layer (one element) vs multi-layer
//  - retro palettes: CGA 4, EGA 16, VGA 256 colors (multi-layer)
//  - the original PNG (image-rendering: pixelated) for comparison
// Each variant gets its own selector so they can coexist, a size caption, and
// its own standalone page (linked from its tile). Run from the pixel-css dir:
//   node examples/big-whoop/gen.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sizeText, backLink, cmdBlock, CLI } from "../../scripts/example-utils.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const src = fileURLToPath(new URL("../assets/big_whoop.png", import.meta.url));

// [name, selector, extra CLI args]. VGA (256) is omitted as a separate file:
// big_whoop has only 175 unique colors (< 256), so a VGA rendition is byte-for-
// byte the full-palette multi-layer one — the VGA tile below just reuses it.
const variants = [
  // single-element must use percent sizing: an element can't resolve cqw/cqh
  // against itself (only descendants can), so container mode would garble it.
  ["single", ".bw-single", ["--single-element", "--inline-palette", "--sizing", "percent"]],
  ["multi", ".bw-multi", ["--inline-palette"]],
  ["cga", ".bw-cga", ["--max-colors", "4", "--inline-palette"]],
  ["ega", ".bw-ega", ["--max-colors", "16", "--inline-palette"]],
];

const info = {};
const cmdFor = {};
for (const [name, sel, extra] of variants) {
  const css = `${dir}/${name}.css`, meta = `${dir}/${name}.json`;
  execFileSync("node", [CLI, src, ...extra, "--selector", sel, "-o", css, "--meta", meta], { stdio: "inherit" });
  const m = JSON.parse(readFileSync(meta, "utf8"));
  info[name] = { sel: sel.slice(1), layers: m.layerCount, colors: m.colors.length, size: sizeText(css) };
  // The user-facing command (no demo-only --selector/--meta plumbing).
  cmdFor[name] = `pixel-css big_whoop.png ${extra.join(" ")} -o big-whoop.css`;
  rmSync(meta);
}
cmdFor.vga = cmdFor.multi; // VGA reuses the full-palette multi-layer output

const FRAME_CSS = `.frame,.orig{width:min(632px,90vw);aspect-ratio:632/144;outline:1px solid #232a33}
  .orig{image-rendering:pixelated;display:block;height:auto}`;

// Renders one rendition's element (single-element has no child layers).
const el = (sel, cssFile, layers, label) => {
  const inner = cssFile === "single.css"
    ? "" // single-element paints on the container itself
    : Array.from({ length: layers }, () => `<div class="${sel}__layer"></div>`).join("");
  return `<div class="${sel} frame" role="img" aria-label="Big Whoop, ${label}">${inner}</div>`;
};

// Each rendition also gets a standalone page (just the image + a back link).
const standalone = (slug, cssFile, sel, layers, title, sub) => {
  writeFileSync(`${dir}/${slug}.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>pixel-css — Big Whoop (${title})</title>
<link rel="stylesheet" href="${cssFile}">
<style>
  body{margin:0;padding:28px;background:#0b0f14;color:#e6e6e6;font-family:system-ui,sans-serif}
  h1{font-size:17px} figcaption{font-size:12px;color:#9aa7b8;margin-top:8px}
  .sz{color:#9fd;font-family:monospace}
  ${FRAME_CSS}
  .frame{zoom:2}
</style></head><body>
  <h1>Big Whoop — ${title}</h1>
  <figure style="margin:0">
    ${el(sel, cssFile, layers, title)}
    <figcaption>${sub}</figcaption>
  </figure>
  ${cmdBlock(cmdFor[slug])}
  ${backLink()}
</body></html>
`);
};

// [slug, cssFile, sel, layers, title, subcaption]
const tiles = [
  ["single", "single.css", "bw-single", info.single.layers, "Single layer (one element)", `${info.single.colors} colors · 1 layer · <span class="sz">${info.single.size}</span>`],
  ["multi", "multi.css", "bw-multi", info.multi.layers, "Multi-layer (div stack)", `${info.multi.colors} colors · ${info.multi.layers} layers · <span class="sz">${info.multi.size}</span>`],
  ["cga", "cga.css", "bw-cga", info.cga.layers, "CGA — 4 colors", `${info.cga.colors} colors · ${info.cga.layers} layers · <span class="sz">${info.cga.size}</span>`],
  ["ega", "ega.css", "bw-ega", info.ega.layers, "EGA — 16 colors", `${info.ega.colors} colors · ${info.ega.layers} layers · <span class="sz">${info.ega.size}</span>`],
  ["vga", "multi.css", "bw-multi", info.multi.layers, "VGA — 256 colors", `${info.multi.colors} colors ≤ 256 · <span class="sz">= full palette</span>`],
];
for (const [slug, cssFile, sel, layers, title, sub] of tiles) standalone(slug, cssFile, sel, layers, title, sub);

const tile = (slug, sel, cssFile, layers, title, sub) => `<figure style="margin:0">
    <a href="${slug}.html">${el(sel, cssFile, layers, title)}</a>
    <figcaption><a href="${slug}.html" style="color:#6db3ff">${title} ↗</a><br>${sub}</figcaption>
  </figure>`;

writeFileSync(`${dir}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>pixel-css — Big Whoop (static image, methods & palettes)</title>
${["single", "multi", "cga", "ega"].map((n) => `<link rel="stylesheet" href="${n}.css">`).join("\n")}
<style>
  body{margin:0;padding:28px;background:#0b0f14;color:#e6e6e6;font-family:system-ui,sans-serif}
  h1{font-size:20px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#7f8ea3;margin:28px 0 10px;border-bottom:1px solid #232a33;padding-bottom:6px}
  .row{display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start}
  figure{margin:0}
  figcaption{font-size:12px;color:#9aa7b8;margin-top:8px;line-height:1.5}
  a{text-decoration:none}
  .sz{color:#9fd;font-family:monospace}
  ${FRAME_CSS}
</style></head><body>
  <h1>Big Whoop — <code>big_whoop.png</code> (632×144) as pure CSS</h1>
  <p style="font-size:12px;color:#7f8ea3">Each rendition links to its own page ↗</p>

  <h2>Two methods · full palette</h2>
  <div class="row">
    <figure style="margin:0">
      <img class="orig" src="../assets/big_whoop.png" alt="original big_whoop.png">
      <figcaption><b>Original PNG</b><br><code>image-rendering: pixelated</code></figcaption>
    </figure>
    ${tile("single", "bw-single", "single.css", info.single.layers, "Single layer (one element)", info.single.colors + " colors · <span class=\"sz\">" + info.single.size + "</span>")}
    ${tile("multi", "bw-multi", "multi.css", info.multi.layers, "Multi-layer (div stack)", info.multi.colors + " colors · " + info.multi.layers + " layers · <span class=\"sz\">" + info.multi.size + "</span>")}
  </div>

  <h2>Retro palettes · multi-layer</h2>
  <div class="row">
    ${tile("cga", "bw-cga", "cga.css", info.cga.layers, "CGA — 4 colors", info.cga.colors + " colors · <span class=\"sz\">" + info.cga.size + "</span>")}
    ${tile("ega", "bw-ega", "ega.css", info.ega.layers, "EGA — 16 colors", info.ega.colors + " colors · <span class=\"sz\">" + info.ega.size + "</span>")}
    ${tile("vga", "bw-multi", "multi.css", info.multi.layers, "VGA — 256 colors", info.multi.colors + " colors ≤ 256")}
  </div>
  ${backLink()}
</body></html>
`);

console.log("big-whoop sizes:");
for (const [n] of variants) console.log(`  ${n}: ${info[n].size} (${info[n].colors} colors, ${info[n].layers} layers)`);
