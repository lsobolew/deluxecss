# Waterfall — static base + animated overlay

A "dirty region" approach: the pixels that never change are painted **once** as a
static background; a separate, mostly-transparent **overlay** layer defines only
the pixels that actually move, and it is frame-swapped. 256×114 (×2).

## Technique

- **`animationMode: "overlay"`** — split the image into:
  - a static base (unchanging pixels; changing pixels cut out as `transparent`);
  - an overlay `<div>` whose per-frame `background-image` defines just the
    changing pixels, everything else `transparent`. Rows with no change are
    omitted from the overlay entirely.
- **Cropped to the moving region.** The overlay is not full-frame: it's an
  absolutely-positioned element sized to the **bounding box** of every pixel that
  ever changes, offset with `left`/`top`. So each frame only repaints that
  rectangle. For this clip the box is ~106×105 of 256×114 — the overlay's paint
  area is ~60% smaller than the full frame.
- **`changeThreshold`** (default 16) — a pixel counts as moving only if its
  source color varies by more than this per channel, so quantization flicker
  doesn't inflate the box. (Here the water genuinely spans the box, so raising it
  changes little; it matters more on noisier sources.)
- The overlay carries a static frame-0 background as a reduced-motion fallback.

## Pros

- Each frame only repaints the **small moving region**, not the whole image.
- The static base is rasterized once.

## Cons

- The bounding-box crop shrinks the **paint area**, but not the file much when
  the moving region is large and detailed (like this waterfall + pool): the file
  size is dominated by the dense water gradients, and cropping only removes the
  cheap transparent margins. The crop pays off most when the moving region is
  small relative to the frame (a blinking light, a small sprite).
- File is still bigger than palette mode — the overlay stores every frame's
  moving-region gradients. Fewer frames (`--max-frames`) is the bigger lever for
  this content.
