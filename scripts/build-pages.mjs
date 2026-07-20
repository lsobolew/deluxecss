// Build the static demo site for GitHub Pages from examples/.
//
//   • copies examples/ into _site/, skipping the heavy source-frame folder
//     assets/matrix/ (the generated matrix-frames/ CSS is what gets served)
//   • bakes the demo enhancer (FPS meter + README panel) inline into every
//     page — the same thing scripts/serve.mjs injects at request time, but
//     inlined so it works at any depth and any Pages base path
//   • promotes demo.html to the site's index.html
//   • drops a .nojekyll so GitHub doesn't strip our _underscore paths
//
// matrix-frames/ is generated in CI (node examples/matrix-frames/gen.mjs) before
// this runs; its part-*.css + index.html are copied like any other example.
//
// Run from the repo root: node scripts/build-pages.mjs
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, extname, relative, sep } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const examples = join(root, "examples");
const out = join(root, "_site");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Copy examples/, skipping junk and the local-only / unshippable folders.
await cp(examples, out, {
  recursive: true,
  filter: (src) => {
    if (src.split(sep).pop() === ".DS_Store") return false;
    const rel = relative(examples, src).split(sep).join("/");
    if (rel === "assets/matrix" || rel.startsWith("assets/matrix/")) return false;
    return true;
  },
});

// Enhancer, inlined (no path resolution needed at any depth / base path).
const enhance = await readFile(join(examples, "_enhance.js"), "utf8");
const marked = await readFile(join(examples, "vendor", "marked.umd.js"), "utf8");
const inject = `\n<script>${marked}</script>\n<script>${enhance}</script>\n`;

async function bake(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await bake(p);
    else if (extname(p) === ".html") {
      let html = await readFile(p, "utf8");
      html = html.includes("</body>")
        ? html.replace("</body>", inject + "</body>")
        : html + inject;
      await writeFile(p, html);
    }
  }
}
await bake(out);

// demo.html → index.html (relative links resolve — same directory).
await writeFile(join(out, "index.html"), await readFile(join(out, "demo.html"), "utf8"));

await writeFile(join(out, ".nojekyll"), "");

console.log("build-pages: _site/ ready (index.html + examples, enhancer baked in)");
