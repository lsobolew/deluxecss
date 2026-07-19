# Waterfall — palette animation (single layer)

Same palette-cycling waterfall, but painted on **one element** instead of ~28
stacked layers. Downscaled to **256×114** (scaled ×2 for display) because a
single element hits a paint-complexity ceiling around ~256px wide for a detailed
scene.

## Technique

- **`animationMode: "palette"` + `singleElement` + `backgroundInKeyframes`** —
  the whole image is one background delivered from a held `@keyframes`; the
  `--color-*` slots cycle via their own keyframes on the same element.
- One compositing layer, `will-change` promoted.

## Pros

- **Smoother than the multi-layer full-res version**: one compositing layer and
  ~6× fewer pixels to recompute each tick.
- Small (~1.8 MB), palette stays live-editable.

## Cons

- Lower resolution — a single element can't paint a full-res detailed frame
  (goes blank past ~256px here).
- Still animates custom properties on the CPU; smoothness depends on machine.
