# Guybrush — 4-frame sprite animation

A small character sprite (44×56, scaled ×6) animated from **four separate PNG
frames**. This is the ideal case for the library: tiny, few colors, few frames.

## Technique

- **`animationMode: "frames"`** built from multiple input files
  (`pixel-css frame1.png frame2.png … --animate`), quantized to a shared palette.
- Frames swapped inside `@keyframes` (`step-end`), position + image co-declared
  per stop so both layers bind.

## Pros

- Tiny and smooth — a few small frames swap trivially.
- Cleaner than the original hand-written version: proper `step-end` (no
  cross-frame tweening) and a fully controllable `--color-*` palette.

## Cons

- Frame-swap still stores each frame's gradients, so cost grows with
  size × frame count — fine for sprites, not for high-res video.
