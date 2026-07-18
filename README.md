# pixel-css

Convert any image into **pure CSS pixel-art with a live-controllable color palette**.

Unlike a base64 `background-image`, the output is a stack of layered
`linear-gradient`s whose colors are CSS custom properties (`--color-0`,
`--color-1`, …). That means you can **recolor or animate the whole image at
runtime** by changing a variable — no re-export, no image swap.

```css
/* recolor Mario into Luigi — the whole sprite follows */
.palette {
  --color-1: #00a800; /* red   → green */
  --color-3: #fcfcfc; /* skin  → white */
  --color-2: #0000bc; /* olive → blue  */
}
```

It also turns an **animated GIF into a pure-CSS animation**: one static image
plus `@keyframes` that cycle the palette — no JavaScript and no custom element.

Ships as:

- a **CLI** (`pixel-css image.png -o image.css`),
- a **library** (`imageToCss` / `animateImageToCss`),
- a zero-dependency **Web Component** (`<pixel-image>`) with a palette control panel.

## How it works

Each row of the image becomes a single horizontal `linear-gradient` with hard
color stops, run-length-encoded so a run of identical pixels costs only two
coincident stops. Rows are stacked with `background-position`, and — because CSS
gets slow with thousands of background layers — rows are split across a handful
of grid-stacked `<div>` layers. Colors are emitted once as custom properties and
referenced by index, which is what makes live recoloring free.

## Install

```sh
npm install pixel-css
```

