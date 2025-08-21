import type { PickingInfo as DeckPickingInfo } from '@deck.gl/core';

export interface Feature {
  properties?: { population?: number };
  coordinates?: [number, number];
}

export type PickingInfo = DeckPickingInfo<Feature> & {
  object?: { properties?: { population?: number } };
  coordinate?: [number, number];
  x?: number;
  y?: number;
};

export function extractFeaturesFromBinaryTile(tile: unknown): Feature[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tile as any;
    // Deck.gl MVTLayer (binary: true) passes tiles where point features live under:
    // tile.content.data.layers[layerId].points
    // with schema similar to GeoJsonLayer binary: {positions{value}, properties[], numericProps{}}
    const source = t?.content?.data || t?.data || t?.content?.data || t?.content || t;

    // Resolve the container holding our target layer. Prefer explicit 'humans' layer (single-layer tiles).
    const container = source?.layers ?? source;
    let layerData = container?.['humans'] ?? container;
    if (!layerData && container && typeof container === 'object') {
      const keys = Object.keys(container as Record<string, unknown>);
      // Fallback: pick a layer that includes 'humans'
      const key = keys.find((k) => k.includes('humans')) || keys[0];
      layerData = (container as Record<string, unknown>)[key];
    }

    // For points geometry, deck.gl nests under `.points`
    const points = (layerData as any)?.points ?? layerData;

    const positionsRaw = (points as any)?.positions?.value ?? (points as any)?.positions;
    const propertiesArr: Array<{ population?: number }> | undefined = (points as any)?.properties;
    const numericPop = (points as any)?.numericProps?.population?.value ?? (points as any)?.numericProps?.population;

    // Derive feature count from any available source
    let count = 0;
    if (positionsRaw && typeof positionsRaw.length === 'number') {
      count = Math.max(count, Math.floor(positionsRaw.length / 2));
    }
    if (Array.isArray(propertiesArr)) {
      count = Math.max(count, propertiesArr.length);
    }
    if (numericPop && typeof numericPop.length === 'number') {
      count = Math.max(count, Number(numericPop.length));
    }

    const features: Feature[] = [];
    const getPopulation = (i: number): number => {
      if (numericPop && typeof numericPop.length === 'number') {
        return Number(numericPop[i]) || 0;
      }
      const p = propertiesArr?.[i]?.population;
      return Number(p) || 0;
    };

    for (let i = 0; i < count; i++) {
      let coords: [number, number] | undefined;
      if (positionsRaw && typeof positionsRaw.length === 'number') {
        const x = positionsRaw[i * 2];
        const y = positionsRaw[i * 2 + 1];
        if (typeof x === 'number' && typeof y === 'number') {
          coords = [x, y];
        }
      }
      features.push({
        properties: { population: getPopulation(i) },
        coordinates: coords,
      });
    }
    return features;
  } catch (error) {
    console.error('[BINARY-FEATURES-ERROR]:', error);
    return [];
  }
}

export function buildTooltipDataFromBinary(info: PickingInfo, year: number) {
  if (info?.object) {
    const population = info.object.properties?.population || 0;
    const coordinates = (info.coordinate as [number, number]) || [0, 0];
    const clickPosition = { x: info.x || 0, y: info.y || 0 };
    return { population, coordinates, year, clickPosition };
  }
  return null;
}
