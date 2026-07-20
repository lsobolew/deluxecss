import type { Meta } from "./types.js";

/**
 * A complete, ready-to-open example HTML page that links the generated CSS and
 * lays out the exact DOM it expects: the container with its `palette` class, the
 * stacked layer `<div>`s (unless single-element), and an overlay element for the
 * overlay animation modes. Open it next to the `.css` file and it just works.
 */
export function buildExampleHtml(meta: Meta, cssHref: string): string {
  const baseClass = meta.selector.replace(/^\./, "");
  const parts: string[] = [];
  if (!meta.singleElement) {
    for (let i = 0; i < meta.layerCount; i++) {
      parts.push(`<div class="${meta.layerClass}"></div>`);
    }
  }
  const mode = meta.animation?.mode;
  if (mode === "overlay" || mode === "overlay-palette") {
    parts.push(`<div class="${baseClass}__overlay"></div>`);
  }
  const inner = parts.length ? `\n      ${parts.join("\n      ")}\n    ` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>deluxecss — ${escapeHtml(cssHref)}</title>
    <link rel="stylesheet" href="${escapeAttr(cssHref)}" />
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111; }
      /* The stylesheet sets the native size; cap it so it never overflows. */
      .${baseClass} { max-width: 100%; }
    </style>
  </head>
  <body>
    <div class="${baseClass} palette">${inner}</div>
  </body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
