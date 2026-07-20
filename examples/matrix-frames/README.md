# Matrix — the limits of frame-by-frame animation

A few seconds of the Matrix clip as pure CSS, frame by frame, at high colour
fidelity (up to 256 colours — not the tight palette the other examples use). This
is the "how far does frames mode go?" demo: it works, but you feel every cost.

The source frames (`matrix_000.png … matrix_215.png`) are committed in
`examples/assets/matrix/`, downscaled to 256px wide — exactly what the demo
renders. The ~193 MB of generated CSS is not committed; build it with:

```
node examples/matrix-frames/gen.mjs
```

216 frames (9 s @ 24 fps), 256px wide, 256 colours, multi-layer, split into 12
files. **≈193 MB raw → ≈12 MB gzipped.**

## What sets the ceiling

- **CSS size → first-paint time.** The browser parses every byte before frame
  one, so first paint takes seconds; then it plays at 60+ fps. Cost scales with
  `width × rows × frames × colours`.
- **It must be multi-layer.** A single element can't do this at all:
  - one giant `@keyframes` can't be split across files, and
  - stops written with `var(--pixel-width)` blow Chrome's ~50,000-`var()`-per-
    value substitution limit and render blank. `--inline-palette` makes the
    gradients var-free (literal colours + `calc(100% / W * n)` stops), and
    multi-layer splits both the stops and the paint across elements, so each
    layer's `@keyframes` stays small and renders.
- What bounds it is the `var()` count per value and the total parse size — not
  the element size or the length of any single value.

## Takeaway

Frames mode is right for short, small, few-colour sprites (see `stan`). For
anything photographic or long, the byte cost dominates. Palette/overlay modes
(see `waterfall-colorcycle`) animate far more cheaply when the motion is a colour
cycle rather than arbitrary per-pixel change.
