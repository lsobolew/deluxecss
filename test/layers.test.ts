import { describe, expect, it } from "vitest";
import { packLayers } from "../src/layers.js";
import type { RowGradients } from "../src/rle.js";

function rows(count: number, stopsEach: number): RowGradients {
  return {
    gradients: Array.from({ length: count }, (_, y) => `grad-${y}`),
    stopCounts: Array.from({ length: count }, () => stopsEach),
  };
}

describe("packLayers", () => {
  it("splits N rows into ceil(N/chunk) layers with absolute positions", () => {
    const layers = packLayers(rows(120, 1), 50, 10000);
    expect(layers.length).toBe(3);
    expect(layers[0]!.rows).toHaveLength(50);
    expect(layers[2]!.rows).toEqual(
      Array.from({ length: 20 }, (_, i) => 100 + i),
    );
    // Positions reference the absolute row index, not a per-chunk index.
    expect(layers[2]!.backgroundPosition).toContain(
      "calc(var(--pixel-height) * 100)",
    );
  });

  it("splits further when the stop budget is exceeded", () => {
    // 10 rows x 300 stops, budget 1000 → max 3 rows per layer → 4 layers.
    const layers = packLayers(rows(10, 300), 50, 1000);
    expect(layers.length).toBe(4);
    expect(layers[0]!.rows).toHaveLength(3);
  });

  it("always keeps at least one row per layer even if it exceeds the budget", () => {
    const layers = packLayers(rows(3, 99999), 50, 1000);
    expect(layers.length).toBe(3);
    expect(layers.every((l) => l.rows.length === 1)).toBe(true);
  });
});
