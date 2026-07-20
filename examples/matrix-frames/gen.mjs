// Frame-by-frame animation at the edge of practicality: a few seconds of the
// Matrix clip, high colour fidelity (not the usual tight palette), rendered the
// only way that scales — multi-layer (var-free), then split across files so no
// single file is unwieldy. This is the "how far can frames mode go" demo.
// Run from the repo root: node examples/matrix-frames/gen.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sizeText, backLink, cmdBlock, CLI } from "../../scripts/example-utils.mjs";

const dir = fileURLToPath(new URL(".", import.meta.url));
const framesDir = fileURLToPath(new URL("../../../10m/", import.meta.url));
const N = 216;           // 9 s at 24 fps
const TARGET_MB = 25;

const frames = Array.from({ length: N }, (_, i) => `${framesDir}matrix_${String(i).padStart(3, "0")}.png`);
const full = `${dir}/_full.css`, meta = `${dir}/_full.json`;

execFileSync("node", [CLI, ...frames,
  "--animate", "--anim-mode", "frames", "--duration", "9",
  "--resize", "256", "--max-colors", "256", // high fidelity, not the usual tight palette
  "--inline-palette", "--chunk", "20",
  "-o", full, "--meta", meta], { stdio: "inherit" });

const css = readFileSync(full, "utf8");
const layerCount = JSON.parse(readFileSync(meta, "utf8")).layerCount;

// Split whole rules into files under the budget (a single @keyframes stays intact).
const rules = css.split("\n\n").filter((r) => r.trim());
const files = [];
let cur = [], len = 0;
for (const rule of rules) {
  if (len + rule.length > TARGET_MB * 1e6 && cur.length) { files.push(cur.join("\n\n") + "\n"); cur = []; len = 0; }
  cur.push(rule); len += rule.length + 2;
}
if (cur.length) files.push(cur.join("\n\n") + "\n");

const paths = [];
const links = files.map((body, i) => { const p = `${dir}/part-${i}.css`; writeFileSync(p, body); paths.push(p); return `<link rel="stylesheet" href="part-${i}.css">`; });
const layers = Array.from({ length: layerCount }, () => `<div class="pixel-image__layer"></div>`).join("");

writeFileSync(`${dir}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>deluxecss — Matrix, ${N} frames (limits of frame animation)</title>
${links.join("\n")}
<style>
  body{margin:0;padding:24px;background:#0b0f14;color:#e6e6e6;font-family:system-ui,sans-serif}
  h1{font-size:19px} p{max-width:64ch;color:#aab;font-size:13px}
  .pixel-image{width:min(512px,92vw);margin-top:14px;zoom:2}
  .sz{color:#9fd;font-family:monospace}
</style></head><body>
  <h1>Matrix — ${N} frames (${(N / 24).toFixed(1)} s @ 24 fps)</h1>
  <p>Frame-by-frame at high colour fidelity (up to 256 colours, no tight palette).
  This is where the technique strains: ${files.length} stylesheet files, split so
  none is unwieldy, ${layerCount} layers, var-free. Slow first paint — the browser
  parses it all before frame one, then plays.</p>
  <p class="sz">CSS: ${sizeText(paths)} · across ${files.length} files</p>
  <div class="pixel-image palette" role="img" aria-label="Matrix film clip, frame-by-frame CSS">${layers}</div>
  ${cmdBlock(
    `deluxecss 10m/matrix_{000..${String(N - 1).padStart(3, "0")}}.png --animate --anim-mode frames \\\n` +
    `  --duration 9 --resize 256 --max-colors 256 --inline-palette --chunk 20 -o matrix.css\n` +
    `# then split matrix.css into ${files.length} part-*.css files (see gen.mjs)`,
  )}
  ${backLink()}
</body></html>
`);

rmSync(full); rmSync(meta);
console.log(`matrix-frames: ${N} frames, ${layerCount} layers, ${files.length} files, ${sizeText(paths)}`);
