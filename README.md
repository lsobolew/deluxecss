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

Ships as three things:

- a **CLI** (`pixel-css image.png -o image.css`),
- a **library** (`imageToCss(input, options)`),
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
      --max-colors <n>        Quantize to at most n colors (default: keep all)
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

### Options

| Option | Default | Notes |
|---|---|---|
| `maxColors` | *(none)* | Quantize (Wu) to at most N colors. Omit for the exact palette. |
| `dither` | `false` | `floyd-steinberg` \| `atkinson`. Grows CSS a lot — off by default. |
| `alphaThreshold` | `128` | Alpha below this → transparent. |
| `alphaMode` | `"binary"` | `binary` (opaque or transparent) or `keep` (per-pixel `rgba`). |
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
npm run demo   # builds, then serves examples/demo.html on http://localhost:5173
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
