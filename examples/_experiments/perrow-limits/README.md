# Experiment — the `10m` technique: per-row, single element, position-in-keyframe

This reproduces what the original `10m/` folder does, and answers *why it renders
a full 1910×1080 frame on one element* where Method 1 (one gradient) goes blank.

Two things, **neither of which is the frame count**:

1. **Per-row, not one-gradient.** The image is `H` separate row gradients (each
   ≤ W stops), not one giant gradient. So it never hits the single-gradient stop
   ceiling that kills Method 1 around ~576px.
2. **`background-position` is animated *inside* the `@keyframes`, together with
   `background-image`.** When only `background-image` is animated (position left in
   the base rule), Chrome binds just the **first** background layer → one row
   paints. Declaring both in the keyframe binds every layer — no static frame-0
   needed.

```
# regenerate at any size (env-tunable):
W=512 FPS=24 SECONDS=2 COLORS=24 node gen.mjs
W=960 FPS=24 SECONDS=1 node gen.mjs      # bigger (regenerate locally; large file)
```

Each document has the top-right **FPS meter** — measure in a **real browser**.

## Files

| file | what |
|---|---|
| `perrow-256px-24fps.html` | 256×145, 48 frames @ 24fps (2s) |
| `perrow-512px-24fps.html` | 512×290, 48 frames @ 24fps (2s) |

(768px+ omitted — files get large; regenerate with `gen.mjs`.)

## What to look for

- **Rendering**: full frames render at 512px (and `10m` proves 1910×1080 renders)
  — there is **no per-row single-element resolution wall** like Method 1 has.
- **Smoothness is the real limit**: repainting `H` row-gradients every frame at
  24fps gets expensive fast as resolution grows. Watch the FPS meter climb down as
  you go 256 → 512 → higher. The original `10m` sidesteps this by using only **4
  frames** on a very short, fast loop — few distinct repaints to cache.

## Conclusion

Frame count only affects CSS size / parse time, not whether a frame *renders*. The
per-row + position-in-keyframe technique renders arbitrarily large single-element
frames; playback smoothness at 24fps is what degrades with resolution.

## Sketch (simplified)

```css
/* one element, one gradient PER ROW, frame-swapped — image AND position in the
   keyframe together (the 10m technique), so all rows bind */
.img {
  --u: 3px;
  background-size: 100% 3px;
  animation: play 2s step-end infinite; will-change: background-image;
}
@keyframes play {
  0%   { background-image: /* frame0: H row-gradients */; background-position: 0 0, 0 3px, /* … */; }
  4%   { background-image: /* frame1 */;                  background-position: 0 0, 0 3px, /* … */; }
  /* …one stop per frame… */
}
```
