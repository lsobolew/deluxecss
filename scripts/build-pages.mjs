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
import { existsSync } from "node:fs";
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

// Ship the built <pixel-image> widget so the slider Mario on the hub works.
// dist/widget/index.js pulls in a shared dist/chunk-*.js, so copy both. (dist/
// is built in CI before this runs.)
if (existsSync(join(root, "dist", "widget"))) {
  await cp(join(root, "dist", "widget"), join(out, "dist", "widget"), {
    recursive: true,
    filter: (s) => !s.endsWith(".map"),
  });
  for (const f of await readdir(join(root, "dist"))) {
    if (/^chunk-.*\.js$/.test(f)) await cp(join(root, "dist", f), join(out, "dist", f));
  }
} else {
  console.warn("build-pages: dist/widget not found — run `npm run build` first (slider Mario will be dead)");
}

// demo.html → index.html. Fix the widget import for a static host: `../dist`
// escapes the Pages site root, and a bare `dist/...` isn't a valid module
// specifier — it must be `./dist/...`.
let demo = await readFile(join(out, "demo.html"), "utf8");
demo = demo.replace("../dist/widget/index.js", "./dist/widget/index.js");
await writeFile(join(out, "demo.html"), demo);
await writeFile(join(out, "index.html"), demo);

await writeFile(join(out, ".nojekyll"), "");

console.log("build-pages: _site/ ready (index.html + examples, enhancer baked in)");
