// Big Whoop (big_whoop.png, 632×144) as pure CSS, several ways on one page:
//  - two methods at full palette: single-layer (one element) vs multi-layer
//  - retro palettes: CGA 4, EGA 16, VGA 256 colors (multi-layer)
//  - the original PNG (image-rendering: pixelated) for comparison
// Each variant gets its own selector so they can coexist, and a size caption
// (raw → gzip). Run from the pixel-css dir: node examples/big-whoop/gen.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sizeText, CLI } from "../../scripts/example-utils.mjs";

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
for (const [name, sel, extra] of variants) {
  const css = `${dir}/${name}.css`, meta = `${dir}/${name}.json`;
  execFileSync("node", [CLI, src, ...extra, "--selector", sel, "-o", css, "--meta", meta], { stdio: "inherit" });
  const m = JSON.parse(readFileSync(meta, "utf8"));
  info[name] = { sel: sel.slice(1), layers: m.layerCount, colors: m.colors.length, size: sizeText(css) };
  rmSync(meta);
}

const box = (name, title) => {
  const { sel, layers, colors, size } = info[name];
  const inner = name === "single"
    ? "" // single-element paints on the container itself
    : Array.from({ length: layers }, () => `<div class="${sel}__layer"></div>`).join("");
  return `<figure>
    <div class="${sel} frame" role="img" aria-label="Big Whoop, ${title}">${inner}</div>
    <figcaption><b>${title}</b><br>${colors} colors · ${layers} layer${layers > 1 ? "s" : ""}<br><span class="sz">${size}</span></figcaption>
  </figure>`;
};

writeFileSync(`${dir}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>pixel-css — Big Whoop (static image, methods & palettes)</title>
${variants.map(([n]) => `<link rel="stylesheet" href="${n}.css">`).join("\n")}
<style>
  body{margin:0;padding:28px;background:#0b0f14;color:#e6e6e6;font-family:system-ui,sans-serif}
  h1{font-size:20px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#7f8ea3;margin:28px 0 10px;border-bottom:1px solid #232a33;padding-bottom:6px}
  .row{display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start}
  figure{margin:0}
  figcaption{font-size:12px;color:#9aa7b8;margin-top:8px;line-height:1.5}
  .sz{color:#9fd;font-family:monospace}
  /* all renditions shown at the same display width; the pixel art fills it */
  .frame,.orig{width:min(632px,90vw);aspect-ratio:632/144;outline:1px solid #232a33}
  .orig{image-rendering:pixelated;display:block;height:auto}
</style></head><body>
  <h1>Big Whoop — <code>big_whoop.png</code> (632×144) as pure CSS</h1>

  <h2>Two methods · full palette</h2>
  <div class="row">
    <figure>
      <img class="orig" src="../assets/big_whoop.png" alt="original big_whoop.png">
      <figcaption><b>Original PNG</b><br><code>image-rendering: pixelated</code><br><span class="sz">raster image</span></figcaption>
    </figure>
    ${box("single", "Single layer (one element)")}
    ${box("multi", "Multi-layer (div stack)")}
  </div>

  <h2>Retro palettes · multi-layer</h2>
  <div class="row">
    ${box("cga", "CGA — 4 colors")}
    ${box("ega", "EGA — 16 colors")}
    <figure>
      <div class="bw-multi frame" role="img" aria-label="Big Whoop, VGA 256 colors">${Array.from({ length: info.multi.layers }, () => `<div class="bw-multi__layer"></div>`).join("")}</div>
      <figcaption><b>VGA — 256 colors</b><br>${info.multi.colors} colors · ${info.multi.layers} layers<br><span class="sz">= full palette (image uses ${info.multi.colors} ≤ 256)</span></figcaption>
    </figure>
  </div>
</body></html>
`);

console.log("big-whoop sizes:");
for (const [n] of variants) console.log(`  ${n}: ${info[n].size} (${info[n].colors} colors, ${info[n].layers} layers)`);
