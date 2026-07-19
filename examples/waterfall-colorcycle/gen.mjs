// Color-cycling waterfall — the most efficient palette animation the library can
// make, at the GIF's native 640×286:
//   • layered (multi-layer) static base   • animation cropped to just the pixels
//   that change (overlay-palette)          • static colors inlined as literals
// Shown next to the original GIF for comparison. Size badge baked in.
// Run from the pixel-css dir: node examples/waterfall-colorcycle/gen.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sizeText, CLI } from "../../scripts/example-utils.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const gif = fileURLToPath(new URL("../../../monkey_island_waterfal.gif", import.meta.url));
const css = `${dir}/waterfall.css`, meta = `${dir}/waterfall.json`;

execFileSync("node", [CLI, gif,
  "--animate", "--anim-mode", "overlay-palette", "--inline-static-colors",
  "--max-colors", "48", "-o", css, "--meta", meta], { stdio: "inherit" });

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
  .pixel-image{width:min(640px,92vw)}
  .orig{width:min(640px,92vw);aspect-ratio:640/286;image-rendering:pixelated;display:block}
</style></head><body>
  <h1>Waterfall — color cycling, pure CSS</h1>
  <p>Palette animation the efficient way: a layered static base, an overlay that
  covers <em>only</em> the pixels that change (the flowing water), and the static
  colors written in as literals so only the ~500 cycling slots are variables.
  Native 640×286. The original GIF (which is itself palette-cycled) is on the right.</p>
  <div class="row">
    <figure>
      <div class="pixel-image palette" role="img" aria-label="waterfall, CSS color cycling">${layers}<div class="pixel-image__overlay"></div></div>
      <figcaption><b>Pure CSS</b> · ${m.layerCount} base layers + 1 overlay · ${m.animation.animatedSlots} cycling colors<br><span class="sz">CSS: ${sizeText(css)}</span></figcaption>
    </figure>
    <figure>
      <img class="orig" src="../assets/monkey_island_waterfal.gif" alt="original waterfall GIF">
      <figcaption><b>Original GIF</b><br><span class="sz">for comparison</span></figcaption>
    </figure>
  </div>
</body></html>
`);
console.log(`waterfall-colorcycle: ${m.layerCount} layers, ${m.animation.animatedSlots} slots, CSS ${sizeText(css)}`);
