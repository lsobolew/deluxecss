// Build the static demo site for GitHub Pages from examples/.
//
//   • copies examples/ into _site/, skipping what can't (or shouldn't) ship:
//     matrix-frames/ (gitignored, ~193 MB, needs BYO frames) and the empty
//     assets/matrix/ drop folder
//   • bakes the demo enhancer (FPS meter + README panel) inline into every
//     page — the same thing scripts/serve.mjs injects at request time, but
//     inlined so it works at any depth and any Pages base path
//   • promotes demo.html to the site's index.html
//   • repoints the matrix-frames card at the GitHub source (it isn't shippable)
//   • drops a .nojekyll so GitHub doesn't strip our _underscore paths
//
// Run from the repo root: node scripts/build-pages.mjs
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, extname, relative, sep } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const examples = join(root, "examples");
const out = join(root, "_site");
const REPO = "https://github.com/lsobolew/deluxecss";

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// Copy examples/, skipping junk and the local-only / unshippable folders.
await cp(examples, out, {
  recursive: true,
  filter: (src) => {
    if (src.split(sep).pop() === ".DS_Store") return false;
    const rel = relative(examples, src).split(sep).join("/");
    if (rel === "matrix-frames" || rel.startsWith("matrix-frames/")) return false;
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

// demo.html → index.html, with the unshippable matrix card pointed at GitHub.
let demo = await readFile(join(out, "demo.html"), "utf8");
demo = demo.replace(
  'href="matrix-frames/index.html"',
  `href="${REPO}/tree/main/examples/matrix-frames"`,
);
await writeFile(join(out, "demo.html"), demo);
await writeFile(join(out, "index.html"), demo);

await writeFile(join(out, ".nojekyll"), "");

console.log("build-pages: _site/ ready (index.html + examples, enhancer baked in)");
