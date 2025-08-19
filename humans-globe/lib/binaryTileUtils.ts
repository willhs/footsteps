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
    const source = t?.content?.data || t?.data || t?.content || t;
    const layer = source?.layers?.['humans'] || source;
    const length: number = layer?.length || 0;
    const positions: Float32Array | number[] | undefined = layer?.positions;
    const properties: Array<{ population?: number }> | undefined =
      layer?.properties;
    const features: Feature[] = [];
    for (let i = 0; i < length; i++) {
      const coords = positions
        ? [positions[i * 2], positions[i * 2 + 1]]
        : undefined;
      features.push({
        properties: properties ? properties[i] : undefined,
        coordinates: coords as [number, number] | undefined,
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
