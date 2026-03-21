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

function normalizePopulation(raw: unknown): number {
  if (raw == null) return 0;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // Handle typed arrays passed from deck.gl binary picking info
  if (ArrayBuffer.isView(raw)) {
    const view = raw as unknown as ArrayLike<number>;
    const first = view.length > 0 ? Number(view[0]) : 0;
    return Number.isFinite(first) ? first : 0;
  }

  if (typeof raw === 'object') {
    const candidate = (raw as { value?: unknown }).value;
    if (candidate != null) {
      const normalized = normalizePopulation(candidate);
      if (normalized !== 0) return normalized;
    }
  }

  const coerced = Number(raw);
  return Number.isFinite(coerced) ? coerced : 0;
}

function resolvePopulation(info: PickingInfo): number {
  // Prefer direct GeoJSON feature properties (ScatterplotLayer path)
  const candidates: unknown[] = [];
  const object = info?.object as
    | {
        properties?: { population?: unknown };
        population?: unknown;
        feature?: { properties?: { population?: unknown } };
      }
    | undefined;

  if (object?.properties) {
    candidates.push(object.properties.population);
  }

  if (object?.feature?.properties) {
    candidates.push(object.feature.properties.population);
  }

  if (object && 'population' in object) {
    candidates.push((object as { population?: unknown }).population);
  }

  if ((info as unknown as { properties?: { population?: unknown } })?.properties) {
    candidates.push(
      (info as unknown as { properties?: { population?: unknown } }).properties
        ?.population,
    );
  }

  for (const candidate of candidates) {
    const normalized = normalizePopulation(candidate);
    if (normalized !== 0) {
      return normalized;
    }
  }

  // Fall back to the first candidate even if it normalizes to 0 to preserve actual zero values
  if (candidates.length > 0) {
    return normalizePopulation(candidates[0]);
  }

  return 0;
}

function resolveCoordinates(info: PickingInfo): [number, number] {
  const coordinateCandidates: unknown[] = [];

  if (Array.isArray(info?.coordinate)) {
    coordinateCandidates.push(info.coordinate);
  }

  const object = info?.object as {
    geometry?: { coordinates?: unknown };
    position?: unknown;
    feature?: { geometry?: { coordinates?: unknown } };
  };

  if (object?.geometry?.coordinates) coordinateCandidates.push(object.geometry.coordinates);
  if (object?.position) coordinateCandidates.push(object.position);
  if (object?.feature?.geometry?.coordinates)
    coordinateCandidates.push(object.feature.geometry.coordinates);

  for (const candidate of coordinateCandidates) {
    if (
      Array.isArray(candidate) &&
      candidate.length >= 2 &&
      typeof candidate[0] === 'number' &&
      typeof candidate[1] === 'number' &&
      Number.isFinite(candidate[0]) &&
      Number.isFinite(candidate[1])
    ) {
      return [candidate[0], candidate[1]] as [number, number];
    }
  }

  return [0, 0];
}

export function buildTooltipDataFromBinary(info: PickingInfo, year: number) {
  if (!info?.object) return null;

  const population = resolvePopulation(info);
  const coordinates = resolveCoordinates(info);
  const clickPosition = { x: info?.x ?? 0, y: info?.y ?? 0 };

  return { population, coordinates, year, clickPosition };
}
