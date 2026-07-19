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
