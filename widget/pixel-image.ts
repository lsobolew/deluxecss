/**
 * <pixel-image> — renders CSS pixel-art produced by `pixel-css` and (optionally)
 * a control panel for editing its color palette live. Zero dependencies.
 *
 * Usage:
 *   <pixel-image css="mario.css" meta="mario.json" controls scale="20"></pixel-image>
 * or programmatically:
 *   el.cssText = css; el.meta = meta;
 */

interface WidgetMeta {
  width: number;
  height: number;
  colors: string[];
  layerCount: number;
  scale: number;
  cssVarPrefix: string;
  selector: string;
  layerClass: string;
  hasAlpha: boolean;
}

const WIDGET_CSS = `
:host { display: inline-block; font-family: system-ui, sans-serif; }
.px-root { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.px-controls {
  display: grid; gap: 8px; min-width: 200px;
  padding: 12px; border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 8px;
}
.px-swatches { display: grid; gap: 6px; }
.px-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.px-row input[type="color"] { width: 28px; height: 28px; padding: 0; border: none; background: none; cursor: pointer; }
.px-chip { width: 28px; height: 28px; border-radius: 4px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  background-image: linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%),
    linear-gradient(45deg,#ccc 25%,transparent 25%,transparent 75%,#ccc 75%);
  background-size: 10px 10px; background-position: 0 0, 5px 5px; }
.px-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.px-actions button, .px-slider label { font-size: 12px; }
.px-actions button { cursor: pointer; padding: 4px 10px; border-radius: 6px;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent); background: transparent; color: inherit; }
.px-slider { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
`;

