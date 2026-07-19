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
- The overlay carries a static frame-0 background as a reduced-motion fallback.

## Pros

- Each frame only repaints the **small moving region**, not the whole image.
- The static base is rasterized once.

## Cons

- With aggressive quantization, near-identical colors "flicker" between frames,
  so more rows count as changing than you'd expect — the overlay is larger than
  the visually-moving area suggests.
- File is bigger than palette mode (the overlay still stores every frame's
  moving-region gradients).
