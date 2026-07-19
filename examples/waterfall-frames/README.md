# Waterfall — frames mode (background-image swap)

The animation as a true **frame-by-frame** flip: each frame is a complete
background-image, swapped per frame inside `@keyframes`. Original **640×286**,
8 frames.

## Technique

- **`animationMode: "frames"`** — for every frame, all rows are rendered as
  gradients; the frame's whole `background-image` is set at its keyframe stop
  (`step-end`, no tween).
- **Multi-layer**: rows split across ~6 stacked `<div>` layers so a single
  element isn't overloaded.
- Each keyframe stop sets `background-image` **and** `background-position`
  together, which binds every stacked layer (animating the image alone would
  paint only the first layer).

## Pros

- Works for **any** animation, including moving pixels (not just color cycling).
- Each frame is a fixed value the browser can rasterize once and cache; the
  element is layer-promoted (`will-change`), so playback runs off the main paint
  path.

## Cons

- **Large CSS**: it stores every frame's full gradient set (~40 MB here for 8
  frames). Scales poorly with resolution × frame count.
- Detailed live-action content barely compresses under run-length encoding.