export class PixelImage extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["css", "meta", "controls", "scale"];
  }

  private root: ShadowRoot;
  private _cssText: string | null = null;
  private _meta: WidgetMeta | null = null;
  private currentColors: string[] = [];
  private hueShift = 0;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    void this.load();
  }

  attributeChangedCallback(name: string): void {
    if (name === "scale") {
      this.applyScale();
    } else if (this.isConnected) {
      void this.load();
    }
  }

  /** Inline CSS produced by pixel-css. Setting this bypasses the `css` URL attribute. */
  set cssText(value: string) {
    this._cssText = value;
    if (this.isConnected) this.render();
  }
  get cssText(): string | null {
    return this._cssText;
  }

  /** Inline metadata. Setting this bypasses the `meta` URL attribute. */
  set meta(value: WidgetMeta) {
    this._meta = value;
    if (this.isConnected) this.render();
  }
  get meta(): WidgetMeta | null {
    return this._meta;
  }

  private async load(): Promise<void> {
    const cssUrl = this.getAttribute("css");
    const metaUrl = this.getAttribute("meta");
    try {
      if (cssUrl && this._cssText === null) {
        this._cssText = await (await fetch(cssUrl)).text();
      }
      if (metaUrl && this._meta === null) {
        this._meta = (await (await fetch(metaUrl)).json()) as WidgetMeta;
      }
    } catch (err) {
      console.error("[pixel-image] failed to load assets:", err);
    }
    this.render();
  }

  private render(): void {
    if (!this._cssText || !this._meta) return;
    const meta = this._meta;
    if (this.currentColors.length === 0) {
      this.currentColors = [...meta.colors];
    }

    // Stylesheet: generated CSS + widget chrome.
    const cssText = this._cssText + "\n" + WIDGET_CSS;
    if ("adoptedStyleSheets" in Document.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      this.root.adoptedStyleSheets = [sheet];
      this.root.querySelector("style")?.remove();
    }

    const baseClass = meta.selector.replace(/^\./, "");
    const layers = Array.from(
      { length: meta.layerCount },
      () => `<div class="${meta.layerClass}"></div>`,
    ).join("");

    const styleFallback =
      "adoptedStyleSheets" in Document.prototype
        ? ""
        : `<style>${cssText}</style>`;

    const controls = this.hasAttribute("controls")
      ? this.renderControls(meta)
      : "";

    this.root.innerHTML = `${styleFallback}<div class="px-root">
      <div class="${baseClass} palette px-stage">${layers}</div>
      ${controls}
    </div>`;

    this.applyScale();
    this.applyAllColors();
    if (this.hasAttribute("controls")) this.wireControls(meta);
  }

  private renderControls(meta: WidgetMeta): string {
    const rows = meta.colors
      .map((color, i) => {
        const editable = isEditable(color);
        const control = editable
          ? `<input type="color" data-idx="${i}" value="${toHex(color)}" />`
          : `<span class="px-chip" title="${color}"></span>`;
        return `<div class="px-row">${control}<code>--${meta.cssVarPrefix}-${i}</code><span>${color}</span></div>`;
      })
      .join("");

    return `<div class="px-controls">
      <div class="px-swatches">${rows}</div>
      <div class="px-slider">
        <label>Hue shift <span data-hue-label>0°</span></label>
        <input type="range" data-hue min="-180" max="180" value="0" />
      </div>
      <div class="px-actions">
        <button data-reset>Reset</button>
        <button data-copy>Copy CSS</button>
        <button data-download>Download JSON</button>
      </div>
    </div>`;
  }

  private wireControls(meta: WidgetMeta): void {
    this.root.querySelectorAll<HTMLInputElement>('input[type="color"]').forEach(
      (input) => {
        input.addEventListener("input", () => {
          const idx = Number(input.dataset.idx);
          this.currentColors[idx] = input.value;
          this.setColorVar(idx, input.value);
        });
      },
    );

    const hue = this.root.querySelector<HTMLInputElement>("input[data-hue]");
    const hueLabel = this.root.querySelector<HTMLElement>("[data-hue-label]");
    hue?.addEventListener("input", () => {
      this.hueShift = Number(hue.value);
      if (hueLabel) hueLabel.textContent = `${this.hueShift}°`;
      // Recompute from the ORIGINAL palette so the shift is reversible.
      meta.colors.forEach((color, i) => {
        if (!isEditable(color)) return;
        const shifted = shiftHue(color, this.hueShift);
        this.currentColors[i] = shifted;
        this.setColorVar(i, shifted);
        const picker = this.root.querySelector<HTMLInputElement>(
          `input[type="color"][data-idx="${i}"]`,
        );
        if (picker) picker.value = toHex(shifted);
      });
    });

    this.root
      .querySelector("[data-reset]")
      ?.addEventListener("click", () => this.reset(meta));
    this.root
      .querySelector("[data-copy]")
      ?.addEventListener("click", () => void this.copyCss(meta));
    this.root
      .querySelector("[data-download]")
      ?.addEventListener("click", () => this.downloadJson(meta));
  }

  private reset(meta: WidgetMeta): void {
    this.currentColors = [...meta.colors];
    this.hueShift = 0;
    this.render();
  }

  private setColorVar(idx: number, value: string): void {
    this.style.setProperty(`--${this._meta!.cssVarPrefix}-${idx}`, value);
  }

  private applyAllColors(): void {
    if (!this._meta) return;
    this.currentColors.forEach((c, i) => this.setColorVar(i, c));
  }

  private applyScale(): void {
    const scale = this.getAttribute("scale");
    if (scale !== null) this.style.setProperty("--scale", scale);
  }

  /** The current palette as a CSS rule. */
  exportCss(selector = ":root"): string {
    const prefix = this._meta?.cssVarPrefix ?? "color";
    const body = this.currentColors
      .map((c, i) => `  --${prefix}-${i}: ${c};`)
      .join("\n");
    return `${selector} {\n${body}\n}`;
  }

  /** The current palette as a plain array. */
  exportPalette(): string[] {
    return [...this.currentColors];
  }

  private async copyCss(meta: WidgetMeta): Promise<void> {
    const css = this.exportCss(`.${meta.selector.replace(/^\./, "")}, .palette`);
    try {
      await navigator.clipboard.writeText(css);
    } catch {
      console.log(css);
    }
  }

  private downloadJson(_meta: WidgetMeta): void {
    const blob = new Blob([JSON.stringify(this.currentColors, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "palette.json";
    a.click();
    URL.revokeObjectURL(url);
  }
}

// ---- color helpers ----

function isEditable(color: string): boolean {
  return color.startsWith("#") || /^rgb\(/.test(color);
}

function toHex(color: string): string {
  if (color.startsWith("#")) {
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    return color.slice(0, 7);
  }
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return "#000000";
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

function hx(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
}

function shiftHue(color: string, degrees: number): string {
  const hex = toHex(color);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  const nh = (((h + degrees) % 360) + 360) % 360;
  const [nr, ng, nb] = hslToRgb(nh, s, l);
  return `#${hx(nr)}${hx(ng)}${hx(nb)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}
