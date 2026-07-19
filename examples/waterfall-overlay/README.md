# Waterfall — static base + animated overlay

A "dirty region" approach: the pixels that never change are painted **once** as a
static background; a separate, mostly-transparent **overlay** layer defines only
the pixels that actually move, and it is frame-swapped. Rendered at the source's
original **640×286** (16 frames).

## Technique

- **`animationMode: "overlay"`** — split the image into:
  - a static base (unchanging pixels; changing pixels cut out as `transparent`),
    painted across **stacked `<div>` layers**. A single element can't paint a
    full-resolution frame (it goes blank past ~256px, and delivering it via a
    *held* `@keyframes` doesn't help — only genuinely frame-swapping content gets
    the compositor tiling that renders large). Splitting the base across layers
    is what lets it render at 640;
  - a `.pixel-image__overlay` `<div>` whose per-frame `background-image` defines
    just the changing pixels, everything else `transparent`. Rows with no change are
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

## Sketch (simplified)

```html
<div class="pixel-image palette">
  <div class="pixel-image__layer"></div>    <!-- static base (one of N layers) -->
  <div class="pixel-image__overlay"></div>  <!-- only the moving region -->
</div>
```

```css
.pixel-image { position: relative; display: grid; }
.pixel-image__layer { /* base — painted once, never repaints */ }

.pixel-image__overlay {                 /* cropped to the water's bounding box */
  position: absolute;
  left:  calc(var(--pixel-width)  * 202);   /* box offset */
  top:   calc(var(--pixel-height) * 24);
  width: calc(var(--pixel-width)  * 266);   /* box size */
  height:calc(var(--pixel-height) * 262);
  background-size: 100% var(--pixel-height);
  animation: play 1.5s step-end infinite;   /* swaps the whole overlay per frame */
}
/* each frame = a fixed background (rasterised once, then cached) */
@keyframes play {
  0%  { background-image: /* frame 0 — changing pixels, else transparent */; }
  50% { background-image: /* frame 1 */; }
}
```
