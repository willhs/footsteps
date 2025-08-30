import { TileLayer } from '@deck.gl/geo-layers';
import { GeoJsonLayer } from '@deck.gl/layers';
import { PMTiles, FetchSource, SharedPromiseCache } from 'pmtiles';
import { parse } from '@loaders.gl/core';
import { MVTLoader } from '@loaders.gl/mvt';

// Simple PMTiles instance cache - avoid recreating FetchSource
const pmtilesCache = new Map<string, PMTiles>();
// Share header/dir requests across instances and HMR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = (globalThis as unknown) as any;
const sharedPMCache: SharedPromiseCache = g.__pmtilesCache || new SharedPromiseCache(2000);
g.__pmtilesCache = sharedPMCache;

// Cross-layer in-memory feature cache (LRU) to avoid re-fetching/parsing
type FeatureCacheEntry = { key: string; features: any[]; bytes: number };
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

function fcGet(key: string): any[] | null {
  const entry = sharedFeatureCache.map.get(key);
  if (!entry) return null;
  // LRU: refresh recency
  sharedFeatureCache.map.delete(key);
  sharedFeatureCache.map.set(key, entry);
  return entry.features;
}

function fcSet(key: string, features: any[], approxBytes: number, maxTiles = DEFAULT_MAX_TILES, maxBytes = DEFAULT_MAX_BYTES): void {
  if (!features || features.length === 0) return;
  const existing = sharedFeatureCache.map.get(key);
  if (existing) {
    // Update bytes and entry
    sharedFeatureCache.bytes -= existing.bytes;
    sharedFeatureCache.map.delete(key);
  }
  // Conservative byte estimate: prefer encoded tile bytes; fallback to per-feature guess
  const bytes = Math.max(approxBytes || 0, features.length * 200);
  const entry: FeatureCacheEntry = { key, features, bytes };
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

interface PMTilesTileLayerProps {
  id: string;
  pmtilesUrl: string;
  mvtLayers?: string[];
  getPointRadius?: (feature: any) => number;
  getFillColor?: (feature: any) => [number, number, number, number];
  pointRadiusUnits?: 'meters' | 'pixels';
  opacity?: number;
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
  
  // Prefer browser HTTP cache for range requests; avoid revalidation churn
  // by using RequestInit.cache = 'force-cache'.
  // Note: FetchSource(url, init) accepts standard RequestInit in pmtiles@3.x
  const fetchInit: RequestInit = {
    // Force use of HTTP cache if present, do not revalidate
    cache: 'force-cache',
  };
  const pmt = new PMTiles(new FetchSource(url, fetchInit as any), sharedPMCache);
  pmtilesCache.set(url, pmt);
  return pmt;
}

export class PMTilesTileLayer extends TileLayer<any, PMTilesTileLayerProps> {
  static layerName = 'PMTilesTileLayer';
  
  getTileData = async (tile: any) => {
    const { x, y, z } = tile.index;
    const signal: AbortSignal | undefined = tile?.signal;
    const pmt = getPMTiles(this.props.pmtilesUrl);
    const layerName = this.props.mvtLayers?.[0] || 'humans';
    const cacheKey = `${this.props.pmtilesUrl}|${layerName}|${z}|${x}|${y}`;
    const cached = fcGet(cacheKey);
    if (cached) {
      sharedStats.hits += 1;
      dispatchStats();
      if ((process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true') {
        try { console.debug('[PMTilesTileLayer] cache HIT', { z, x, y }); } catch {}
      }
      return cached;
    }
    sharedStats.misses += 1;
    dispatchStats();
    
    try {
      // PMTiles handles HTTP caching of range requests automatically
      const res = await pmt.getZxy(z, x, y, signal);
      if (!res || !res.data) return null;
      
      // Parse MVT data to GeoJSON features  
      const parsed = await parse(res.data, MVTLoader, {
        mvt: {
          coordinates: 'wgs84',
          tileIndex: { x, y, z },
          layers: this.props.mvtLayers || ['humans'],
          shape: 'geojson'
        }
      });
      
      // Extract features from parsed MVT data (robust to different shapes)
      let features: any[] = [];
      if (Array.isArray(parsed)) {
        features = parsed as any[];
      } else if (parsed && typeof parsed === 'object') {
        const obj: any = parsed;
        if (obj?.type === 'FeatureCollection' && Array.isArray(obj.features)) {
          features = obj.features;
        } else if (obj[layerName]?.type === 'FeatureCollection' && Array.isArray(obj[layerName]?.features)) {
          features = obj[layerName].features;
        } else if (Array.isArray(obj[layerName])) {
          features = obj[layerName] as any[];
        } else if (Array.isArray(obj.features)) {
          features = obj.features as any[];
        }
      }
      if ((process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true') {
        try { console.debug('[PMTilesTileLayer] features', { z, x, y, count: features.length }); } catch {}
      }
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
      fcSet(cacheKey, features, approxBytes);
      return features;
    } catch (err: any) {
      // Swallow aborts quietly; they are expected when tiles scroll offscreen
      if (err?.name === 'AbortError' || err?.message === 'AbortError') return null;
      console.warn('[PMTilesTileLayer] Failed to load tile:', { z, x, y, error: err });
      return null;
    }
  };

  renderSubLayers(props: any) {
    const { data } = props.tile;
    if (!data || data.length === 0) return null;

    return new GeoJsonLayer({
      ...this.getSubLayerProps(props),
      id: `${this.props.id}-geojson-${props.tile.index.x}-${props.tile.index.y}-${props.tile.index.z}`,
      data,
      pointType: 'circle',
      getPointRadius: this.props.getPointRadius,
      getFillColor: this.props.getFillColor,
      pointRadiusUnits: this.props.pointRadiusUnits || 'meters',
      opacity: this.props.opacity,
      pickable: this.props.pickable,
      onClick: this.props.onClick,
      onHover: this.props.onHover,
      updateTriggers: this.props.updateTriggers,
      transitions: this.props.transitions,
      parameters: this.props.parameters,
    });
  }
}
