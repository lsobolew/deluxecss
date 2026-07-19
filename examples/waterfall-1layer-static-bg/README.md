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
