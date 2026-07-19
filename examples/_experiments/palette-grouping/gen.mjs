// EXPERIMENT — how does grouping the palette-cycling keyframes affect playback?
//
// Same overlay-palette clip, emitted with different `paletteKeyframes` groupings:
//   per-color  → one @keyframes per slot (dedup)   — many small animations
//   1          → groups of 1 (no dedup)
//   12, 64     → groups of N colors per @keyframes  — a middle ground
//   combined   → one @keyframes sets every color    — one big animation
// Decodes once, emits one page per config + an index. The demo server injects
// the FPS meter; open each and compare (also watch first-paint time).
//
//   node examples/_experiments/palette-grouping/gen.mjs
import { decodeFrames, convertAnimated } from "../../../dist/index.js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const GIF = fileURLToPath(new URL("../../../../monkey_island_waterfal.gif", import.meta.url));
const OUT = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const FRAMES = Number(process.env.FRAMES ?? 8); // kept small so `combined` can init
const CONFIGS = (process.env.CONFIGS ?? "per-color,1,12,64,combined").split(",");

const frames = await decodeFrames(GIF); // native 640×286

const slug = (pk) => String(pk).replace(/[^a-z0-9]/gi, "-");
const rows = [];
for (const raw of CONFIGS) {
  const pk = raw === "per-color" || raw === "combined" ? raw : Number(raw);
  const { css, meta, html } = convertAnimated(frames, {
    animationMode: "overlay-palette",
    paletteKeyframes: pk,
    maxFrames: FRAMES,
    maxColors: 48,
    sizing: "pixel",
    emitHtml: true,
  });
  const kf = (css.match(/@keyframes/g) ?? []).length;
  const mb = (Buffer.byteLength(css) / 1048576).toFixed(1);
  writeFileSync(OUT(`pg-${slug(raw)}.css`), css);
  writeFileSync(
    OUT(`pg-${slug(raw)}.html`),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>palette grouping: ${raw} — ${kf} @keyframes</title>
<link rel="stylesheet" href="pg-${slug(raw)}.css">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1b2a;font-family:system-ui}
  h1{position:fixed;top:8px;left:12px;margin:0;font:600 13px system-ui;color:#6f6}</style>
</head><body>
  <h1>paletteKeyframes: ${raw} · ${kf} @keyframes · ${meta.animation.animatedSlots} animated colors · ${meta.width}×${meta.height}</h1>
  ${html}
</body></html>`,
  );
  rows.push({ raw, kf, slots: meta.animation.animatedSlots, mb });
  console.log(`${raw}: ${kf} @keyframes, ${meta.animation.animatedSlots} slots, ${mb} MB`);
}

writeFileSync(
  OUT("index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>palette-grouping experiment</title>
<style>body{font:15px/1.6 system-ui;background:#101418;color:#e6e6e6;margin:0;padding:32px}a{color:#6db3ff}
  table{border-collapse:collapse;margin-top:12px}td,th{border:1px solid #2a333d;padding:6px 12px;text-align:left}</style></head>
<body><h1>Palette-cycling keyframe grouping — ${frames.width}×${frames.height}, ${FRAMES} frames</h1>
<p>Same clip; only how the animated colors are grouped into <code>@keyframes</code> differs.
Open each and watch the FPS meter (and how long it takes to first paint).</p>
<table><tr><th>paletteKeyframes</th><th>@keyframes</th><th>animated colors</th><th>CSS</th></tr>
${rows.map((r) => `<tr><td><a href="pg-${slug(r.raw)}.html">${r.raw}</a></td><td>${r.kf}</td><td>${r.slots}</td><td>${r.mb} MB</td></tr>`).join("\n")}
</table></body></html>\n`,
);
console.log("  + index.html");
