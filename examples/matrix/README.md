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
