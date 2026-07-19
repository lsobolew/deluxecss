# Waterfall — static base + palette-animated overlay (640×286)

The overlay idea (static base + moving-region overlay) combined with **palette
cycling**: the animation keyframes only change `--color-*` *values* — no
`background-image` swapping. Rendered at the source's original **640×286**.

## Technique

- **`animationMode: "overlay-palette"`.** Split the frame into:
  - a **static base** painted once across stacked `<div>` layers (which render at
    full resolution where a single element goes blank). It references **only
    static color slots**, so when the palette animates it **never recomputes**.
  - a cropped **overlay** (`.pixel-image__overlay`, absolutely positioned to the
    bounding box of the moving region) whose gradients reference the **animated
    slots**. Only this small element repaints on each palette tick.
- The changing pixels in the box are grouped by their temporal color sequence
  into animated `--color-*` slots; the palette keyframes (on the container,
  `step-end`) cycle those values. Non-changing box pixels are `transparent`.

## Pros

- **Original 640×286** — the multi-layer static base renders where a single-
  element palette blanks.
- **Small**: ~5 MB — palette mode stores one background + short color keyframes,
  versus ~30 MB for the frame-swap overlay at full frame rate.
- **Least repaint area of the palette approaches**: the static base is painted
  once and excluded from recompute (it uses no animated variables); only the
  bounding-box overlay recomputes. Compare its FPS meter against `waterfall`
  (full-frame palette, where every layer touching the moving region recomputes).
- Palette stays live-editable.

## Cons

- Palette cycling only works when pixels **don't move** (color animation).
- Still ~522 animated custom properties feeding the overlay's gradients, so each
  tick recomputes the whole bounding box — cheaper than full-frame, but not free.
