# Stan — 4-frame sprite animation

Stan the fast-talking salesman (44×56, scaled ×6) animated from **four separate
PNG frames** (`stan1.png … stan4.png`). This is the ideal case for the library:
tiny, few colors, few frames.

## Technique

- **`animationMode: "frames"`** built from multiple input files
  (`deluxecss frame1.png frame2.png … --animate`), quantized to a shared palette.
- Frames swapped inside `@keyframes` (`step-end`), position + image co-declared
  per stop so both layers bind.

## Pros

- Tiny and smooth — a few small frames swap trivially.
- Cleaner than the original hand-written version: proper `step-end` (no
  cross-frame tweening) and a fully controllable `--color-*` palette.

## Cons

- Frame-swap still stores each frame's gradients, so cost grows with
  size × frame count — fine for sprites, not for high-res video.

## Sketch (simplified)

```html
<div class="pixel-image palette">
  <div class="pixel-image__layer"></div>
</div>
```

```css
/* built from four PNG files: deluxecss stan1.png stan2.png stan3.png stan4.png --animate */
.pixel-image__layer {
  background-size: 100% var(--pixel-height);
  animation: play 0.6s step-end infinite;   /* 4 frames → 25% apart */
  will-change: background-image;
}
@keyframes play {
  0%   { background-image: /* frame 1 */; background-position: 0 0, 0 1px, /* … */; }
  25%  { background-image: /* frame 2 */; background-position: 0 0, 0 1px, /* … */; }
  50%  { background-image: /* frame 3 */; background-position: 0 0, 0 1px, /* … */; }
  75%  { background-image: /* frame 4 */; background-position: 0 0, 0 1px, /* … */; }
  100% { background-image: /* frame 4 */; background-position: 0 0, 0 1px, /* … */; }
}
```

## Gotcha — the explicit `100%` keyframe

Note that `100%` repeats the last frame. It looks redundant (with `step-end`
the last frame already holds from 75% to the loop), but it is **required for
Safari**. Without an authored `100%` stop, Safari synthesises one from the
element's base style — which in frames mode has no `background-image` /
`background-position` — and, contrary to `step-end`, applies that empty base
across the whole final-frame window `[75%, 100%)`. `background-position`
collapses to `0 0`, so all the row gradients stack on top of each other and only
**one line** paints for the last quarter of every loop. Pinning the last frame
at `100%` gives Safari a defined end state and the glitch disappears. The
library emits this terminal keyframe automatically for every `step-end`
animation (frames, overlay, and palette modes).
