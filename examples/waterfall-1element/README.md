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

## Dead end: one variable per frame

A tempting way to split single-element output across files: put each frame's
gradient list in its own custom property in its own file, and have the main
`@keyframes` only reference them —

```css
/* frame-0.css */  :root { --f-0: linear-gradient(...), /* 286 rows */; }
/* main.css   */   @keyframes p { 0% { background-image: var(--f-0); } 25% { background-image: var(--f-1); } }
```

Tested: **it renders blank in Chrome.** A *small* gradient in a variable animates
fine, but Blink applies a far tighter limit to the tokens produced by *custom-
property substitution* than to a value written literally. The exact same frame
list renders when inlined straight into the keyframe (this example) but is
dropped when pulled in through `var()` — so a full frame's worth of stops blows
the substitution cap and the element paints nothing. Splitting a single-element
animation across files this way is not possible; only multi-layer output splits
(see `waterfall-50frames`), because there each layer is a separate, literal
`@keyframes` rule.

## Dead end: one animation per frame

Another split idea: make each frame its own `@keyframes` (its own file) and have
the element run them all with staggered `animation-delay`, so animation N shows
frame N during its slice.

Tested: a **single pass** works — finite animations (`… 1s 1 forwards`) staggered
by delay do sequence the frames correctly (frame 0, then 1, then 2, …), and the
data really is split across files. But it **cannot loop** in pure CSS. To repeat,
every animation has to be running at once, and concurrent animations on the *same
property* of the *same element* resolve by list order — the last active one wins,
not the one whose time slice it is. So on loop only the last animation's frame
shows and the rest paint blank. Multi-layer avoids this precisely because each
layer is a *separate element*: its `@keyframes` loops on its own with nothing
else competing for its `background-image`.

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
