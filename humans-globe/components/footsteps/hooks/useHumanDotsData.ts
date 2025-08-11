/**
 * @deprecated Legacy NDJSON data hook has been removed.
 * Use vector tiles via deck.gl MVTLayer and the Tile API at
 * `/api/tiles/{year}/{lod}/{z}/{x}/{y}.pbf` instead.
 */
export default function useHumanDotsData(): never {
  throw new Error('useHumanDotsData is deprecated and has been removed. Use MVT tiles via createHumanTilesLayer().');
}
