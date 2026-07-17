import { PixelImage } from "./pixel-image.js";

export { PixelImage } from "./pixel-image.js";

/** Register the `<pixel-image>` custom element (idempotent). */
export function definePixelImage(tag = "pixel-image"): void {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
    customElements.define(tag, PixelImage);
  }
}

// Auto-register on import in a browser context.
definePixelImage();
