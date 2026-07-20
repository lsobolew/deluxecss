// Amiga color-cycling art straight from an IFF ILBM file. The .iff carries its
// animation as a palette-cycle range (CCRT/CRNG chunk); pixel-css decodes the
// file, reads the range, and renders the exact cycle as pure CSS overlay-palette
// — no GIF, no frame sampling. Run from the pixel-css dir:
//   node examples/artificial-heart/gen.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sizeText, CLI } from "../../scripts/example-utils.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const iff = fileURLToPath(new URL("../assets/ljl_ArtificialHeart.iff", import.meta.url));
const css = `${dir}/heart.css`, meta = `${dir}/heart.json`;

execFileSync("node", [CLI, iff,
  "--animate", "--anim-mode", "overlay-palette", "--inline-static-colors",
  "-o", css, "--meta", meta], { stdio: "inherit" });

const m = JSON.parse(readFileSync(meta, "utf8"));
const layers = Array.from({ length: m.layerCount }, () => `<div class="pixel-image__layer"></div>`).join("");

writeFileSync(`${dir}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>pixel-css — Artificial Heart (IFF color cycling)</title>
<link rel="stylesheet" href="heart.css">
<style>
  body{margin:0;padding:24px;background:#0b0f14;color:#e6e6e6;font-family:system-ui,sans-serif}
  h1{font-size:19px} p{max-width:64ch;color:#aab;font-size:13px}
  .pixel-image{width:min(640px,92vw);image-rendering:pixelated}
  .sz{color:#9fd;font-family:monospace}
</style></head><body>
  <h1>Artificial Heart — Amiga color cycling, pure CSS</h1>
  <p>Decoded straight from <code>ljl_ArtificialHeart.iff</code> (IFF ILBM, 320×200,
  32 colors). The file's <code>CCRT</code> chunk defines a palette-cycle over
  ${m.animation.animatedSlots} entries; pixel-css reads that range and reproduces
  the <em>exact</em> cycle — ${m.animation.frames} frames @ ${m.animation.duration}s —
  as an overlay-palette animation, with the static art inlined. No GIF, no sampling.</p>
  <div class="pixel-image palette" role="img" aria-label="Artificial vs natural heart, Amiga color-cycling art">${layers}<div class="pixel-image__overlay"></div></div>
  <p class="sz">CSS: ${sizeText(css)}</p>
</body></html>
`);
console.log(`artificial-heart: ${m.layerCount} layers, ${m.animation.animatedSlots} cycling slots, ${m.animation.frames} frames, CSS ${sizeText(css)}`);
