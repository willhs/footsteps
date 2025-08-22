import {
  extractFeaturesFromBinaryTile,
  type Feature,
} from '@/lib/binaryTileUtils';

export { type Feature };

export interface TileMetrics {
  count: number;
  population: number;
}

export function featuresFromTile(tile: unknown): Feature[] {
  return extractFeaturesFromBinaryTile(tile);
}

export function aggregateTileMetrics(tiles: unknown[]): TileMetrics {
  let count = 0;
  let population = 0;
  for (const t of tiles) {
    const feats = featuresFromTile(t);
    count += feats.length;
    for (const g of feats) {
      population += Number(g?.properties?.population) || 0;
    }
  }
  return { count, population };
}
