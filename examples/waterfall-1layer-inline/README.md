# Waterfall — static colors inlined (single layer)

Same single-layer palette animation, but colors that **never change** during the
loop are written as **literal hex** in the gradients; only the colors that
actually animate stay as `--color-*` variables. A diagnostic for "is the number
of CSS variables the bottleneck?"

## Technique

- **`inlineStaticColors: true`** on top of the single-layer palette animation.
- The generator splits palette slots into *animated* (kept as `var(--color-N)`)
  and *static* (inlined as `#rrggbb`).

## Pros

- Cuts `var()` **references** in the gradients dramatically — in this scene from
  ~35,700 to ~4,200 (≈ −88%), because the static regions (most of the frame)
  stop resolving variables.
- Slightly smaller file; may reduce style-recalc cost.

## Cons

- The inlined colors are **no longer controllable** — only the animating ones
  remain live-editable.
- If playback is still not smooth, the bottleneck is the per-frame gradient
  **repaint**, not the variable count.

## Sketch (simplified)

```css
/* only the ANIMATING colours stay variables; static ones are literal hex */
.pixel-image {
  background-image: linear-gradient(to right,
    #2a6d3a 0, #2a6d3a 40%,          /* static jungle — inlined, no var() */
    var(--water) 40%, var(--water) 100%);  /* moving water — the only variable */
  animation: cycle 1.5s step-end infinite;
}
@keyframes cycle { 0% { --water: #3aa0ff } 50% { --water: #8ecbff } }
```
