# deluxecss

**Turn an image into pure CSS pixel-art with a live, controllable color palette.**

> ▶ **Live demo:** **https://lsobolew.github.io/deluxecss/**
>
> The demo shows sprites and Amiga color-cycling scenes running as **pure CSS —
> no GIF, no base64, no JavaScript**. (This README can't run them: GitHub strips
> CSS from Markdown, so the animations only come alive on the demo site.)

---

A hobby project. It converts a raster image — or an animated GIF, or an Amiga
**IFF** file — into a stylesheet made of layered `linear-gradient`s whose colors
are CSS custom properties (`--color-0`, `--color-1`, …). Because the colors are
variables, you can **recolor or animate the whole image at runtime** by changing
one value.

```css
/* recolor Mario into Luigi — the whole sprite follows, instantly */
.palette {
  --color-1: #00a800; /* red   → green */
  --color-3: #fcfcfc; /* skin  → white */
}
```

## Why not just a base64 image?

A base64 `background-image` bakes the pixels into one opaque blob: you can't
reach inside it to change a color, so you can't recolor it or animate its palette
without re-exporting the whole image. That's the limitation deluxecss is built
around.

deluxecss keeps every pixel as a **`linear-gradient` color stop** instead. Each
row of the image becomes one horizontal gradient with hard stops (run-length
encoded, so a run of identical pixels costs just two coincident stops); rows are
stacked with `background-position`. Colors are emitted **once** as `--color-*`
variables and referenced by index — which is exactly what makes live recoloring
and palette animation free.

## This is an experiment, with real limits

It's a hobby project whose main goal is to **probe how far pure CSS and browsers
can be pushed** as a pixel-art / animation engine — not a production image
format. Expect rough edges:

- **CSS size grows with pixel count.** Detailed or large images produce big
  stylesheets. Quantize with `--max-colors` and keep the source small; this
  shines on low-color pixel art, not photographs.
- **Palette animation runs on the CPU** (the browser recomputes gradients as the
  variables change), so high-resolution palette animation can drop frames.
- **Browser ceilings are part of the fun.** e.g. Chrome/Blink stops substituting
  custom properties past ~50k `var()` in a single value; single-element output
  can hit that and render blank (the tooling warns and offers `--inline-palette`
  to dodge it). Discovering and working around these limits *is the project.*

## Install

```sh
npm install deluxecss
```

Requires Node ≥ 18. Uses [`sharp`](https://sharp.pixelplumbing.com/) for decoding
(PNG/JPEG/WebP/GIF/AVIF/TIFF) and [`image-q`](https://github.com/ibezkrovnyi/image-quantization)
for quantization. Amiga **IFF ILBM/PBM** files are decoded natively (no `sharp`),
including their `CRNG`/`CCRT` color-cycling ranges.

## Usage

### CLI

```sh
# a sprite → CSS (exact palette, best for real pixel art)
deluxecss sprite.png -o sprite.css

# also emit a complete, ready-to-open example page that links the CSS
deluxecss sprite.png -o sprite.css --html sprite.html

# quantize a photo down to 16 controllable colors
deluxecss photo.jpg -o photo.css --max-colors 16

# an animated GIF → a pure-CSS animation (palette cycling), colors inlined
deluxecss scene.gif --animate --anim-mode overlay-palette --inline-static-colors \
  -o scene.css

# a sprite sequence → a frame-by-frame animation
deluxecss f1.png f2.png f3.png f4.png --animate --anim-mode frames -o sprite.css
```

Run `deluxecss --help` for the full option list.

### Library

```ts
import { imageToCss, animateImageToCss } from "deluxecss";

const { css, meta, html } = await imageToCss("sprite.png", { maxColors: 16 });
// meta = { width, height, colors, layerCount, selector, layerClass, ... }

const anim = await animateImageToCss("scene.gif", {
  animationMode: "overlay-palette",
  inlineStaticColors: true,
});
```

If you already have raw RGBA pixels, call the synchronous
`convert(decodedImage, options)` directly (no `sharp` needed) — handy in tests or
the browser.

### Web component (optional)

A zero-dependency `<pixel-image>` element renders the generated CSS and can show a
live palette-editing panel:

```html
<script type="module">import "deluxecss/widget";</script>
<pixel-image css="sprite.css" meta="sprite.json" controls></pixel-image>
```

## The idea, by example

The output is just a stylesheet plus a little markup. Minimal, hand-simplified:

```html
<link rel="stylesheet" href="sprite.css" />
<div class="pixel-image palette">
  <div class="pixel-image__layer"></div>
</div>
```

```css
/* sprite.css — a 4×2 sprite (simplified for readability) */

/* the palette: change any of these and the sprite recolors live */
.palette {
  --color-0: #1a1a2e;
  --color-1: #e94560;
  --color-2: #f5f5f5;
}

.pixel-image {
  display: grid;
  width: 4px;                 /* one CSS px per source pixel; scale it up freely */
  aspect-ratio: 4 / 2;
  container-type: size;
  --pixel-height: calc(100cqh / 2);
}

.pixel-image__layer {
  background-repeat: no-repeat;
  background-size: 100% var(--pixel-height);          /* each gradient is one row tall */
  background-image:
    /* row 0: red, white, white, red — hard stops = crisp pixels */
    linear-gradient(to right, var(--color-1) 0 25%, var(--color-2) 25% 75%, var(--color-1) 75% 100%),
    /* row 1: solid background */
    linear-gradient(to right, var(--color-0) 0 100%);
  background-position: 0 0, 0 var(--pixel-height);    /* stack row 1 under row 0 */
}
```

Real output is denser (per-pixel stops, more rows split across a few `<div>`
layers), but the shape is exactly this.

## Color cycling

The signature trick of Amiga-era art (waterfalls, fire, neon, flowing water):
the pixels never move — only a **range of palette entries rotates** over time.
deluxecss reproduces it by animating the `--color-*` variables in `@keyframes`,
so nothing repaints except the colors:

```css
@keyframes flow {
  0%   { --color-1: #2a6; --color-2: #4c8; --color-3: #6ea; }
  33%  { --color-1: #6ea; --color-2: #2a6; --color-3: #4c8; }
  66%  { --color-1: #4c8; --color-2: #6ea; --color-3: #2a6; }
  100% { --color-1: #2a6; --color-2: #4c8; --color-3: #6ea; }
}
.palette { animation: flow 1s steps(3) infinite; }
```

For efficiency deluxecss can animate **only** the region that changes (a static
base + a small cycling overlay), inline the static colors as literals, and split
the color budget between a rich static background and a small animated palette
(`--max-colors-static` / `--max-colors-animated`). And because IFF files carry
their cycle definition (`CRNG`/`CCRT`) in the file, deluxecss reads that range
and reproduces the *exact* original cycle — no GIF, no frame sampling.

## Demo & examples

The [`examples/`](examples/) folder is a small gallery (served with
`npm run demo`, and mirrored on the live demo above): a recolorable Mario, the
Stan sprite animation, a Monkey Island waterfall as color cycling, an Amiga IFF
heart, EGA/CGA/VGA palette reductions, and a frame-by-frame stress test. Each
page shows its CSS size (raw → gzipped) and the exact command that produced it.

## License

MIT © Łukasz Sobolewski
