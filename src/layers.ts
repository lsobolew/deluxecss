import type { RowGradients } from "./rle.js";

export interface Layer {
  /** `background-image` value: the row gradients in this layer, comma-joined. */
  backgroundImage: string;
  /** `background-position` value: absolute row positions matching the gradients. */
  backgroundPosition: string;
  /** Absolute row indices covered by this layer (for debugging/tests). */
  rows: number[];
}

/**
 * Pack rows into stacked background layers. A new layer is started when the
 * current one reaches `chunkSize` rows, or when adding the next row would push
 * its total color-stop count past `maxStopsPerLayer` (each layer always holds at
 * least one row). Positions use the absolute row index so every layer shares the
 * same coordinate space (`background-size: 100% var(--pixel-height)`), letting
 * the grid-stacked layers show through each other's gaps.
 */
export function packLayers(
  rowGradients: RowGradients,
  chunkSize: number,
  maxStopsPerLayer: number,
): Layer[] {
  const { gradients, stopCounts } = rowGradients;
  const layers: Layer[] = [];

  let current: number[] = [];
  let currentStops = 0;

  const flush = () => {
    if (current.length === 0) return;
    layers.push({
      backgroundImage: current.map((y) => gradients[y]!).join(", "),
      backgroundPosition: current
        .map((y) => `0 calc(var(--pixel-height) * ${y})`)
        .join(", "),
      rows: current,
    });
    current = [];
    currentStops = 0;
  };

  for (let y = 0; y < gradients.length; y++) {
    const stops = stopCounts[y]!;
    const wouldOverflowRows = current.length >= chunkSize;
    const wouldOverflowStops =
      current.length > 0 && currentStops + stops > maxStopsPerLayer;

    if (wouldOverflowRows || wouldOverflowStops) flush();

    current.push(y);
    currentStops += stops;
  }
  flush();

  return layers;
}
