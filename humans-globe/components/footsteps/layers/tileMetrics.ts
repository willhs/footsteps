export interface Feature {
  properties?: { population?: number };
}

export interface TileMetrics {
  count: number;
  population: number;
}

function asFeatureArray(candidate: unknown): Feature[] | null {
  return Array.isArray(candidate) && candidate.length > 0
    ? (candidate as Feature[])
    : null;
}

export function featuresFromTile(tile: unknown): Feature[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tile as any;
    const tileCoords = t?.index
      ? `${t.index.z}/${t.index.x}/${t.index.y}`
      : 'unknown';
    void tileCoords;

    let features: Feature[] | null;

    features = asFeatureArray(t?.data?.features);
    if (features) return features;

    features = asFeatureArray(t?.content?.features);
    if (features) return features;

    features = asFeatureArray(t?.data);
    if (features) return features;

    features = asFeatureArray(t?.content);
    if (features) return features;

    features = asFeatureArray(t?.data?.layers?.['humans']?.features);
    if (features) return features;

    features = asFeatureArray(t?.content?.layers?.['humans']?.features);
    if (features) return features;

    return [];
  } catch (error) {
    console.error(`[FEATURE-EXTRACT-ERROR]:`, error);
    return [];
  }
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
