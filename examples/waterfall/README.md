# Waterfall — palette animation (multi-layer)

An animated GIF turned into pure CSS at the source's **original 640×286**
resolution. Palette-cycling animation: the pixel layout never moves, only the
`--color-*` values change over the loop.

## Technique

- **`animationMode: "palette"`** — every pixel keeps a fixed palette slot;
  each slot that changes over time gets its own `@keyframes` cycling its color
  (with `step-end`, so frames switch discretely). Static slots aren't animated.
- **Multi-layer** — the 286 rows are spread across ~28 stacked `<div>` layers so
  no single element carries the whole background.
- **`backgroundInKeyframes`** — each layer's background is delivered from a held
  `@keyframes` so the element is promoted to its own compositing layer.

## Pros

- Compact vs. frame-swapping: stores **one** background + short color keyframes,
  not a full copy of every frame (~5 MB here).
- The palette stays live-editable — override any `--color-*` to recolor.
- Full source resolution renders fine.

## Cons

- Only works when pixels **don't move** (color cycling) — good for water, fire,
  neon; not for arbitrary motion.
- Animating hundreds of custom properties across 28 compositing layers is
  **CPU-heavy**; at this resolution it can stutter (see the single-layer and
  `inline` variants, which trade resolution / variable count for smoothness).
