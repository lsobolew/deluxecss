# Waterfall — one element, frame-by-frame (the "10m" technique)

The full 640×286 waterfall animated **on a single element**, frame by frame. This
is the original `10m` idea revisited: every frame is 286 stacked row-gradients,
and one `@keyframes` swaps the whole `background-image` (and `background-position`)
per frame with `step-end`. No child layers, and — with `--inline-palette` — no
`--color-*` variables either: colors are written straight into the gradients.

## Why this exists

For a long time this looked impossible: single-element frame output at 640px
rendered **blank**, so every waterfall animation used multi-layer output instead.
Re-testing pinned the real cause — it was **not** a browser limit. It was an
artifact of **headless Chrome** giving up on parsing/painting the multi-megabyte
stylesheet inside its budget. In a real browser (tested in Safari and normal
Chrome) the single-element version renders and animates fine at ~50 fps. The
"four frames on one element" from the original `10m` experiment were real.

## What actually costs you here

- **CSS size → first-paint time.** 4 frames at 640px is ~20 MB of CSS. The
  browser must parse all of it before the first frame appears, so there is a
  visible delay on load (seconds). This is the true limiting factor, and it
  scales with `width × rows × frames`. The original `10m` matrix clip was
  1910×1080 × 4 frames ≈ **189 MB** — which is why it felt broken.
- **Not** the number of layers, and **not** the palette: inlining the colors
  (`--inline-palette`) removes ~500k `var()` lookups and trims ~16% off the file,
  but the vars were never what blocked rendering.

## Technique

- `animationMode: "frames"`, `singleElement: true`, `inlinePalette: true`.
- One element, `background-size: 100% var(--pixel-height)`, 286 row-gradients.
- `@keyframes` swaps `background-image` + `background-position` together
  (`step-end`), with an explicit terminal `100%` stop (the Safari fix).

## Pros / cons

- **Pro:** no extra DOM, no palette, closest to the raw "image as one CSS value"
  idea; smooth once parsed.
- **Con:** huge stylesheet and a slow first paint; not live-recolorable (no
  palette). For anything you ship, prefer the multi-layer `waterfall-frames`
  (splits the paint, smaller per-rule) or a palette/overlay mode.

## Sketch (simplified)

```css
.pixel-image {
  width: 640px;
  aspect-ratio: 640 / 286;
  background-size: 100% var(--pixel-height);   /* one row tall */
  background-repeat: no-repeat;
  animation: play 1.5s step-end infinite;
}
@keyframes play {
  0%   { background-image: /* frame 1: 286 row-gradients */; background-position: 0 0, /* … */; }
  25%  { background-image: /* frame 2 */; background-position: 0 0, /* … */; }
  50%  { background-image: /* frame 3 */; background-position: 0 0, /* … */; }
  75%  { background-image: /* frame 4 */; background-position: 0 0, /* … */; }
  100% { background-image: /* frame 4 */; background-position: 0 0, /* … */; }
}
```
