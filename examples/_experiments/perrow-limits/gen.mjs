// EXPERIMENT — the 10m technique: PER-ROW gradients on a SINGLE element, with
// background-image AND background-position both animated inside @keyframes (so
// every layer binds without a static frame-0). Tests how far this scales and
// whether it animates smoothly (on-page FPS meter). CSS size is not a concern.
//
// Run from the pixel-css dir (constants overridable via env):
//   W=512 FPS=24 SECONDS=2 COLORS=24 node examples/_experiments/perrow-limits/gen.mjs
import sharp from "sharp";
import { buildPaletteSync, utils } from "image-q";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../../../10m/", import.meta.url));
const OUT = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const W = Number(process.env.W ?? 512);
const FPS = Number(process.env.FPS ?? 24);
const SECONDS = Number(process.env.SECONDS ?? 2);
const MAXCOLORS = Number(process.env.COLORS ?? 24);
const ROWH = Number(process.env.ROWH ?? 3);
const OUTNAME = process.env.OUT ?? `perrow-${W}px-${FPS}fps.html`;

const N = Math.round(FPS * SECONDS);
const src = (i) => `${DIR}matrix_${String(i).padStart(3, "0")}.png`;

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
  const base = i * PX * 4;
  for (let p = 0; p < PX * 4; p += 4) {
    big[base + p] = f[p]; big[base + p + 1] = f[p + 1]; big[base + p + 2] = f[p + 2]; big[base + p + 3] = 255;
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

// Per-frame: H row gradients (RLE), joined into ONE background-image.
const rowPos = Array.from({ length: H }, (_, y) => `0 calc(${ROWH}px * ${y})`).join(", ");
const frameBg = frames.map((f) => {
  const idx = new Int32Array(PX);
  for (let p = 0, i = 0; p < PX; p++, i += 4) {
    const key = (f[i] << 16) | (f[i + 1] << 8) | f[i + 2];
    let v = cache.get(key);
    if (v === undefined) { v = nearest(f[i], f[i + 1], f[i + 2]); cache.set(key, v); }
    idx[p] = v;
  }
  const rows = [];
  for (let y = 0; y < H; y++) {
    const at = y * W, stops = [];
    for (let n = 0; n < W; n++) {
      const cur = idx[at + n];
      const prevDiff = n === 0 || idx[at + n - 1] !== cur;
      const nextDiff = n === W - 1 || idx[at + n + 1] !== cur;
      if (prevDiff) stops.push(`${hex[cur]} calc(var(--u) * ${n})`);
      if (nextDiff) stops.push(`${hex[cur]} calc(var(--u) * ${n + 1})`);
    }
    rows.push(`linear-gradient(to right, ${stops.join(", ")})`);
  }
  return rows.join(", ");
});

const duration = N / FPS;
// KEY: each keyframe sets background-image AND background-position together.
const kf = frameBg
  .map((bg, f) => `  ${((f / N) * 100).toFixed(4)}% { background-image: ${bg}; background-position: ${rowPos}; }`)
  .join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Per-row single element — ${W}px @ ${FPS}fps</title>
<style>
  body { margin:0; background:#000; color:#6f6; font:13px system-ui; }
  h1 { font-size:13px; padding:8px 12px; margin:0; font-weight:600; }
  #fps { position:fixed; top:8px; right:12px; z-index:10; font:600 16px monospace;
         color:#0f0; background:#000a; padding:4px 8px; border:1px solid #0f0; border-radius:4px; }
  .img {
    --u: ${ROWH}px;   /* horizontal pixel = vertical pixel (ROWH) → square pixels, correct aspect */
    width: calc(var(--u) * ${W}); height: ${H * ROWH}px; margin: 8px 12px;
    background-repeat: no-repeat; background-size: 100% ${ROWH}px;
    animation: play ${duration}s step-end infinite; will-change: background-image;
  }
  @keyframes play {
${kf}
  }
</style></head>
<body>
  <div id="fps">– fps</div>
  <h1>Per-row · single element · position-in-keyframe · ${W}×${H} · ${N} frames · ${FPS}fps · ${SECONDS}s</h1>
  <div class="img"></div>
  <script>
    let last=performance.now(),count=0,min=Infinity,el=document.getElementById('fps');
    function loop(now){count++;const dt=now-last;if(dt>=500){const v=Math.round(count*1000/dt);min=Math.min(min,v);el.textContent=v+' fps (min '+(min===Infinity?'–':min)+')';count=0;last=now;}requestAnimationFrame(loop);}
    requestAnimationFrame(loop);
  </script>
</body></html>
`;

writeFileSync(OUT(OUTNAME), html);
console.log(`${OUTNAME}: ${W}x${H}, ${N} frames @ ${FPS}fps, ${MAXCOLORS} colors, ${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB`);
