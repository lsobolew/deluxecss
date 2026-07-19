// EXPERIMENT — what tile size/shape renders/animates best?
//
// The library splits the background into full-width row-strips (layerChunkSize
// rows each). This generalizes that to arbitrary TILES (tileW × tileH pixels):
// the frame is a grid of absolutely-positioned <div> tiles, each frame-swapping
// only its own sub-region (frames mode). It decodes + quantizes once, then emits
// one document per tile config plus an index.html to flip between them. Compare
// the on-page FPS meter and the reported tile count / CSS size.
//
//   node examples/_experiments/tile-size/gen.mjs
//   CONFIGS=256x8,64x64,32x32 FPS=8 SECONDS=1.5 node .../gen.mjs
import sharp from "sharp";
import { buildPaletteSync, utils } from "image-q";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../../../10m/", import.meta.url));
const OUT = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const W = Number(process.env.W ?? 256);
const FPS = Number(process.env.FPS ?? 8);
const SECONDS = Number(process.env.SECONDS ?? 1.5);
const MAXCOLORS = Number(process.env.COLORS ?? 24);
const U = Number(process.env.U ?? 3); // px per source pixel (square)
// "WxH" tile configs. `0` height means "full height" (single row of tiles).
const CONFIGS = (process.env.CONFIGS ??
  "256x8,256x16,256x32,256x72,128x64,64x64,32x32,256x145")
  .split(",")
  .map((s) => s.trim());

const N = Math.round(FPS * SECONDS);
const src = (i) => `${DIR}matrix_${String(i).padStart(3, "0")}.png`;

// ---- decode + quantize ONCE ----
let H = 0;
const frames = [];
for (let f = 0; f < N; f++) {
  const { data, info } = await sharp(src(f))
    .resize({ width: W, kernel: "nearest" })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  H = info.height;
  frames.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}
