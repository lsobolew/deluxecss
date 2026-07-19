# Matrix — live-action film clip (frames mode)

The first ~5 seconds of a film clip as pure CSS, frame by frame. Built from the
movie frames in `10m/` (`matrix_000..119` = first 5s at 24fps), sampled to 50
playback frames at **256px** width.

## Technique

- **`animationMode: "frames"`** (`--anim-mode frames`), multi-layer, position and
  image co-animated in the keyframes.
- Built from a **sequence of PNG files** (`decodeFilesToFrames`) rather than a
  GIF, then quantized to a shared 20-color palette.

## Pros

- Handles real, fully-moving footage — every pixel can change each frame.
- Palette still controllable via `--color-*`.

## Cons

- **This is a stress test, not a recommended use.** Live-action doesn't compress
  under RLE, so even at 256px / 20 colors it's ~31 MB.
- Frame-by-frame film at higher resolution or frame rate becomes impractically
  large (see the `_experiments/method1-limits` and `perrow-limits` folders for
  where the techniques break down). Pixel art and low-color animation are where
  this library shines.

## Sketch (simplified)

```html
<div class="pixel-image palette">
  <div class="pixel-image__layer"></div>  <!-- one of ~3 stacked layers -->
</div>
```

```css
/* frames mode: each keyframe swaps the whole frame's gradients (image +
   position together). Built from a PNG sequence, not a GIF. */
.pixel-image__layer {
  background-size: 100% var(--pixel-height);
  animation: play 5s step-end infinite;   /* 50 frames over 5s */
  will-change: background-image;
}
@keyframes play {
  0% { background-image: /* frame 0 */; background-position: 0 0, 0 1px, /* … */; }
  2% { background-image: /* frame 1 */; background-position: 0 0, 0 1px, /* … */; }
  /* …one stop per frame… */
}
```
