// SIDE EXPERIMENT #2 — same Matrix clip, two ways, on separate documents, so you
// can profile playback performance of each in DevTools:
//   method1.html : ONE linear-gradient per frame (box-decoration-break: slice)
//   method2.html : one linear-gradient PER ROW per frame (the library's approach)
// Both use the SAME frames, palette, resolution, fps and on-screen size.
//
// Run from the pixel-css dir:
//   node examples/_experiments/one-gradient/matrix-compare.mjs
import sharp from "sharp";
import { buildPaletteSync, utils } from "image-q";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../../../10m/", import.meta.url));
const OUT = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const W = 128; // resize width
const SRC_FRAMES = 120; // first 5s @ 24fps
const N = 20; // playback frames (sampled) over 5s
const MAXCOLORS = 16;
const DURATION = 5; // seconds
const FONT = 10; // px; 1ch ≈ 0.6em is the horizontal pixel unit
const ROWH = 6; // px per row (vertical pixel size)

const src = (i) => `${DIR}matrix_${String(i).padStart(3, "0")}.png`;

// Evenly sample N source-frame indices from the first SRC_FRAMES.
const picks = Array.from({ length: N }, (_, i) =>
  Math.round((i * (SRC_FRAMES - 1)) / (N - 1)),
);

// Decode each picked frame to WxH RGBA (nearest).
let H = 0;
const frames = [];
for (const idx of picks) {
  const { data, info } = await sharp(src(idx))
    .resize({ width: W, kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  H = info.height;
  frames.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}
const PX = W * H;

// One shared quantized palette across all frames.
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
const palette = iq
  .getPointContainer()
  .getPointArray()
  .map((p) => [p.r, p.g, p.b]);
const hex = palette.map(
  ([r, g, b]) =>
    `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`,
);

// Map every frame to a palette-index buffer (nearest colour, cached).
const cache = new Map();
const nearest = (r, g, b) => {
  let best = 0,
    bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = palette[i][0] - r,
      dg = palette[i][1] - g,
      db = palette[i][2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
};
const indexFrames = frames.map((f) => {
  const idx = new Int32Array(PX);
  for (let p = 0, i = 0; p < PX; p++, i += 4) {
    const key = (f[i] << 16) | (f[i + 1] << 2 * 4) | f[i + 2];
    let v = cache.get(key);
    if (v === undefined) {
      v = nearest(f[i], f[i + 1], f[i + 2]);
      cache.set(key, v);
    }
    idx[p] = v;
  }
  return idx;
});

// RLE a run of indices into "color pos, color pos" stops. `pos(n)` formats a stop position.
function rleStops(at, len, idx, pos) {
  const stops = [];
  for (let n = 0; n < len; n++) {
    const cur = idx[at + n];
    const prevDiff = n === 0 || idx[at + n - 1] !== cur;
    const nextDiff = n === len - 1 || idx[at + n + 1] !== cur;
    if (prevDiff) stops.push(`${hex[cur]} ${pos(n)}`);
    if (nextDiff) stops.push(`${hex[cur]} ${pos(n + 1)}`);
  }
  return stops.join(", ");
}

// Method 1: one gradient per frame, whole image unrolled row-major.
const m1Frames = indexFrames.map(
  (idx) =>
    `linear-gradient(to right, ${rleStops(0, PX, idx, (n) => `calc(var(--u) * ${n})`)})`,
);

// Method 2: one gradient per ROW per frame, the library's real approach — rows
// are split across stacked <div> layers (a single element can't paint this many
// background layers at once). Per-frame gradient strings per row:
const CHUNK = 40;
const layerCount = Math.ceil(H / CHUNK);
const rowGrad = indexFrames.map((idx) =>
  Array.from({ length: H }, (_, y) =>
    `linear-gradient(to right, ${rleStops(y * W, W, idx, (n) => `calc(var(--u) * ${n})`)})`,
  ),
);
const layerRowsOf = (i) => {
  const rows = [];
  for (let y = i * CHUNK; y < Math.min((i + 1) * CHUNK, H); y++) rows.push(y);
  return rows;
};

const keyframes = (name, frameBgs) => {
  const stops = frameBgs
    .map((bg, f) => `  ${((f / N) * 100).toFixed(3)}% { background-image: ${bg}; }`)
    .join("\n");
  return `@keyframes ${name} {\n${stops}\n}`;
};

const filler = "0".repeat(PX);

const doc1 = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Matrix — method 1: ONE gradient per frame</title>
<style>
  body { margin:0; background:#000; color:#6f6; font:14px system-ui; }
  h1 { font-size:14px; padding:8px 12px; margin:0; }
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
    animation: m1 ${DURATION}s step-end infinite; will-change: background-image;
  }
  ${keyframes("m1", m1Frames)}
</style></head>
<body>
  <h1>Method 1 — ONE linear-gradient per frame (box-decoration-break: slice), ${N} frames @ ${DURATION}s</h1>
  <div class="box"><span class="strip">${filler}</span></div>
</body></html>
`;

// Per-layer keyframes: layer i animates only its rows' gradients.
const m2LayerCss = Array.from({ length: layerCount }, (_, i) => {
  const rows = layerRowsOf(i);
  const pos = rows.map((y) => `0 calc(${ROWH}px * ${y})`).join(", ");
  const frameBgs = rowGrad.map((g) => rows.map((y) => g[y]).join(", "));
  return (
    `  .img > .layer:nth-child(${i + 1}) {\n` +
    `    background-position: ${pos};\n` +
    // Static frame-0 background is REQUIRED: an animated multi-layer
    // background-image only binds all its layers/positions when a static
    // multi-layer background-image is already present on the element.
    `    background-image: ${frameBgs[0]};\n` +
    `    animation: m2_${i} ${DURATION}s step-end infinite; will-change: background-image;\n` +
    `  }\n` +
    `  ${keyframes(`m2_${i}`, frameBgs)}`
  );
}).join("\n");
const layerDivs = Array.from({ length: layerCount }, () => `<div class="layer"></div>`).join("");

const doc2 = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Matrix — method 2: one gradient per row</title>
<style>
  body { margin:0; background:#000; color:#6f6; font:14px system-ui; }
  h1 { font-size:14px; padding:8px 12px; margin:0; }
  .img {
    --u: 1ch;
    font-family: monospace; font-size: ${FONT}px;
    width: calc(var(--u) * ${W}); height: ${H * ROWH}px; margin: 8px 12px;
    display: grid;
  }
  .img > .layer {
    grid-column: 1; grid-row: 1; width: 100%; height: 100%;
    background-repeat: no-repeat; background-size: 100% ${ROWH}px;
  }
${m2LayerCss}
</style></head>
<body>
  <h1>Method 2 — one linear-gradient per row (${H}/frame, ${layerCount} layers), ${N} frames @ ${DURATION}s</h1>
  <div class="img">${layerDivs}</div>
</body></html>
`;

writeFileSync(OUT("matrix-method1.html"), doc1);
writeFileSync(OUT("matrix-method2.html"), doc2);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0);
console.log(
  `image ${W}x${H}, ${N} frames, ${MAXCOLORS} colors\n` +
    `  matrix-method1.html (one gradient/frame): ${kb(doc1)} KB\n` +
    `  matrix-method2.html (per-row/frame):      ${kb(doc2)} KB`,
);