const PX = W * H;
const big = new Uint8Array(PX * 4 * frames.length);
frames.forEach((f, i) => {
  const b = i * PX * 4;
  for (let p = 0; p < PX * 4; p += 4) {
    big[b + p] = f[p]; big[b + p + 1] = f[p + 1]; big[b + p + 2] = f[p + 2]; big[b + p + 3] = 255;
  }
});
const iq = buildPaletteSync(
  [utils.PointContainer.fromUint8Array(big, W, H * frames.length)],
  { colorDistanceFormula: "euclidean", paletteQuantization: "wuquant", colors: MAXCOLORS },
);
const palette = iq.getPointContainer().getPointArray().map((p) => [p.r, p.g, p.b]);
const hex = palette.map(([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`);
const cache = new Map();
const nearest = (r, g, b) => {
  let best = 0, bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = palette[i][0] - r, dg = palette[i][1] - g, db = palette[i][2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
};
const idxFrames = frames.map((f) => {
  const idx = new Int32Array(PX);
  for (let p = 0, i = 0; p < PX; p++, i += 4) {
    const key = (f[i] << 16) | (f[i + 1] << 8) | f[i + 2];
    let v = cache.get(key);
    if (v === undefined) { v = nearest(f[i], f[i + 1], f[i + 2]); cache.set(key, v); }
    idx[p] = v;
  }
  return idx;
});

function rowGradient(idx, y, cx0, cx1) {
  const stops = [];
  const base = y * W;
  for (let x = cx0; x < cx1; x++) {
    const cur = idx[base + x];
    const local = x - cx0;
    const prevDiff = x === cx0 || idx[base + x - 1] !== cur;
    const nextDiff = x === cx1 - 1 || idx[base + x + 1] !== cur;
    if (prevDiff) stops.push(`${hex[cur]} calc(var(--u) * ${local})`);
    if (nextDiff) stops.push(`${hex[cur]} calc(var(--u) * ${local + 1})`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

const duration = N / FPS;
const summary = [];

for (const cfg of CONFIGS) {
  const [twStr, thStr] = cfg.split("x");
  const TILEW = Math.min(Number(twStr) || W, W);
  const TILEH = Number(thStr) === 0 ? H : Math.min(Number(thStr) || H, H);
  const tilesX = Math.ceil(W / TILEW);
  const tilesY = Math.ceil(H / TILEH);
  const outName = `tile-${TILEW}x${TILEH}.html`;

  const tileRules = [];
  const tileDivs = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const cx0 = tx * TILEW, cx1 = Math.min(cx0 + TILEW, W);
      const ry0 = ty * TILEH, ry1 = Math.min(ry0 + TILEH, H);
      const rows = [];
      for (let y = ry0; y < ry1; y++) rows.push(y);
      const pos = rows.map((y) => `0 calc(var(--u) * ${y - ry0})`).join(", ");
      const name = `t${tx}_${ty}`;
      const kf = idxFrames
        .map((idx, f) => {
          const bg = rows.map((y) => rowGradient(idx, y, cx0, cx1)).join(", ");
          return `  ${((f / N) * 100).toFixed(3)}% { background-image: ${bg}; background-position: ${pos}; }`;
        })
        .join("\n");
      tileRules.push(
        `.${name} {\n  left: calc(var(--u) * ${cx0}); top: calc(var(--u) * ${ry0});\n` +
          `  width: calc(var(--u) * ${cx1 - cx0}); height: calc(var(--u) * ${ry1 - ry0});\n` +
          `  animation: ${name} ${duration}s step-end infinite;\n}\n` +
          `@keyframes ${name} {\n${kf}\n}`,
      );
      tileDivs.push(`<div class="tile ${name}"></div>`);
    }
  }

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Tile ${TILEW}×${TILEH} — ${tilesX * tilesY} tiles</title>
<style>
  body { margin:0; background:#000; color:#6f6; font:13px system-ui; }
  h1 { font-size:13px; padding:8px 12px; margin:0; font-weight:600; }
  nav { padding:0 12px 8px; font:12px system-ui; }
  nav a { color:#6db3ff; margin-right:10px; }
  #fps { position:fixed; top:8px; right:12px; z-index:10; font:600 16px monospace;
         color:#0f0; background:#000a; padding:4px 8px; border:1px solid #0f0; border-radius:4px; }
  .frame { --u:${U}px; position:relative; width:calc(var(--u)*${W}); height:calc(var(--u)*${H}); margin:8px 12px; }
  .tile { position:absolute; background-repeat:no-repeat; background-size:100% var(--u); will-change:background-image; }
${tileRules.join("\n")}
</style></head>
<body>
  <div id="fps">– fps</div>
  <h1>Tiles ${TILEW}×${TILEH}px · ${tilesX}×${tilesY} = ${tilesX * tilesY} tiles · ${W}×${H} · ${N} frames @ ${FPS}fps</h1>
  <nav>compare: ${CONFIGS.map((c) => {
    const [a, b] = c.split("x");
    const tw = Math.min(Number(a) || W, W), th = Number(b) === 0 ? H : Math.min(Number(b) || H, H);
    return `<a href="tile-${tw}x${th}.html">${tw}×${th}</a>`;
  }).join("")}</nav>
  <div class="frame">${tileDivs.join("")}</div>
  <script>
    let last=performance.now(),count=0,min=Infinity,el=document.getElementById('fps');
    function loop(now){count++;const dt=now-last;if(dt>=500){const v=Math.round(count*1000/dt);min=Math.min(min,v);el.textContent=v+' fps (min '+(min===Infinity?'–':min)+')';count=0;last=now;}requestAnimationFrame(loop);}
    requestAnimationFrame(loop);
  </script>
</body></html>
`;
  writeFileSync(OUT(outName), html);
  summary.push(
    `${outName}: ${tilesX}×${tilesY}=${tilesX * tilesY} tiles, ${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB`,
  );
}

// index linking every config
const links = CONFIGS.map((c) => {
  const [a, b] = c.split("x");
  const tw = Math.min(Number(a) || W, W), th = Number(b) === 0 ? H : Math.min(Number(b) || H, H);
  const tiles = Math.ceil(W / tw) * Math.ceil(H / th);
  return `  <li><a href="tile-${tw}x${th}.html">${tw}×${th}px</a> — ${tiles} tiles</li>`;
}).join("\n");
writeFileSync(
  OUT("index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>tile-size experiment</title>
<style>body{font:15px/1.6 system-ui;background:#101418;color:#e6e6e6;margin:0;padding:32px} a{color:#6db3ff} h1{font-size:18px}</style></head>
<body><h1>Tile size / shape — ${W}×${H}, ${N} frames @ ${FPS}fps</h1>
<p>Open each and watch the FPS meter (top-right). Same clip, only the tiling differs.</p>
<ul>\n${links}\n</ul></body></html>\n`,
);

console.log(summary.join("\n") + `\n  + index.html (${W}×${H}, ${N} frames)`);
