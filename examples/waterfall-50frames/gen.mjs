// Generate the full 50-frame waterfall and split it across several small files.
//
// Single-element output can't be split — its animation is one giant @keyframes
// rule. Multi-layer output has one @keyframes PER layer, so the stylesheet can
// be cut at rule boundaries into part-0.css … part-N.css (each a whole set of
// rules) and reassembled in the browser with one <link> per part.
//
// Run from the pixel-css dir:  node examples/waterfall-50frames/gen.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL(".", import.meta.url));
const gif = fileURLToPath(new URL("../../../monkey_island_waterfal.gif", import.meta.url));
const cli = fileURLToPath(new URL("../../dist/cli.js", import.meta.url));
const TARGET_MB = 25;

// 1. Generate multi-layer frames (var-free via --inline-palette, chunk 20 so each
//    layer's @keyframes is a few MB), to a temp file.
const tmp = `${dir}/_full.css`;
const tmpMeta = `${dir}/_full.json`;
execFileSync("node", [
  cli, gif,
  "--animate", "--anim-mode", "frames",
  "--max-frames", "50", "--max-colors", "48",
  "--inline-palette", "--chunk", "20",
  "-o", tmp, "--meta", tmpMeta,
], { stdio: "inherit" });

const css = readFileSync(tmp, "utf8");
const layerCount = JSON.parse(readFileSync(tmpMeta, "utf8")).layerCount;

// 2. Pack whole rules (split on blank lines — rules never contain one) into files
//    under the byte budget. A single @keyframes always stays intact.
const rules = css.split("\n\n").filter((r) => r.trim());
const files = [];
let cur = [], curLen = 0;
for (const rule of rules) {
  if (curLen + rule.length > TARGET_MB * 1e6 && cur.length) {
    files.push(cur.join("\n\n") + "\n"); cur = []; curLen = 0;
  }
  cur.push(rule); curLen += rule.length + 2;
}
if (cur.length) files.push(cur.join("\n\n") + "\n");

// 3. Write the parts + an index.html that links them all.
const links = files.map((body, i) => {
  writeFileSync(`${dir}/part-${i}.css`, body);
  return `<link rel="stylesheet" href="part-${i}.css">`;
});
const layers = Array.from({ length: layerCount }, () => `<div class="pixel-image__layer"></div>`).join("");
writeFileSync(`${dir}/index.html`, `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>pixel-css — waterfall, all 50 frames (split across ${files.length} files)</title>
${links.join("\n")}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f14}</style>
</head><body>
  <div class="pixel-image palette" role="img" aria-label="Monkey Island waterfall, 50-frame CSS animation">${layers}</div>
</body></html>
`);

rmSync(tmp); rmSync(tmpMeta);
console.log(`${files.length} parts (MB): ${files.map((f) => (f.length / 1e6).toFixed(1)).join(", ")}  total=${(css.length / 1e6).toFixed(1)}MB, ${layerCount} layers`);
