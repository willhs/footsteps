export interface Feature {
  properties?: { population?: number };
}

export function featuresFromTile(tile: unknown): Feature[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tile as any;
    const tileCoords = t?.index
      ? `${t.index.z}/${t.index.x}/${t.index.y}`
      : 'unknown';
    void tileCoords;
    const possibleFeatures = [
      t?.data?.features,
      t?.content?.features,
      t?.data,
      t?.content,
      t?.data?.layers?.['humans']?.features,
      t?.content?.layers?.['humans']?.features,
      Array.isArray(t?.data) ? t.data : null,
      Array.isArray(t?.content) ? t.content : null,
    ].filter(Boolean);

    for (let i = 0; i < possibleFeatures.length; i++) {
      const candidate = possibleFeatures[i];
      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate as Feature[];
      }
    }
    return [];
  } catch (error) {
    console.error(`[FEATURE-EXTRACT-ERROR]:`, error);
    return [];
  }
}

export function aggregateTileMetrics(tiles: unknown[]) {
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