Requires Node ≥ 18. Uses [`sharp`](https://sharp.pixelplumbing.com/) for decoding
(PNG/JPEG/WebP/GIF/AVIF/TIFF) and [`image-q`](https://github.com/ibezkrovnyi/image-quantization)
for quantization.

## CLI

```sh
# exact palette (best for real pixel art)
pixel-css sprite.png -o sprite.css --meta sprite.json

# quantize a photo down to 12 controllable colors
pixel-css photo.jpg -o photo.css --max-colors 12 --scale 2
```

```
pixel-css <input> [options]

  -o, --out <file>            Write CSS here (default: stdout)
      --meta <file>           Also write metadata JSON here
      --html <file>           Also write a demo HTML fragment here
      --animate               Treat input as animated (GIF/WebP): CSS keyframes, no JS
      --anim-mode <mode>      palette | frames (default: palette)
      --max-frames <n>        Sample down to at most n frames (evenly spaced)
      --no-will-change        Omit the will-change hint (frames mode)
      --duration <s>          Animation loop duration in seconds (default: from GIF)
      --resize <w>            Downscale to width w before converting (nearest)
      --single-element        Paint on one element (no layer divs); 1 layer only
      --max-colors <n>        Quantize to at most n colors (default: all; anim: 64)
      --dither <mode>         floyd-steinberg | atkinson (default: off)
      --alpha-threshold <n>   Alpha (0-255) below which a pixel is transparent (128)
      --alpha-mode <mode>     binary | keep (default: binary)
      --scale <n>             Zoom multiplier written to --scale (default: 1)
      --sizing <mode>         container | percent | pixel (default: container)
      --chunk <n>             Rows per background layer (default: 50)
      --max-stops <n>         Max color stops per layer before splitting (4000)
      --layer-element <mode>  div | pseudo (default: div)
      --prefix <name>         Palette custom-property prefix (default: color)
      --selector <sel>        Container class selector (default: .pixel-image)
      --palette-selector <s>  Selector carrying the palette (":host, .palette")
      --format <fmt>          hex | rgb (default: hex)
      --at-property           Register palette vars with @property (animatable)
      --minify                Minify the CSS output
  -h, --help                  Show this help
```

## Library

```ts
import { imageToCss } from "pixel-css";

const { css, meta, html } = await imageToCss("sprite.png", {
  maxColors: 16,
  scale: 4,
});
// meta = { width, height, colors, layerCount, selector, layerClass, ... }
```

`imageToCss` decodes then converts. If you already have raw RGBA pixels, call the
synchronous `convert(decodedImage, options)` directly (no `sharp` needed) — handy
in tests or the browser.

### Animation

```ts
import { animateImageToCss } from "pixel-css";

const { css, meta } = await animateImageToCss("waterfall.gif", {
  resize: 200,        // downscale — CSS grows with pixel count
  maxColors: 48,
  singleElement: true, // render on a single <div>, no child layers
  sizing: "pixel",
  scale: 3,
});
// meta.animation = { duration, frames, animatedSlots }
```

Drop the CSS in and add one element:

```html
<link rel="stylesheet" href="waterfall.css" />
<div class="pixel-image palette"></div>
```

That's it — the waterfall loops forever, in pure CSS. See
[`examples/waterfall`](examples/waterfall) (generated from a Monkey Island GIF).

#### Two animation modes

`animationMode` picks how the animation is expressed in CSS:

- **`palette`** (default) — animate the `--color-*` custom properties. Every pixel
  keeps a **fixed** palette slot; only the color *values* cycle, driven by one
  `@keyframes` per changing slot (`step-end`, so frames switch discretely).
  Slots that never change stay static, so a mostly-still scene animates only its
  moving parts. Compact CSS. Best for color-cycling art (water, fire, neon) —
  where pixels don't move. Continuously recomputes gradients on the CPU.

- **`frames`** — swap the **whole `background-image`** per frame inside a single
  `@keyframes` rule (`step-end`). Works for **any** animation, including moving
  pixels. Because each frame's background is a fixed value, the browser
  rasterizes it **once and caches** it, and `will-change: background-image`
  promotes the element to its own compositing layer — so playback runs on the
  browser's animation pipeline instead of re-rasterizing gradients every tick.
  The tradeoff is size: the CSS holds every frame's full gradient set, so it is
  much larger. Use `--resize` and `--max-frames` to keep it in check.

```sh
# frame-swap animation, sampled to 12 frames, scaled up
pixel-css waterfall.gif --animate --anim-mode frames \
  --resize 100 --max-frames 12 --max-colors 40 --sizing pixel --scale 5 \
  -o waterfall.css
```

In both modes the palette stays controllable: colors are `--color-*` variables,
so you can still recolor the whole animation by overriding them. See
[`examples/waterfall`](examples/waterfall) (palette mode) and
[`examples/waterfall-frames`](examples/waterfall-frames) (frames mode).

### Options

| Option | Default | Notes |
|---|---|---|
| `maxColors` | *(none)* | Quantize (Wu) to at most N colors. Omit for the exact palette. |
| `dither` | `false` | `floyd-steinberg` \| `atkinson`. Grows CSS a lot — off by default. |
| `alphaThreshold` | `128` | Alpha below this → transparent. |
| `alphaMode` | `"binary"` | `binary` (opaque or transparent) or `keep` (per-pixel `rgba`). |
| `resize` | *(none)* | Downscale to this width before converting (nearest-neighbor). |
| `singleElement` | `false` | Paint on the container itself; needs a single layer. |
| `duration` | *(from GIF)* | Animation loop length in seconds (animation only). |
| `animationMode` | `"palette"` | `palette` (cycle `--color-*`) or `frames` (swap `background-image`). |
| `maxFrames` | *(all)* | Sample the animation down to at most N frames (evenly). |
| `willChange` | `true` | Emit `will-change` layer-promotion hint (frames mode). |
| `scale` | `1` | Written into `--scale`; override per-element in CSS. |
| `sizing` | `"container"` | `container` (crisp, fluid; needs a sized host), `percent` (widest support), `pixel` (integer px, seam-free, not fluid). |
| `layerChunkSize` | `50` | Rows packed per background layer element. |
| `layerElement` | `"div"` | `div` (any layer count) or `pseudo` (≤ 2 layers). |
| `maxStopsPerLayer` | `4000` | Secondary split guard on color-stop count. |
| `cssVarPrefix` | `"color"` | `--color-0`, … |
| `selector` | `".pixel-image"` | Container class. |
| `paletteSelector` | `":host, .palette"` | Where the palette vars live. |
| `colorFormat` | `"hex"` | `hex` or `rgb`. |
| `emitMeta` / `emitHtml` / `emitAtProperty` / `minify` | see types | Extra outputs. |

## Markup

The generated CSS expects a container with one child per layer:

```html
<link rel="stylesheet" href="sprite.css" />

<div class="pixel-image palette" style="--scale: 8">
  <div class="pixel-image__layer"></div>
  <!-- add one more .pixel-image__layer for each layer in meta.layerCount -->
</div>
```

## Web Component

```html
<script type="module">
  import "pixel-css/widget";
</script>

<pixel-image css="sprite.css" meta="sprite.json" scale="8" controls></pixel-image>
```

`<pixel-image>` fetches the CSS + metadata, builds the layer DOM in a shadow root,
and (with `controls`) renders a panel: a color picker per palette entry, a global
hue-shift slider, plus **Reset**, **Copy CSS**, and **Download JSON**. Editing a
swatch sets the corresponding `--color-*` on the host, recoloring the image live.

You can also drive it programmatically:

```js
const el = document.querySelector("pixel-image");
el.cssText = css;   // inline instead of fetching
el.meta = meta;
el.exportCss();     // current palette as a CSS rule
el.exportPalette(); // current palette as string[]
```

## Try the demo

```sh
npm run demo   # builds, then serves the examples on http://localhost:5173
```

- Widget + live palette panel: <http://localhost:5173/examples/demo.html>
- Animated waterfall, palette mode: <http://localhost:5173/examples/waterfall/>
- Animated waterfall, frames mode: <http://localhost:5173/examples/waterfall-frames/>

Regenerate the waterfall example yourself:

```sh
pixel-css monkey_island_waterfal.gif --animate --resize 200 --max-colors 48 \
  --single-element --sizing pixel --scale 3 -o examples/waterfall/waterfall.css
```

## Notes & tradeoffs

- **Seams.** `container`/`percent` sizing can show faint sub-pixel seams between
  rows at some zoom levels. Use `sizing: "pixel"` for pixel-perfect output.
- **Animating colors.** Custom properties animate discretely unless registered.
  Pass `--at-property` / `emitAtProperty: true` so `--color-*` can be transitioned.
- **File size.** Detailed photos produce large CSS. Quantize with `maxColors` and
  keep the source small; this technique shines on sprites and low-color art.

## License

MIT © Łukasz Sobolewski
