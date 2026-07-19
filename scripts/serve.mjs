// Minimal zero-dependency static server for the examples/demo.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.env.PORT) || 5173;

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".map": "application/json",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    if (path === "/") path = "/examples/demo.html";
    if (path.endsWith("/")) path += "index.html"; // directory → its index.html
    const filePath = normalize(join(root, path));
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const ext = extname(filePath);
    if (ext === ".html") {
      // Inject the demo-time enhancer (FPS meter + README panel) into every
      // page, without touching the generated files on disk.
      const inject =
        `<script src="/examples/vendor/marked.umd.js"></script>` +
        `<script src="/examples/_enhance.js"></script>`;
      let html = await readFile(filePath, "utf8");
      html = html.includes("</body>")
        ? html.replace("</body>", inject + "</body>")
        : html + inject;
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": TYPES[ext] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(port, () => {
  console.log(`pixel-css demo → http://localhost:${port}/examples/demo.html`);
});
