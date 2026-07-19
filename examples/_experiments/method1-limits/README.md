# Experiment — how far does Method 1 scale? (+ on-page FPS meter)

Method 1 = the whole frame as **one** `linear-gradient`, unrolled onto a wrapping
inline text run with `box-decoration-break: slice` (see `../one-gradient/`).

```
# regenerate any config (constants overridable via env):
W=256 FPS=24 SECONDS=3 COLORS=24 node gen.mjs
```

Each generated document has an **FPS meter** (top-right) driven by
`requestAnimationFrame`, showing current and minimum fps. **Measure in a real
browser** — headless/virtual-time numbers are not representative.

## Files

| file | what |
|---|---|
| `method1-96-24fps.html`  | 96×54,  72 frames @ 24fps (3s) |
| `method1-160-24fps.html` | 160×90, 72 frames @ 24fps (3s) |
| `method1-256-24fps.html` | 256×145, 72 frames @ 24fps (3s) |
| `method1-640-BLANK-over-ceiling.html` | 640×362, single frame — **renders blank** |

Open the first three and watch the FPS meter to find where playback stops holding
24fps on your machine. The 640 file shows the hard ceiling below.

## Findings

**Does 24fps @ 640px work? No — it doesn't even render.** A single
`linear-gradient` has a rendering ceiling in Chrome. Measured with static frames:

| width | image | ~stops in the one gradient | renders? |
|---|---|---|---|
| 256 | 256×145 | ~37k | ✅ |
| 384 | 384×217 | ~83k | ✅ |
| 512 | 512×290 | ~148k | ✅ |
| 576 | 576×326 | ~188k | ✅ (but see below) |
| 640 | 640×362 | ~232k | ❌ blank |

So the single-gradient ceiling sits between **576 and 640px** (~200k color stops)
for this content. At 640px the gradient is too large and paints nothing.

**Even below the ceiling, one giant gradient is brutally expensive to paint.** The
FPS meter on the *static* probes already told the story: a still 512px frame let
the rAF loop run at ~12fps, a still 576px frame dropped it to ~2fps — before any
animation. Repainting a gradient that size **every** frame at 24fps is not
viable; Method 1 only stays smooth at small sizes (the ladder above shows where).

**Also note the DOM cost:** Method 1 needs `W*H` filler characters to force the
wrapping (231,680 of them at 640px). That layout happens once, but it's large.

## Takeaway

Method 1 is elegant for **small** pixel art / low-res animation, where one gradient
is cheap and the single compositing layer is a win. It does **not** scale to
full-resolution video: the single-gradient render ceiling (~576px here) and the
per-frame paint cost of a huge gradient rule it out. For large frames the per-row,
multi-layer approach (the library's `frames` mode) is the one that renders — see
`../one-gradient/matrix-method2.html`.

## Sketch (simplified)

```css
/* one gradient per frame, swapped via @keyframes; wraps via box-decoration-break */
.strip {
  box-decoration-break: slice; color: transparent;
  background-size: calc(var(--u) * /* W*H */) 3px;
  animation: play 3s step-end infinite; will-change: background-image;
}
@keyframes play {
  0%   { background-image: /* frame0: whole image in ONE gradient */; }
  1.4% { background-image: /* frame1 */; }
  /* …one stop per frame… */
}
```

Past ~576px wide that single gradient has too many stops and Chrome paints
nothing — that's the ceiling this experiment maps.
