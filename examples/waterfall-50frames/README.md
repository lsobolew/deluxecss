# Waterfall — all 50 frames, split across files

The complete waterfall loop: **every one of the GIF's 50 frames**, as pure CSS,
animating in Chrome and Safari. Because that is ~165 MB of stylesheet, it is
**split across 11 files** (`part-0.css` … `part-10.css`, each ≤ ~22 MB) that the
page reassembles with one `<link>` per part.

## Why splitting needs multi-layer

A stylesheet can only be cut **between** rules, never inside one. Single-element
frame output (see `waterfall-1element`) puts the whole animation in a *single*
`@keyframes` rule — one indivisible ~165 MB blob, impossible to split (and
GitHub rejects any file over 100 MB).

Multi-layer output instead gives **one `@keyframes` per layer**. This example
uses 15 layers (`--chunk 20`), so 15 independent keyframe rules; packing whole
rules up to a byte budget yields 11 files that each stay small and pushable. All
parts are linked together, so the browser sees the same complete stylesheet.

> Splitting keeps every *file* small; it does **not** shrink the total. All 50
> frames at 640×286 is ~165 MB of CSS however you slice it. For anything real,
> use fewer frames or a smaller size — this example exists to show the ceiling.

## How it renders at all

Every gradient is `var()`-free (`--inline-palette` inlines the colors and the
per-stop unit as `calc(100% / W * n)`), so no single value trips Chrome's
~50,000-`var()`-per-value substitution limit. Multi-layer also splits the paint
across 15 elements, so no single element does too much work. First paint is slow
(the browser parses ~165 MB before the first frame), then it runs at 60+ fps.

## Regenerate

```
node examples/waterfall-50frames/gen.mjs
```

Generates the multi-layer frames (`--inline-palette --chunk 20`) and splits the
result into `part-*.css` + `index.html`. Tune `TARGET_MB` in the script for
larger/fewer files, or `--chunk` for more/fewer layers.
