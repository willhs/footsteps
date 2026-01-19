import { TileLayer } from '@deck.gl/geo-layers';
import { ScatterplotLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import { PMTiles, FetchSource, SharedPromiseCache } from 'pmtiles';
import { QueryParamRangeSource } from './QueryParamRangeSource';
import { parse } from '@loaders.gl/core';
import { MVTLoader } from '@loaders.gl/mvt';

// Simple PMTiles instance cache - avoid recreating FetchSource
const pmtilesCache = new Map<string, PMTiles>();
// Share header/dir requests across instances and HMR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = (globalThis as unknown) as any;
const sharedPMCache: SharedPromiseCache = g.__pmtilesCache || new SharedPromiseCache(2000);
g.__pmtilesCache = sharedPMCache;

// Struct representing a prepared dot ready for ScatterplotLayer consumption
type PreparedPoint = {
  feature: any;
  position: [number, number];
  population: number;
};

// Cross-layer in-memory feature cache (LRU) to avoid re-fetching/parsing
type FeatureCacheEntry = {
  key: string;
  features: PreparedPoint[];
  bytes: number;
  featureCount: number;
  totalPopulation: number;
};
type FeatureCacheStore = { map: Map<string, FeatureCacheEntry>; bytes: number };
const DEFAULT_MAX_TILES = Number(process.env.NEXT_PUBLIC_PM_LRU_TILES || 1500);
const DEFAULT_MAX_BYTES = Number(process.env.NEXT_PUBLIC_PM_LRU_BYTES || 128 * 1024 * 1024); // 128 MiB
// Persist across HMR
const sharedFeatureCache: FeatureCacheStore = g.__pmtilesFeatureCache || { map: new Map(), bytes: 0 };
g.__pmtilesFeatureCache = sharedFeatureCache;

// Lightweight stats for subtle UI
type FeatureCacheStats = { hits: number; misses: number; tiles: number; bytes: number };
const sharedStats: FeatureCacheStats = g.__pmtilesFeatureStats || { hits: 0, misses: 0, tiles: 0, bytes: 0 };
g.__pmtilesFeatureStats = sharedStats;

function dispatchStats() {
  try {
    sharedStats.tiles = sharedFeatureCache.map.size;
    sharedStats.bytes = sharedFeatureCache.bytes;
    const ev = new CustomEvent('pmtiles-cache-stats', { detail: { ...sharedStats } });
    globalThis.dispatchEvent?.(ev);
  } catch {}
}

function extractPointPosition(feature: any): [number, number] | null {
  if (!feature || typeof feature !== 'object') return null;
  const geom = feature.geometry;
  if (!geom) return null;

  const toLonLat = (coords: unknown): [number, number] | null => {
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return [lon, lat];
  };

  if (geom.type === 'Point') {
    return toLonLat(geom.coordinates);
  }

  if (geom.type === 'MultiPoint' && Array.isArray(geom.coordinates)) {
    for (const candidate of geom.coordinates) {
      const position = toLonLat(candidate);
      if (position) return position;
    }
  }

  return null;
}

function getPopulationValue(feature: any): number {
  if (!feature || typeof feature !== 'object') return 0;
  const raw = feature?.properties?.population;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function prepareTileData(features: any[], tile: any) {
  const prepared: PreparedPoint[] = [];
  let totalPopulation = 0;

  for (const feature of features) {
    const position = extractPointPosition(feature);
    if (!position) continue;
    const population = getPopulationValue(feature);
    totalPopulation += population;
    prepared.push({ feature, position, population });
  }

  const featureCount = prepared.length;
  if (tile) {
    tile.userData = tile.userData || {};
    tile.userData.featureCount = featureCount;
    tile.userData.totalPopulation = totalPopulation;
  }

  return { prepared, featureCount, totalPopulation };
}

function fcGet(key: string): FeatureCacheEntry | null {
  const entry = sharedFeatureCache.map.get(key);
  if (!entry) return null;
  // LRU: refresh recency
  sharedFeatureCache.map.delete(key);
  sharedFeatureCache.map.set(key, entry);
  return entry;
}

function fcSet(
  key: string,
  features: PreparedPoint[],
  approxBytes: number,
  totals: { featureCount: number; totalPopulation: number },
  maxTiles = DEFAULT_MAX_TILES,
  maxBytes = DEFAULT_MAX_BYTES,
): void {
  if (!features || features.length === 0) return;
  const existing = sharedFeatureCache.map.get(key);
  if (existing) {
    // Update bytes and entry
    sharedFeatureCache.bytes -= existing.bytes;
    sharedFeatureCache.map.delete(key);
  }
  // Conservative byte estimate: prefer encoded tile bytes; fallback to per-feature guess
  const bytes = Math.max(approxBytes || 0, features.length * 200);
  const entry: FeatureCacheEntry = {
    key,
    features,
    bytes,
    featureCount: totals.featureCount,
    totalPopulation: totals.totalPopulation,
  };
  sharedFeatureCache.map.set(key, entry);
  sharedFeatureCache.bytes += bytes;

  // Evict least-recently used while over limits
  while (sharedFeatureCache.map.size > maxTiles || sharedFeatureCache.bytes > maxBytes) {
    const oldestKey = sharedFeatureCache.map.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const old = sharedFeatureCache.map.get(oldestKey);
    if (old) sharedFeatureCache.bytes -= old.bytes;
    sharedFeatureCache.map.delete(oldestKey);
  }
  dispatchStats();
}

function isFinitePair(value: any): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function ringIsValid(ring: any): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  return ring.every(isFinitePair);
}

function polygonIsValid(coordinates: any): boolean {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return false;
  return coordinates.every(ringIsValid);
}

function geometryHasCoordinates(geom: any): boolean {
  if (!geom || typeof geom !== 'object') return false;
  const type = geom.type;
  const coords = geom.coordinates;
  if (!type) return false;

  switch (type) {
    case 'Point':
      return isFinitePair(coords);
    case 'MultiPoint':
      return Array.isArray(coords) && coords.length > 0 && coords.every(isFinitePair);
    case 'LineString':
      return Array.isArray(coords) && coords.length >= 2 && coords.every(isFinitePair);
    case 'MultiLineString':
      return Array.isArray(coords) && coords.length > 0 && coords.every((line) =>
        Array.isArray(line) && line.length >= 2 && line.every(isFinitePair),
      );
    case 'Polygon':
      return polygonIsValid(coords);
    case 'MultiPolygon':
      return Array.isArray(coords) && coords.length > 0 && coords.every(polygonIsValid);
    case 'GeometryCollection':
      return (
        Array.isArray(geom.geometries) &&
        geom.geometries.length > 0 &&
        geom.geometries.every(geometryHasCoordinates)
      );
    default:
      return false;
  }
}

interface PMTilesTileLayerProps {
  id: string;
  pmtilesUrl: string;
  mvtLayers?: string[];
  getPointRadius?: (feature: any) => number;
  getFillColor?: (feature: any) => [number, number, number, number];
  getLineColor?: (feature: any) => [number, number, number, number];
  pointRadiusUnits?: 'meters' | 'pixels';
  opacity?: number;
  filled?: boolean;
  stroked?: boolean;
  pickable?: boolean;
  onClick?: (info: any) => void;
  onHover?: (info: any) => void;
  updateTriggers?: any;
  transitions?: any;
  parameters?: any;
  // Common TileLayer props we forward
  minZoom?: number;
  maxZoom?: number;
  extent?: [number, number, number, number];
  refinementStrategy?: 'best-available' | 'no-overlap' | 'never' | ((...args: any[]) => any);
  maxCacheSize?: number;
  maxCacheByteSize?: number;
  debounceTime?: number;
  maxRequests?: number;
}

function getPMTiles(url: string): PMTiles {
  const existing = pmtilesCache.get(url);
  if (existing) return existing;

  // Choose source implementation.
  // - Default: FetchSource (library default behavior)
  // - If NEXT_PUBLIC_PM_ADD_RK=true and URL is relative/same-origin, use
  //   QueryParamRangeSource to defeat Chrome cache-entry locking during dev.
  const addRk = (process.env.NEXT_PUBLIC_PM_ADD_RK || 'false') === 'true';
  const isAbsolute = /^https?:\/\//i.test(url);
  let source: any;
  if (addRk) {
    source = new QueryParamRangeSource(url);
  } else {
    source = new FetchSource(url);
  }

  const pmt = new PMTiles(source, sharedPMCache);
  pmtilesCache.set(url, pmt);
  return pmt;
}

export class PMTilesTileLayer extends TileLayer<any, PMTilesTileLayerProps> {
  static layerName = 'PMTilesTileLayer';
  static defaultProps = { ...TileLayer.defaultProps, data: [] };

  getTileData = async (tile: any) => {
    const { x, y, z } = tile.index;
    const signal: AbortSignal | undefined = tile?.signal;
    const pmt = getPMTiles(this.props.pmtilesUrl);
    const layerName = this.props.mvtLayers?.[0] || 'humans';
    const cacheKey = `${this.props.pmtilesUrl}|${layerName}|${z}|${x}|${y}`;
    const cachedEntry = fcGet(cacheKey);
    if (cachedEntry) {
      sharedStats.hits += 1;
      dispatchStats();
      tile.userData = tile.userData || {};
      tile.userData.featureCount = cachedEntry.featureCount;
      tile.userData.totalPopulation = cachedEntry.totalPopulation;
      return cachedEntry.features;
    }
    sharedStats.misses += 1;
    dispatchStats();
    
    try {
      // PMTiles handles HTTP caching of range requests automatically
      const res = await pmt.getZxy(z, x, y, signal);
      if (!res || !res.data) return null;
      
      // Parse MVT data to GeoJSON features. Do NOT hard-filter by layer name.
      // Some historical tiles may use a different layer id than 'humans'.
      // We parse all layers and extract features robustly below.
      const parsed = await parse(res.data, MVTLoader, {
        mvt: {
          coordinates: 'wgs84',
          tileIndex: { x, y, z },
          // layers: undefined => include all layers
          shape: 'geojson'
        }
      });
      
      // Extract features from parsed MVT data (robust to different shapes)
      let features: any[] = [];
      if (Array.isArray(parsed)) {
        features = parsed as any[];
      } else if (parsed && typeof parsed === 'object') {
        const obj: any = parsed;
        // Common shapes returned by loaders.gl
        if (obj?.type === 'FeatureCollection' && Array.isArray(obj.features)) {
          features = obj.features;
        } else if (Array.isArray(obj.features)) {
          features = obj.features as any[];
        } else if (obj[layerName]?.type === 'FeatureCollection' && Array.isArray(obj[layerName]?.features)) {
          features = obj[layerName].features;
        } else if (Array.isArray(obj[layerName])) {
          features = obj[layerName] as any[];
        } else {
          // Aggregate features from any layer-shaped values
          const all: any[] = [];
          for (const key of Object.keys(obj)) {
            const v: any = obj[key];
            if (!v) continue;
            if (Array.isArray(v)) {
              // array of features or empty
              for (const f of v) {
                if (f && typeof f === 'object' && (f.type === 'Feature' || f.geometry)) all.push(f);
              }
            } else if (v.type === 'FeatureCollection' && Array.isArray(v.features)) {
              all.push(...v.features);
            }
          }
          if (all.length) features = all;
          else {
            // Handle numbered object keys (e.g., {0: feature, 1: feature, ...})
            const keys = Object.keys(obj);
            const isNumbered = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
            if (isNumbered) features = keys.map(k => obj[k]);
          }
        }
      }
      features = features.filter((feature: any) => geometryHasCoordinates(feature?.geometry));
      const { prepared, featureCount, totalPopulation } = prepareTileData(features, tile);
      // Optional debug logging removed to keep console clean during normal usage
      // Approximate encoded size from the PMTiles tile bytes if available
      let approxBytes = 0;
      try {
        const d: any = res?.data;
        if (d && typeof d === 'object') {
          if (typeof d.byteLength === 'number') approxBytes = Number(d.byteLength);
          // loaders.gl may pass a {buffer,value} wrapper
          else if (typeof (d as any)?.buffer?.byteLength === 'number') approxBytes = Number((d as any).buffer.byteLength);
        }
      } catch {}
      fcSet(cacheKey, prepared, approxBytes, { featureCount, totalPopulation });
      return prepared;
    } catch (err: any) {
      // Swallow aborts quietly; they are expected when tiles scroll offscreen
      if (err?.name === 'AbortError' || err?.message === 'AbortError') return null;
      console.warn('[PMTilesTileLayer] Failed to load tile:', { z, x, y, error: err });
      return null;
    }
  };

  renderSubLayers(props: any) {
    const points = props?.tile?.data as PreparedPoint[] | undefined;
    if (!points || points.length === 0) return null;

    const getRadius = (item: PreparedPoint) => {
      try {
        return this.props.getPointRadius?.(item.feature) ?? 0;
      } catch (error) {
        if ((process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true') {
          console.warn('[PMTilesTileLayer] getRadius error', error);
        }
        return 0;
      }
    };

    const getColor = (item: PreparedPoint) => {
      try {
        return this.props.getFillColor?.(item.feature) ?? [255, 255, 255, 200];
      } catch (error) {
        if ((process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true') {
          console.warn('[PMTilesTileLayer] getColor error', error);
        }
        return [255, 255, 255, 200];
      }
    };

    return new ScatterplotLayer({
      ...this.getSubLayerProps(props),
      id: `${this.props.id}-scatter-${props.tile.index.x}-${props.tile.index.y}-${props.tile.index.z}`,
      data: points,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      getPosition: (item: PreparedPoint) => item.position,
      getRadius,
      getFillColor: getColor,
      getLineColor: this.props.getLineColor
        ? (item: PreparedPoint) => this.props.getLineColor?.(item.feature) ?? [0, 0, 0, 0]
        : undefined,
      radiusUnits: this.props.pointRadiusUnits || 'meters',
      opacity: this.props.opacity,
      wrapLongitude: true,
      stroked: this.props.stroked ?? false,
      filled: this.props.filled ?? true,
      pickable: this.props.pickable,
      onClick: this.props.onClick
        ? (info: any) => this.props.onClick?.({ ...info, object: info?.object?.feature ?? info?.object })
        : undefined,
      onHover: this.props.onHover
        ? (info: any) => this.props.onHover?.({ ...info, object: info?.object?.feature ?? info?.object })
        : undefined,
      updateTriggers: this.props.updateTriggers,
      transitions: this.props.transitions,
      parameters: this.props.parameters,
    });
  }
}
