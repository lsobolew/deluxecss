// EXPERIMENT — how far does METHOD 1 (one linear-gradient per frame via
// box-decoration-break: slice) scale? Builds a Matrix clip at a chosen width and
// frame rate, with an on-page FPS meter so playback cost is visible without
// DevTools. CSS size is not a concern here (this is a stress test).
//
// Run from the pixel-css dir, tuning the constants below:
//   node examples/_experiments/method1-limits/gen.mjs
import sharp from "sharp";
import { buildPaletteSync, utils } from "image-q";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../../../10m/", import.meta.url));
const OUT = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

// ---- knobs ----
const W = Number(process.env.W ?? 640); // resize width
const FPS = Number(process.env.FPS ?? 24); // playback frames per second
const SECONDS = Number(process.env.SECONDS ?? 5); // clip length
const MAXCOLORS = Number(process.env.COLORS ?? 24);
const ROWH = Number(process.env.ROWH ?? 3); // px per row (vertical pixel size)
const FONT = Number(process.env.FONT ?? 6); // px; 1ch is the horizontal unit
const OUTNAME = process.env.OUT ?? `method1-${W}px-${FPS}fps.html`;

const N = Math.round(FPS * SECONDS); // total playback frames (consecutive source frames)

const src = (i) => `${DIR}matrix_${String(i).padStart(3, "0")}.png`;

let H = 0;
const frames = [];
for (let f = 0; f < N; f++) {
  const { data, info } = await sharp(src(f))
    .resize({ width: W, kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  H = info.height;
  frames.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}
const PX = W * H;

// shared quantized palette
const big = new Uint8Array(PX * 4 * frames.length);
frames.forEach((f, i) => {
  const base = i * PX * 4;
  for (let p = 0; p < PX * 4; p += 4) {
    big[base + p] = f[p];
    big[base + p + 1] = f[p + 1];
    big[base + p + 2] = f[p + 2];
    big[base + p + 3] = 255;
  }
});
const iq = buildPaletteSync(
  [utils.PointContainer.fromUint8Array(big, W, H * frames.length)],
  { colorDistanceFormula: "euclidean", paletteQuantization: "wuquant", colors: MAXCOLORS },
);
const palette = iq.getPointContainer().getPointArray().map((p) => [p.r, p.g, p.b]);
const hex = palette.map(
  ([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`,
);

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

// One unrolled gradient per frame (RLE-collapsed), positions in `ch`.
const frameGradients = frames.map((f) => {
  const idx = new Int32Array(PX);
  for (let p = 0, i = 0; p < PX; p++, i += 4) {
    const key = (f[i] << 16) | (f[i + 1] << 8) | f[i + 2];
    let v = cache.get(key);
    if (v === undefined) { v = nearest(f[i], f[i + 1], f[i + 2]); cache.set(key, v); }
    idx[p] = v;
  }
  const stops = [];
  for (let k = 0; k < PX; k++) {
    const cur = idx[k];
    const prevDiff = k === 0 || idx[k - 1] !== cur;
    const nextDiff = k === PX - 1 || idx[k + 1] !== cur;
    if (prevDiff) stops.push(`${hex[cur]} calc(var(--u) * ${k})`);
    if (nextDiff) stops.push(`${hex[cur]} calc(var(--u) * ${k + 1})`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
});

const duration = N / FPS;
const kfStops = frameGradients
  .map((g, f) => `  ${((f / N) * 100).toFixed(4)}% { background-image: ${g}; }`)
  .join("\n");

const filler = "0".repeat(PX); // W*H characters -> wraps into H lines of W

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Method 1 limits — ${W}px @ ${FPS}fps</title>
<style>
  body { margin:0; background:#000; color:#6f6; font:13px system-ui; }
  h1 { font-size:13px; padding:8px 12px; margin:0; font-weight:600; }
  #fps { position:fixed; top:8px; right:12px; z-index:10; font:600 16px monospace;
         color:#0f0; background:#000a; padding:4px 8px; border:1px solid #0f0; border-radius:4px; }
  .box {
    --u: 1ch;
    font-family: monospace; font-size: ${FONT}px; line-height: ${ROWH}px;
    width: calc(var(--u) * ${W}); height: ${H * ROWH}px; overflow: hidden;
    white-space: normal; word-break: break-all; margin: 8px 12px;
  }
  .strip {
    -webkit-box-decoration-break: slice; box-decoration-break: slice;
    color: transparent;
    background-repeat: no-repeat; background-size: calc(var(--u) * ${PX}) ${ROWH}px;
    animation: play ${duration}s step-end infinite; will-change: background-image;
  }
  @keyframes play {
${kfStops}
  }
</style></head>
<body>
  <div id="fps">– fps</div>
  <h1>Method 1 — ONE linear-gradient/frame · ${W}×${H} · ${N} frames · ${FPS}fps · ${SECONDS}s loop</h1>
  <div class="box"><span class="strip">${filler}</span></div>
  <script>
    let last = performance.now(), count = 0, fps = document.getElementById('fps');
    let min = Infinity;
    function loop(now){
      count++;
      const dt = now - last;
      if (dt >= 500){
        const v = Math.round(count * 1000 / dt);
        min = Math.min(min, v);
        fps.textContent = v + ' fps (min ' + (min === Infinity ? '–' : min) + ')';
        count = 0; last = now;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  </script>
</body></html>
`;

writeFileSync(OUT(OUTNAME), html);
console.log(
  `${OUTNAME}: ${W}x${H}, ${N} frames @ ${FPS}fps (${duration}s), ${MAXCOLORS} colors\n` +
    `  filler chars: ${PX.toLocaleString()}  |  CSS+HTML: ${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB`,
);
