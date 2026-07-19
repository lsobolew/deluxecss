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

## Sketch (simplified)

```html
<div class="pixel-image palette"></div>  <!-- single element, no child layers -->
```

```css
.palette { --color-0: #2a6d3a; --color-1: #8ecbff; }
.pixel-image {
  background-repeat: no-repeat;
  background-size: 100% var(--pixel-height);
  /* the background is delivered from a HELD @keyframes (folder-9 trick),
     not set statically — this promotes the element to its own layer */
  animation: bg 1.5s step-end infinite, cycle 1.5s step-end infinite;
  will-change: background-image;
}
@keyframes bg { 0%, 100% {
  background-image: linear-gradient(to right, var(--color-0) 0, var(--color-1) 100%);
} }
@keyframes cycle { 0% { --color-1: #8ecbff } 50% { --color-1: #ffffff } }
```
