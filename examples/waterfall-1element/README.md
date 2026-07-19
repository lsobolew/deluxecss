# Waterfall — one element, frame-by-frame (the "10m" technique)

The full 640×286 waterfall animated **on a single element**, frame by frame —
the original `10m` idea. Every frame is 286 stacked row-gradients, and one
`@keyframes` swaps the whole `background-image` (and `background-position`) per
frame with `step-end`. No child layers, and — with `--inline-palette` — no
`--color-*` variables: colors are literals and the per-stop unit is inlined too,
so the gradients contain **no `var()` at all**.

Renders in Chrome **and** Safari.

## The bug this dodges — Chrome's var() substitution limit

A single-element image packs every row's stops into **one** `background-image`
value. Written the normal way, each stop carries a `var(--pixel-width)` (and a
`var(--color-*)`), so a wide image reaches **tens of thousands of `var()`
references in that one value**. Past roughly **50,000 var() references per
property value, Blink (Chrome) stops substituting** — it discards the whole
declaration and the element renders **blank**. WebKit (Safari) has no such limit,
which is why the naive version *looked* like it worked.

Measured on this image (`--single-element`, one value per frame):

| per-value `var()` refs | Chrome |
|-----------------------:|:------:|
| ~1,400 (this example, `--inline-palette`) | ✅ renders |
| 51,414 | ✅ renders |
| 52,808 | ❌ blank |
| ~103,000 (640px, palette in vars) | ❌ blank |

It is **not** the CSS file size, the value length, the element size, the layer
count, `container-type`, or `background-position` — only the number of `var()`
references Blink must resolve inside a single value.

## The fix

`--inline-palette` writes colors as literals **and** inlines the per-stop unit as
`calc(100% / W * n)` instead of `var(--pixel-width) * n`. `background-size: 100%`
stretches each row-gradient to the element width, so `100% / W` stays correct at
any size — the output is fully responsive yet contains no `var()`, so Chrome
renders it. (`--pixel-height` is still a variable, but it appears only per row,
far under the limit.) The CLI warns if any generated `background-image` value
would cross the ~50k-var() limit.

## Pros / cons

- **Pro:** no extra DOM, no palette, closest to the raw "image as one CSS value"
  idea; renders in both engines; smooth once parsed.
- **Con:** a big stylesheet (~20 MB for 4 frames at 640px) and a slow first
  paint. For anything you ship, prefer the multi-layer `waterfall-frames`, which
  splits the rows across elements (each value stays tiny) and is far lighter.

## Technique

- `animationMode: "frames"`, `singleElement: true`, `inlinePalette: true`.
- One element, `background-size: 100% var(--pixel-height)`, 286 row-gradients.
- `@keyframes` swaps `background-image` + `background-position` together
  (`step-end`), with an explicit terminal `100%` stop (the Safari step-end fix).
