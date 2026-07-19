# Experiment — optimal tile size / shape

The library splits the background into full-width **row-strips** (`layerChunkSize`
rows per `<div>`). This experiment generalizes that to arbitrary **tiles**
(`tileW × tileH` px): the frame becomes a grid of absolutely-positioned tiles,
each frame-swapping only its own sub-region. Same clip, same palette, same frame
rate — only the tiling differs — so you can find the sweet spot.

```
node gen.mjs                                  # default config set
CONFIGS=256x8,64x64,32x32 FPS=8 SECONDS=1.5 node gen.mjs
```

Open `index.html`, then flip between configs (links are in each page's header)
and watch the **FPS meter** (top-right). Measure in a **real browser** — headless
virtual-time isn't representative.

## Configs generated

Full-width strips (1-D, what the library does): `256×8`, `256×16`, `256×32`,
`256×72`, and `256×145` (the whole image in one tile). Rectangular / square tiles
(2-D): `128×64`, `64×64`, `32×32`.

## What to look for (the tradeoff)

- **Few big tiles** (e.g. `256×145`, one element): fewest DOM nodes and
  `@keyframes`, but each tile's `background-image` is huge — slow first paint, and
  past a size a single element paints **nothing** (the blank ceiling we hit at
  640px). Big rasters to cache.
- **Many small tiles** (e.g. `32×32`): each raster is tiny and cheap, and only
  "dirty" tiles need repainting — but there are far more DOM nodes, `@keyframes`
  rules and compositing layers, which adds style/main-thread overhead.
- **Chrome already rasterizes layers in ~256×256 internal tiles**, so CSS tiling
  *below* that may not speed up painting much while still adding overhead. The
  useful wins are usually: (1) staying under the single-element paint ceiling, and
  (2) matching tiles to where change actually happens (see the `overlay` mode).
- File size is ~constant across configs — tiling reorganizes the same gradient
  data; only per-tile boundary overhead grows with tile count.

There's no universal "best" — it depends on resolution, how much of the frame
moves, and the machine. This harness lets you measure it for a given clip.

## Observed

Measured on this clip: the **smallest tiles perform worst** (`32×32` — the
per-tile DOM / `@keyframes` / compositing-layer overhead dominates), while the
**larger tiles are all roughly flat** — no meaningful difference between full-
width strips of 16–72 rows and the single whole-image tile. That matches Chrome
rasterizing in ~256px internal tiles: once a CSS tile is "big enough," slicing it
further only adds overhead without helping paint.

**Takeaway:** don't tile finely. The library's default — full-width strips of
`layerChunkSize` (50) rows — sits comfortably in the flat zone. The only reason to
change tiling is to stay under the single-element paint ceiling (split just
enough to render) or to confine repaints to where motion is (the `overlay` mode),
not to chase a smaller tile.

## Sketch (simplified)

```html
<div class="frame">
  <div class="tile t0_0"></div>
  <div class="tile t1_0"></div>  <!-- …one div per tile… -->
</div>
```

```css
.frame { position: relative; --u: 3px; }
.tile  { position: absolute; background-repeat: no-repeat; background-size: 100% var(--u);
         will-change: background-image; }

/* each tile lives at its grid cell and frame-swaps only its sub-region */
.t1_0 {
  left: calc(var(--u) * 64); top: 0;
  width: calc(var(--u) * 64); height: calc(var(--u) * 64);
  animation: t1_0 1.5s step-end infinite;
}
@keyframes t1_0 {
  0%  { background-image: /* tile's frame0 rows */; background-position: 0 0, 0 var(--u), /* … */; }
  8%  { background-image: /* tile's frame1 rows */; background-position: 0 0, 0 var(--u), /* … */; }
  /* …one stop per frame… */
}
```
