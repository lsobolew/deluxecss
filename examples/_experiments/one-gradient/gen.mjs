// SIDE EXPERIMENT — encode a whole image in ONE linear-gradient.
//
// Idea (from the user): a horizontal gradient that lists every pixel of the
// image unrolled row-major, painted on an INLINE element that wraps into H
// lines. With `box-decoration-break: slice`, the background is drawn as if the
// inline box were one un-broken line and then sliced per line — so each wrapped
// line shows the next row's worth of the gradient. One gradient → 2D image.
//
// Run from the repo root:  node examples/_experiments/one-gradient/gen.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { backLink, cmdBlock } from "../../../scripts/example-utils.mjs";

const SRC = fileURLToPath(new URL("../../../../mario2.png", import.meta.url));
const OUT = fileURLToPath(new URL("./index.html", import.meta.url));
const S = 20; // px per pixel

const { data, info } = await sharp(SRC)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;

const colorAt = (k) => {
  const i = k * 4;
  return `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`;
};

// --- ONE gradient: all W*H pixels unrolled row-major, hard stops, RLE-collapsed.
// Positions are in `ch` units: one character advance = one pixel, so the
// wrapping text grid (W chars per line) aligns with the gradient exactly.
const stops = [];
for (let k = 0; k < W * H; k++) {
  const c = colorAt(k);
  const prevSame = k > 0 && colorAt(k - 1) === c;
  const nextSame = k < W * H - 1 && colorAt(k + 1) === c;
  if (!prevSame) stops.push(`${c} calc(var(--u) * ${k})`);
  if (!nextSame) stops.push(`${c} calc(var(--u) * ${k + 1})`);
}
const oneGradient = `linear-gradient(to right, ${stops.join(", ")})`;
const rowWidth = W * S;
const filler = "0".repeat(W * H); // W*H characters → wraps into H lines of W

// --- Reference: one gradient PER ROW (the current technique), for comparison.
// Uses the SAME pixel cell as method (B) — width 1ch, height rowH — so the two
// Marios come out at identical dimensions for a side-by-side comparison.
const rowH = Math.round(S * 0.6);
const rowGradients = [];
const rowPositions = [];
for (let y = 0; y < H; y++) {
  const rs = [];
  for (let x = 0; x < W; x++) {
    const k = y * W + x;
    const c = colorAt(k);
    const prevSame = x > 0 && colorAt(k - 1) === c;
    const nextSame = x < W - 1 && colorAt(k + 1) === c;
    if (!prevSame) rs.push(`${c} calc(var(--u) * ${x})`);
    if (!nextSame) rs.push(`${c} calc(var(--u) * ${x + 1})`);
  }
  rowGradients.push(`linear-gradient(to right, ${rs.join(", ")})`);
  rowPositions.push(`0 calc(${rowH}px * ${y})`);
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>one-gradient experiment</title>
<style>
  :root { --u: 1ch; }
  body { margin: 0; background: #222; color: #eee; font-family: system-ui, sans-serif; }
  /* the ch unit only means the right thing where the monospace font applies */
  .row { display: flex; gap: 40px; align-items: flex-start; margin: 24px;
         font-family: monospace; font-size: ${S}px; zoom: 2; }
  figcaption { font-size: 13px; margin-bottom: 8px; color: #bbb; font-family: system-ui, sans-serif; }
  code { color: #9cf; }

  /* (A) reference: one gradient per row — same cell size as (B): 1ch × ${rowH}px */
  .per-row {
    width: calc(var(--u) * ${W}); height: ${H * rowH}px;
    background-repeat: no-repeat;
    background-size: 100% ${rowH}px;
    background-image: ${rowGradients.join(",\n      ")};
    background-position: ${rowPositions.join(", ")};
  }

  /* (B) the experiment: ONE gradient on a wrapping inline text run.
        --u = one character advance (1ch). W chars per line, H lines. */
  .box {
    /* content-box so aspect-ratio sizes the content area to exactly H rows and
       padding-top adds on top of it (border-box would eat a row at the bottom) */
    box-sizing: content-box;
    container-type: size;                  /* size containment + query container */
    aspect-ratio: ${W} / ${H};             /* height from the image's ratio */
    line-height: ${rowH}px;
    width: calc(var(--u) * ${W});          /* exactly W characters wide */
    padding-top: 0.5ch;                    /* nudge the clipped first line down */
    overflow: hidden;
    white-space: normal; word-break: break-all;
  }
  .strip {
    -webkit-box-decoration-break: slice;
    box-decoration-break: slice;
    color: transparent;                    /* hide the filler glyphs visually */
    -webkit-user-select: none;
    user-select: none;                     /* can't be selected or copied */
    pointer-events: none;                  /* no cursor/hit-testing on the text */
    background-image: ${oneGradient};
    background-size: calc(var(--u) * ${W * H}) ${rowH}px;
    background-repeat: no-repeat;
  }
</style></head>
<body>
  <div class="row">
    <figure>
      <figcaption>(A) one <code>linear-gradient</code> per row<br>(${H} gradients)</figcaption>
      <div class="per-row" role="img" aria-label="Mario, drawn in CSS from one linear-gradient per row"></div>
    </figure>
    <figure>
      <figcaption>(B) ONE <code>linear-gradient</code> (${stops.length} stops)<br>wrapping inline text, <code>box-decoration-break: slice</code></figcaption>
      <div class="box" role="img" aria-label="Mario, drawn in CSS from a single linear-gradient"><span class="strip" aria-hidden="true">${filler}</span></div>
    </figure>
  </div>
  ${cmdBlock("node examples/_experiments/one-gradient/gen.mjs", "Generated by (bespoke experiment — hand-rolled, not the deluxecss CLI)")}
  ${backLink(2)}
</body></html>
`;

writeFileSync(OUT, html);
console.log(
  `wrote ${OUT}\n  image ${W}x${H}, one-gradient stops: ${stops.length}, per-row gradients: ${rowGradients.length}`,
);
