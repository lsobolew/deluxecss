// Shared helpers for the example generators: measure a stylesheet's raw and
// gzipped size and render a small "CSS: raw → gzip" badge baked into the page.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

export function sizeOf(path) {
  const raw = readFileSync(path);
  return { raw: raw.length, gzip: gzipSync(raw, { level: 9 }).length };
}

export function fmt(bytes) {
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 2) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + " KB";
  return bytes + " B";
}

/** "5.36 MB → 158 KB gzip (35×)" for one or many files (summed). */
export function sizeText(paths) {
  const list = Array.isArray(paths) ? paths : [paths];
  let raw = 0, gzip = 0;
  for (const p of list) { const s = sizeOf(p); raw += s.raw; gzip += s.gzip; }
  return `${fmt(raw)} → ${fmt(gzip)} gzip (${Math.round(raw / gzip)}×)`;
}

/** Inline-styled badge markup for a page corner (no external CSS needed). */
export function sizeBadge(paths, label = "CSS") {
  return `<div style="position:fixed;left:12px;top:8px;z-index:2147483647;` +
    `font:600 13px/1.3 monospace;color:#9fd;background:#0f2a24;` +
    `border:1px solid #1c5;border-radius:6px;padding:4px 9px;">` +
    `${label}: ${sizeText(paths)}</div>`;
}

export const CLI = new URL("../dist/cli.js", import.meta.url).pathname;
