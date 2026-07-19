# Waterfall — overlay + palette, ONE combined keyframes (640×286)

Same as `waterfall-overlay-palette` (static base + a palette-cycling overlay),
but the color cycling is expressed as **one** `@keyframes` whose every stop
defines **all** the changing colors for that frame — instead of one `@keyframes`
per color.

## Technique

- **`animationMode: "overlay-palette"` + `paletteKeyframes: "combined"`.**
- One animation on the container:
  ```
  @keyframes pxc-cycle {
    0%    { --color-49: c; --color-50: c; … /* every changing slot, frame 0 */ }
    12.5% { --color-49: c; --color-50: c; … /* frame 1 */ }
    /* …one stop per frame, each listing all changing slots… */
  }
  .pixel-image { animation: pxc-cycle 1.5s step-end infinite; }
  ```
- Contrast with the per-color variant: 522 separate `@keyframes` (one per slot,
  each with its own dedup) and 522 animations running at once.

## Pros

- **One animation** instead of hundreds — conceptually simple, one timeline.
- Same rendering benefits as the overlay-palette hybrid: static base painted
  once, only the moving region repaints.

## Cons — and the finding

- **Heavy to initialize.** Each keyframe stop sets *all* ~500 custom properties,
  so the keyframe model is `O(frames × slots)`. At 50 frames it was so slow to
  start that headless didn't paint it within 160 s; the per-color variant (522
  small animations) started fine at 50 frames. **This example is therefore capped
  at 8 frames** so it renders — which is itself the result: the per-color layout
  scales to many frames far better than one giant combined keyframes.
- **No per-slot dedup**, so a slot's value is repeated every stop even when it
  didn't change — larger than per-color for the same frames.

Open it next to `waterfall-overlay-palette` and compare the FPS meter (and how
long each takes to first paint).

## Sketch (simplified)

```css
/* one animation; every stop defines all the changing colours for that frame */
.pixel-image { position: relative; animation: cycle 1.5s step-end infinite; }
.pixel-image__overlay { /* references the animated --color-* slots */ }

@keyframes cycle {
  0%    { --color-49:#3aa0ff; --color-50:#8ecbff; /* …all changing slots… */ }
  12.5% { --color-49:#2b7fd0; --color-50:#a6d8ff; /* … */ }
  /* …one stop per frame… */
}
```
