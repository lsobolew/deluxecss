# Waterfall — one element, frame-by-frame (and where it breaks)

The full 640×286 waterfall animated **on a single element**, frame by frame —
the original `10m` idea. Every frame is 286 stacked row-gradients, and one
`@keyframes` swaps the whole `background-image` (and `background-position`) per
frame with `step-end`. No child layers, and — with `--inline-palette` — no
`--color-*` variables: colors are literals.

> ⚠️ **Renders in Safari, blank in Chrome.** This page is a *limit demo*, not a
> shippable technique. See below for exactly why.

## The specific cause (measured)

Chrome's engine, **Blink, caps a single CSS property value at 2²¹ =
2,097,152 characters (~2 MiB)**. Past that, Blink silently drops the whole
declaration. Single-element output packs *all* 286 rows into **one**
`background-image` value (~5 MiB here), so Chrome throws the `background-image`
away and the element paints nothing. WebKit (Safari) has no such cap, so it
renders fine — which is why this looked like it "worked" in the original
experiment.

Bisected on this image (`--single-element`, colors inlined):

| width | rows | longest `background-image` value | Chrome |
|------:|-----:|---------------------------------:|:------:|
| 256 | 114 | 1,377,202 chars | ✅ renders |
| 320 | 143 | 2,043,863 chars | ✅ renders |
| **—** | **—** | **2,097,152 (2²¹) — the cap** | — |
| 328 | 147 | 2,099,615 chars | ❌ blank |
| 384 | 172 | 2,444,936 chars | ❌ blank |
| 640 | 286 | ~4,900,000 chars | ❌ blank |

The boundary sits exactly on 2²¹. It is **not** the element size, the row/layer
count, the palette variables, or `background-position` (a shorter value that
clears the cap for longer) — it is the length of the single `background-image`
value.

## Why multi-layer is the answer

Splitting the rows across several `<div>` layers keeps each element's
`background-image` value well under 2 MiB, so Chrome renders it. That is exactly
what `waterfall-frames` (and every other shipped animation) does. The CLI now
prints a warning when a generated `background-image` value crosses the 2²¹ cap.

## Technique (for reference)

- `animationMode: "frames"`, `singleElement: true`, `inlinePalette: true`.
- One element, `background-size: 100% var(--pixel-height)`, 286 row-gradients.
- `@keyframes` swaps `background-image` + `background-position` together
  (`step-end`), with an explicit terminal `100%` stop (the Safari fix).
