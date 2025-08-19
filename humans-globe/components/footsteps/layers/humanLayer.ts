import { MVTLayer } from '@deck.gl/geo-layers';
import { getTileUrlPattern } from '@/lib/tilesConfig';
import { radiusStrategies, type RadiusStrategy } from './radiusStrategies';
import { ensureByteLength } from '@/lib/ensureByteLength';

// Helper: map population to a base display radius in meters
function getBaseRadiusFromPopulation(population: number): number {
  if (population > 1_000_000) return 60000; // Super cities: 60km
  if (population > 100_000) return 40000; // Massive cities: 40km
  if (population > 50_000) return 25000; // Major cities: 25km
  if (population > 20_000) return 15000; // Large settlements: 15km
  if (population > 5_000) return 8000; // Medium settlements: 8km
  if (population > 1_000) return 4000; // Small settlements: 4km
  if (population > 100) return 2000; // Villages: 2km
  return 1000; // Tiny settlements: 1km
}

// Global layer counter to ensure unique IDs
let layerCounter = 0;

// Create MVT-based human tiles layer
export function createHumanTilesLayer(
  year: number,
  lodLevel: number,
  viewState: { zoom?: number } | null,
  radiusStrategy: RadiusStrategy = radiusStrategies.zoomAdaptive,
  onClick?: (info: unknown) => void,
  onHover?: (info: unknown) => void,
  extra?: {
    onTileLoad?: (tile: unknown) => void;
    onViewportLoad?: (tiles: unknown[]) => void;
    onTileError?: (error: unknown) => void;
    tileOptions?: {
      refinementStrategy?:
        | 'best-available'
        | 'no-overlap'
        | 'never'
        | ((...args: unknown[]) => unknown);
      maxCacheSize?: number;
      maxCacheByteSize?: number;
      debounceTime?: number;
      maxRequests?: number;
      zoomOffset?: number;
      useBinary?: boolean;
      fadeMs?: number;
      easing?: (t: number) => number;
    };
    debugTint?: [number, number, number];
  },
  opacity: number = 1.0,
  instanceId?: string,
  enableDepthTest: boolean = true,
) {
  // reference to satisfy no-unused-vars when argsIgnorePattern isn't set
  void enableDepthTest;

  const currentZoom = viewState?.zoom || 1;
  const tileOptions =
    (extra && 'tileOptions' in extra ? extra.tileOptions : undefined) || {};

  // Generate unique layer ID to prevent deck.gl assertion failures from layer reuse
  const baseId = `human-tiles-${year}-single-${radiusStrategy.getName()}`;
  const layerId = instanceId || `${baseId}-${++layerCounter}-${Date.now()}`;

  // Clamp tile zooms to the ranges actually present in each LOD's MBTiles.
  // This prevents deck.gl from requesting higher z tiles than exist when the
  // viewport zoom is between integer levels (e.g. z=4.8 with LOD 1 → still use z=4 tiles).
  const lodZoomRanges: Record<number, { min: number; max: number }> = {
    0: { min: 0, max: 3 },
    1: { min: 4, max: 4 },
    2: { min: 5, max: 5 },
    3: { min: 6, max: 12 },
  };
  const zoomRange = { min: 0, max: 12 };

  return new MVTLayer({
    id: layerId,
    data: getTileUrlPattern(year),
    minZoom: zoomRange.min,
    maxZoom: zoomRange.max,
    // Use best-available refinement to ensure tiles load
    refinementStrategy: 'best-available',
    // Set reasonable defaults for tile loading
    maxCacheSize: tileOptions.maxCacheSize ?? 100,
    maxCacheByteSize: tileOptions.maxCacheByteSize ?? 32 * 1024 * 1024, // 32MB
    debounceTime: tileOptions.debounceTime ?? 0, // No debounce by default
    maxRequests: tileOptions.maxRequests ?? 6,
    zoomOffset: tileOptions.zoomOffset ?? 0,
    autoHighlight: false,
    // Use GeoJSON for easier debugging
    binary: false,
    // Simplified load options
    loadOptions: {
      mvt: {
        coordinates: 'wgs84',
        shape: 'geojson',
        // Single-layer yearly MBTiles exports features under the 'humans' layer
        layers: ['humans'],
      },
    },
    pickable: true,
    // Forward events
    onClick: onClick || (() => {}),
    onHover: onHover || (() => {}),
    // Ensure deck.gl always receives callable callbacks to avoid TypeErrors
    onTileLoad: (tile: unknown) => {
      const content = (tile as { content?: unknown })?.content;
      try {
        ensureByteLength(content);
      } catch {
        /* ignore byteLength estimation errors */
      }
      if (typeof extra?.onTileLoad === 'function') extra.onTileLoad(tile);
    },
    onViewportLoad:
      typeof extra?.onViewportLoad === 'function'
        ? extra?.onViewportLoad
        : () => {},
    onTileError:
      typeof extra?.onTileError === 'function' ? extra?.onTileError : () => {},
    // Styling forwarded to GeoJsonLayer sublayers
    pointRadiusUnits: 'meters',
    getPointRadius: (f: unknown) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const feature = f as any;
        const pop = Number(feature?.properties?.population || 0);
        const base = getBaseRadiusFromPopulation(pop);
        const radius = radiusStrategy.calculateRadius(base, currentZoom);
        return radius;
      } catch (error) {
        console.error(`[RADIUS-ERROR]:`, error);
        return 2000;
      }
    },
    getFillColor: (f: unknown) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const population = Number((f as any)?.properties?.population || 0);
        // Use fixed alpha; rely on layer.opacity for crossfades to avoid double-dimming
        let base: [number, number, number, number];
        if (population > 20000) base = [255, 100, 0, 240];
        else if (population > 5000) base = [255, 140, 0, 220];
        else if (population > 1000) base = [255, 180, 0, 200];
        else base = [255, 200, 100, 180];
        // Apply optional debug tint to help visualize crossfade layers in dev
        const tint = extra?.debugTint;
        if (tint && Array.isArray(tint)) {
          const clamp = (v: number) => Math.max(0, Math.min(255, v));
          const r = clamp(base[0] + tint[0]);
          const g = clamp(base[1] + tint[1]);
          const b = clamp(base[2] + tint[2]);
          return [r, g, b, base[3]] as [number, number, number, number];
        }
        return base;
      } catch {
        return [255, 200, 100, 180];
      }
    },
    updateTriggers: {
      getPointRadius: [
        year,
        lodLevel,
        Math.floor((currentZoom || 0) * 4) / 4,
        radiusStrategy.getName(),
      ],
      getFillColor: [
        year,
        lodLevel,
        (
          extra as { debugTint?: [number, number, number] } | undefined
        )?.debugTint?.join(','),
      ],
    },
    opacity: opacity,
    parameters: {
      // Always disable depth test for dots so background layers never occlude them
      depthTest: false,
      depthMask: false,
      blend: true,
      blendFunc: [770, 771],
    },
    transitions: {
      opacity: {
        duration:
          typeof tileOptions.fadeMs === 'number' ? tileOptions.fadeMs : 300,
        easing: tileOptions.easing || ((t: number) => t * t * (3.0 - 2.0 * t)), // smoothstep
      },
      getPointRadius: {
        duration: 250,
        easing: tileOptions.easing || ((t: number) => t * t * (3.0 - 2.0 * t)),
      },
    },
  });
}
