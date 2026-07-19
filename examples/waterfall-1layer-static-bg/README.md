# Waterfall — background on the element (single layer)

The original single-layer variant: the `background-image` is a **static property
on the element**, not delivered from a keyframe. Palette cycles via `--color-*`.
256×114 (×2). This is the baseline to compare the folder-9 (`backgroundInKeyframes`)
technique against.

## Technique

- **`animationMode: "palette"` + `singleElement`**, without `backgroundInKeyframes`.
- `background-image` sits statically on the element; only the `--color-*`
  custom properties are animated (`@keyframes`, `step-end`).
- No `will-change`, no compositing-layer promotion for the background.

## Pros

- Simplest structure; smallest conceptual footprint.
- Palette stays live-editable.

## Cons

- The background is not promoted to its own layer, so the browser repaints it in
  place as the palette changes — no raster caching benefit.
- Compare its FPS meter against `waterfall-1layer` (same image, background in a
  held keyframe) to see whether layer promotion helps on your machine.

## Sketch (simplified)

```html
<div class="pixel-image palette"></div>
```

```css
.palette { --color-0: #2a6d3a; --color-1: #8ecbff; }
.pixel-image {
  background-repeat: no-repeat;
  background-size: 100% var(--pixel-height);
  /* background-image sits STATICALLY on the element (no keyframe, no will-change) */
  background-image: linear-gradient(to right, var(--color-0) 0, var(--color-1) 100%);
  animation: cycle 1.5s step-end infinite;   /* only the palette cycles */
}
@keyframes cycle { 0% { --color-1: #8ecbff } 50% { --color-1: #ffffff } }
```
