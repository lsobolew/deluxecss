import { defineConfig } from "tsup";

export default defineConfig([
  // Core: Node target (CLI + library). `sharp` and `image-q` stay external.
  {
    entry: {
      index: "src/index.ts",
      cli: "src/cli.ts",
    },
    format: ["esm", "cjs"],
    platform: "node",
    target: "node18",
    dts: true,
    clean: true,
    sourcemap: true,
    external: ["sharp", "image-q"],
  },
  // Widget: browser target, zero runtime deps, ESM only. Never pulls in Node builtins.
  {
    entry: {
      "widget/index": "widget/index.ts",
      "widget/pixel-image": "widget/pixel-image.ts",
    },
    format: ["esm"],
    platform: "browser",
    target: "es2022",
    dts: true,
    sourcemap: true,
  },
]);
