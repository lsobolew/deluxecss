# Experiment — grouping the palette-cycling keyframes

In `palette` / `overlay-palette` modes the animated colors can be laid out as
**many small animations** or **few big ones**. The `paletteKeyframes` option
dials this:

- `per-color` — one `@keyframes` per animated slot, with per-slot dedup (the
  efficient default): N tiny animations.
- a **number N** — group the slots into `@keyframes` of N colors each, so
  `⌈slots/N⌉` animations; every stop sets its group's N colors (no dedup).
- `combined` — one `@keyframes` whose every stop sets *all* the colors.

```
node gen.mjs                       # per-color, 1, 12, 64, combined
CONFIGS=1,8,32,128 FRAMES=8 node gen.mjs
```

Open `index.html`, then each config, and compare the FPS meter — and especially
**how long each takes to first paint** (the interesting axis here).

## Configs (this clip: 479 animated colors, 8 frames)

| paletteKeyframes | @keyframes | shape |
|---|---|---|
| `per-color` | 479 | 479 animations × 1 color (dedup) |
| `1` | 479 | 479 animations × 1 color |
| `12` | 40 | 40 animations × 12 colors |
| `64` | 8 | 8 animations × 64 colors |
| `combined` | 1 | 1 animation × 479 colors |

## What surfaced

- **Many small animations initialize fastest; one giant `@keyframes` is the
  slowest to start.** Building the keyframe model is roughly `O(frames × colors)`
  for `combined` (every stop lists every color), so a single 500-color keyframe
  over many frames can take *seconds* to first paint — at 50 frames it didn't
  paint at all in a headless 160 s budget, which is why the frame count here is
  kept small. `per-color` starts quickly even with hundreds of animations.
- Steady-state FPS (once warmed up) is much closer between configs than the
  first-paint cost — the grouping mostly moves work into initialization.
- File size is nearly flat; grouping reorganizes the same data (dedup in
  `per-color` shaves a little).

**Takeaway:** prefer many small animations (`per-color`); grouping into fewer,
bigger keyframes trades away startup time for no real steady-state win.
