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
