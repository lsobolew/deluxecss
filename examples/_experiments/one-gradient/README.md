# Experiment: the whole image in ONE `linear-gradient`

**Question:** the normal technique uses one `linear-gradient` per row (N gradients
stacked with `background-position`). Can a single horizontal gradient render the
whole 2D image if it "wraps" into rows?

**Answer: yes** — with `box-decoration-break: slice`.

```
node gen.mjs        # regenerates index.html from ../../../../mario2.png
```

Open `index.html`: (A) is the per-row reference, (B) is the same 12×16 Mario drawn
from a **single** `linear-gradient` (136 stops).

## How it works

1. Unroll every pixel row-major into one horizontal `linear-gradient(to right, …)`
   — pixel `k = y*W + x` sits at offset `k` along the strip (RLE-collapsed).
2. Put that gradient on an **inline** element whose text content wraps into `H`
   lines, each exactly `W` units wide.
3. `box-decoration-break: slice` makes the background render as if the inline box
   were one un-broken line, then slices it per line — so wrapped line `i` shows
   the strip's slice `[i*W, (i+1)*W]`, i.e. image row `i`. The gradient "wraps".

The container width (in character units) is what forces the break: `W` characters
per line → the strip folds into `H` rows. This is exactly the "container N times
narrower than the strip, and it wraps" intuition — the missing ingredient was
`box-decoration-break: slice` on a real inline (text) run.

## Findings & caveats (why this stays an experiment, not the default)

- **Must be true inline content.** Wrapping via inline-block spacer cells does
  **not** carry the sliced background (tested — renders blank). It needs text, so
  the element is filled with `W*H` transparent filler characters
  (`word-break: break-all`).
- **Sizing is font-metric-dependent.** The horizontal unit is `1ch` (a character
  advance), so pixels are only square when `line-height ≈ 1ch`. The `ch`/font-size
  ratio varies by font/OS, so exact geometry isn't portable (here it's tuned for
  the default monospace).
- **No fewer stops.** It's still `W*H` color stops (RLE-collapsed) — the same data
  as the per-row approach, just in one gradient instead of `N`. It reduces the
  number of background *layers* to one; it does not shrink the CSS.
- **`W*H` filler chars** must exist in the DOM.

So it's a neat proof that one gradient suffices, but the per-row technique remains
the practical default (axis-aligned, font-independent, no filler DOM).

`index.html` also shows both Marios (per-row vs one-gradient) side by side at
identical dimensions.

---

# Experiment #2 — performance: one gradient vs per-row, on the Matrix clip

```
node matrix-compare.mjs   # writes matrix-method1.html and matrix-method2.html
```

Both render the **same** clip (128×72, 20 frames, 16 colors, 5s loop, identical
palette and on-screen size). Open each in a real browser and profile playback in
DevTools (Performance panel / the FPS meter) to compare:

- **`matrix-method1.html`** — ONE `linear-gradient` per frame, on a wrapping
  inline text run (`box-decoration-break: slice`). The whole frame is a single
  background layer that swaps per frame.
- **`matrix-method2.html`** — one `linear-gradient` per row per frame, rows split
  across stacked `<div>` layers (the library's `frames` mode). Many background
  layers repaint per frame.

Both files are ~2.5 MB (comparable), so differences are about *paint structure*,
not download size.

## What surfaced while building this

- **Method 2 renders far more slowly than method 1** here — the per-row version
  repaints dozens of background layers each frame; the one-gradient version
  repaints a single layer. (Measure it yourself; headless took markedly longer to
  paint method 2's first frame.)
- **A multi-layer `background-image` that is *only* set inside `@keyframes` paints
  just its first layer** — the other rows vanish. It needs a **static** multi-layer
  `background-image` (frame 0) on the element too, so the layers/positions bind;
  the keyframes then swap it. (The library's `frames` mode already emits that
  static frame-0 background — this is why it works.) Method 1 sidesteps the whole
  issue because it is a single background layer.

## Sketch (simplified)

```html
<!-- one W×H box of filler characters that wraps into H lines of W -->
<div class="box"><span class="strip">0000000000000000000000000…</span></div>
```

```css
.box {
  --u: 1ch;                        /* one character = one pixel, horizontally */
  font: 20px/12px monospace; width: calc(var(--u) * 12);  /* 12 chars per line */
  white-space: normal; word-break: break-all; overflow: hidden;
}
.strip {
  box-decoration-break: slice;     /* THE trick: background is continuous across
                                      wrapped lines, then sliced per line */
  color: transparent;              /* hide the filler glyphs */
  background-repeat: no-repeat;
  background-size: calc(var(--u) * 192) 12px;   /* the full W*H unrolled strip */
  /* ONE gradient with every pixel unrolled row-major */
  background-image: linear-gradient(to right, #000 0, #000 calc(var(--u)*3), /* … */);
}
```
