// Color-cycling waterfall — the most efficient palette animation the library can
// make, at the GIF's native 640×286:
//   • layered (multi-layer) static base   • animation cropped to just the pixels
//   that change (overlay-palette)          • static colors inlined as literals
// Shown next to the original GIF for comparison. Size badge baked in.
// Run from the pixel-css dir: node examples/waterfall-colorcycle/gen.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sizeText, fileSize, backLink, cmdBlock, CLI } from "../../scripts/example-utils.mjs";

const CMD = "pixel-css monkey_island_waterfal.gif --animate --anim-mode overlay-palette \\\n  --inline-static-colors --max-colors-static 256 --max-colors-animated 24 -o waterfall.css";

const dir = fileURLToPath(new URL(".", import.meta.url));
const gif = fileURLToPath(new URL("../assets/monkey_island_waterfal.gif", import.meta.url));
const css = `${dir}/waterfall.css`, meta = `${dir}/waterfall.json`;

execFileSync("node", [CLI, gif,
  // Split the palette: a rich static base (256 — the background is rasterized
  // once) and a small animated palette (24 — the cycling water). The animation
  // lives on the overlay element, so only it recalculates styles each tick, not
  // the many-layer base. Result: a crisp background AND smooth cycling (~40 fps),
  // where a single 48-colour palette on the container ran at ~10 fps.
  "--animate", "--anim-mode", "overlay-palette", "--inline-static-colors",
  "--max-colors-static", "256", "--max-colors-animated", "24",
  "-o", css, "--meta", meta], { stdio: "inherit" });

const m = JSON.parse(readFileSync(meta, "utf8"));
const layers = Array.from({ length: m.layerCount }, () => `<div class="pixel-image__layer"></div>`).join("");

writeFileSync(`${dir}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>pixel-css — waterfall, color cycling (vs original GIF)</title>
<link rel="stylesheet" href="waterfall.css">
<style>
  body{margin:0;padding:24px;background:#0b0f14;color:#e6e6e6;font-family:system-ui,sans-serif}
  h1{font-size:19px}
  p{max-width:64ch;color:#aab;font-size:13px}
  .row{display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start;margin-top:14px}
  figure{margin:0}
  figcaption{font-size:12px;color:#9aa7b8;margin-top:8px;line-height:1.5}
  .sz{color:#9fd;font-family:monospace}
  .pixel-image{width:min(640px,92vw);zoom:2}
  .orig{width:min(640px,92vw);aspect-ratio:640/286;image-rendering:pixelated;display:block;zoom:2}
</style></head><body>
  <h1>Waterfall — color cycling, pure CSS</h1>
  <p>Palette animation the efficient way, native 640×286: a layered static base
  quantized richly (256 colors, rasterized once), an overlay covering <em>only</em>
  the flowing water with a small 24-color animated palette, and the animation on
  the overlay element so per-tick style recalc is scoped to it — the rich base is
  a sibling and never recalculates. Crisp background + smooth cycling (~40 fps vs
  ~10 with one 48-color palette on the container). Original GIF on the right.</p>
  <div class="row">
    <figure>
      <div class="pixel-image palette" role="img" aria-label="waterfall, CSS color cycling">${layers}<div class="pixel-image__overlay"></div></div>
      <figcaption><b>Pure CSS</b> · ${m.layerCount} base layers + 1 overlay · ${m.animation.animatedSlots} cycling colors<br><span class="sz">CSS: ${sizeText(css)}</span></figcaption>
    </figure>
    <figure>
      <img class="orig" src="../assets/monkey_island_waterfal.gif" alt="original waterfall GIF">
      <figcaption><b>Original GIF</b><br><span class="sz">file: ${fileSize(gif)}</span></figcaption>
    </figure>
  </div>
  ${cmdBlock(CMD)}
  ${backLink()}
</body></html>
`);
console.log(`waterfall-colorcycle: ${m.layerCount} layers, ${m.animation.animatedSlots} slots, CSS ${sizeText(css)}`);
