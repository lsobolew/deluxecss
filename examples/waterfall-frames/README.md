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

## Sketch (simplified)

```html
<div class="pixel-image palette">
  <div class="pixel-image__layer"></div>  <!-- one of ~6 stacked layers -->
</div>
```

```css
.pixel-image { display: grid; }
.pixel-image__layer {
  background-repeat: no-repeat;
  background-size: 100% var(--pixel-height);
  animation: play 1.5s step-end infinite;
  will-change: background-image;
}
/* each keyframe swaps the WHOLE frame — image AND position together, so every
   stacked layer binds (animating the image alone paints only the first layer).
   Each frame is a fixed value → rasterised once, then cached across loops. */
@keyframes play {
  0%   { background-image: /* frame0 rows */; background-position: 0 0, 0 1px, /* … */; }
  12%  { background-image: /* frame1 rows */; background-position: 0 0, 0 1px, /* … */; }
  /* …one stop per frame… */
}
```
