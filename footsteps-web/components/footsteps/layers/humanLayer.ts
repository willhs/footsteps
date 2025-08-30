import type { MutableRefObject } from 'react';
import { getPMTilesUrl } from '@/lib/pmtilesClient';
import { PMTilesTileLayer } from '@/lib/pmtilesTileLayer';
import { MVTLayer } from '@deck.gl/geo-layers';
import { extractFeaturesFromBinaryTile } from '@/lib/binaryTileUtils';
import { radiusStrategies, type RadiusStrategy } from './radiusStrategies';
import { getPointRadius } from './radius';
import { createOnTileLoadHandler } from './tileCache';
import { getFillColor, type ColorScheme } from './color';
import { buildTooltipData, type PickingInfo } from './tooltip';

// Allow tuning of tile fade duration via env; default to a subtle crossfade
const DEFAULT_TILE_FADE_MS = 1000;

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
      fadeMs?: number;
      easing?: (t: number) => number;
      radiusTransitionMs?: number;
    };
    debugTint?: [number, number, number];
    colorScheme?: ColorScheme;
  },
  opacity: number = 1.0,
  instanceId?: string,
) {
  const currentZoom = viewState?.zoom || 1;
  const tileOptions = extra?.tileOptions || {};

  const colorSchemeSuffix = extra?.colorScheme || 'orange';
  const layerId = instanceId || `human-tiles-${year}-${radiusStrategy.getName()}-${colorSchemeSuffix}`;

  const useApiTiles = (process.env.NEXT_PUBLIC_TILE_SOURCE || 'pmtiles') === 'api';

  const commonProps = {
    id: layerId,
    mvtLayers: ['humans'],
    minZoom: 0,
    maxZoom: 12,
    extent: [-180, -85, 180, 85] as [number, number, number, number],
    refinementStrategy: tileOptions.refinementStrategy ?? 'best-available',
    // Increase deck.gl in-layer tile cache to reduce churn
    maxCacheSize: tileOptions.maxCacheSize ?? 1000,
    maxCacheByteSize: tileOptions.maxCacheByteSize ?? 128 * 1024 * 1024,
    debounceTime: tileOptions.debounceTime ?? 0,
    maxRequests: tileOptions.maxRequests ?? 6,
    pickable: true,
    onClick: onClick || (() => {}),
    onHover: onHover || (() => {}),
    onTileLoad: createOnTileLoadHandler(extra?.onTileLoad),
    onViewportLoad: extra?.onViewportLoad || (() => {}),
    onTileError: extra?.onTileError || ((err: unknown) => {
      console.error('[PMTILES-TILE-ERROR]', err);
    }),
    pointRadiusUnits: 'meters' as const,
    getPointRadius: (f: unknown) => {
      try {
        return getPointRadius(f, currentZoom, radiusStrategy);
      } catch (error) {
        console.error(`[RADIUS-ERROR]:`, error);
        return 2000;
      }
    },
    getFillColor: (f: unknown) => getFillColor(f, extra?.debugTint, extra?.colorScheme),
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
        extra?.debugTint?.join(','),
        extra?.colorScheme,
      ],
      getTileData: [
        year,
        getPMTilesUrl(year),
        'humans',
      ],
    },
    opacity: opacity,
    parameters: {
      depthTest: false,
      depthMask: false,
      blend: true,
      blendFunc: [770, 771],
    },
    transitions: {
      opacity: {
        duration: tileOptions.fadeMs ?? 300,
        easing: tileOptions.easing || ((t: number) => t * t * (3.0 - 2.0 * t)),
      },
      getPointRadius: {
        duration: tileOptions.radiusTransitionMs ?? 250,
        easing: tileOptions.easing || ((t: number) => t * t * (3.0 - 2.0 * t)),
      },
    },
  };

  if (useApiTiles) {
    // Use server-side API tiles with stable 200 responses; browser disk cache is very reliable here.
    const template = `/api/tiles/${year}/single/{z}/{x}/{y}.pbf`;
    return new MVTLayer({
      ...commonProps,
      id: `${layerId}-api`,
      data: template,
      binary: true,
      loadOptions: {
        fetch: { cache: 'force-cache' },
      },
      pointType: 'circle',
    } as any);
  }

  return new PMTilesTileLayer({
    ...commonProps,
    pmtilesUrl: getPMTilesUrl(year),
  });
}


// Factory pattern for human layers with metrics
export interface HumanLayerCallbacks {
  setTileLoading: (loading: boolean) => void;
  // Optional: allow caller to track when aggregated metrics are ready
  setMetricsLoading?: (loading: boolean) => void;
  setTooltipData: (
    data: {
      population: number;
      coordinates: [number, number];
      year: number;
      settlementType?: string;
      clickPosition: { x: number; y: number };
    } | null,
  ) => void;
}

export interface HumanLayerMetrics {
  setFeatureCount: (count: number) => void;
  setTotalPopulation: (total: number) => void;
}

export interface HumanLayerFactoryConfig {
  is3DMode: boolean;
  layerViewState: { zoom?: number } | null;
  isZooming: boolean;
  isPanning: boolean;
  newLayerHasTileRef: MutableRefObject<boolean>;
  callbacks: HumanLayerCallbacks;
  metrics: HumanLayerMetrics;
  tileFadeMs?: number;
  colorScheme?: ColorScheme;
}

export function createHumanLayerFactory(config: HumanLayerFactoryConfig) {
  const {
    is3DMode,
    layerViewState,
    isZooming,
    isPanning,
    newLayerHasTileRef,
    callbacks,
    metrics,
    tileFadeMs = DEFAULT_TILE_FADE_MS,
    colorScheme = 'white',
  } = config;

  return function createHumanLayerForYear(
    targetYear: number,
    lodLevel: number,
    layerOpacity: number,
    instanceId: string,
    isNewYearLayer: boolean,
  ) {
    const radiusStrategy = is3DMode
      ? radiusStrategies.globe3D
      : radiusStrategies.zoomAdaptive;

    return createHumanTilesLayer(
      targetYear,
      lodLevel,
      layerViewState,
      radiusStrategy,
      (raw: unknown) => {
        const info = raw as PickingInfo;
        const data = buildTooltipData(info, targetYear);
        if (data) callbacks.setTooltipData(data);
      },
      (raw: unknown) => {
        const info = raw as PickingInfo;
        callbacks.setTooltipData(buildTooltipData(info, targetYear));
      },
      {
        onTileLoad: (_tile: unknown) => {
          if (isNewYearLayer) {
            callbacks.setTileLoading(false);
            if (!newLayerHasTileRef.current) {
              newLayerHasTileRef.current = true;
            }
          }
        },
        onViewportLoad: (rawTiles: unknown[]) => {
          try {
            if (isNewYearLayer) {
              // Calculate metrics directly from GeoJSON features instead of using WorkerManager
              let totalFeatures = 0;
              let totalPop = 0;
              
              for (const tile of rawTiles) {
                const tileData = (tile as any)?.data;
                if (Array.isArray(tileData)) {
                  totalFeatures += tileData.length;
                  for (const feature of tileData) {
                    const pop = feature?.properties?.population || 0;
                    totalPop += pop;
                  }
                  continue;
                }
                // Fallback for MVTLayer(binary: true) tiles
                const feats = extractFeaturesFromBinaryTile(tile);
                if (feats.length) {
                  totalFeatures += feats.length;
                  for (const f of feats) totalPop += f.properties?.population || 0;
                }
              }
              
              metrics.setFeatureCount(totalFeatures);
              metrics.setTotalPopulation(totalPop);
              
              // Signal that metrics are ready
              if (newLayerHasTileRef.current || totalFeatures > 0 || totalPop > 0) {
                try {
                  callbacks.setMetricsLoading?.(false);
                } catch {}
              }
              callbacks.setTileLoading(false);
            }
          } catch (error) {
            console.error(
              `[VIEWPORT-LOAD-ERROR] Year: ${targetYear}, LOD: ${lodLevel}:`,
              error,
            );
            callbacks.setTileLoading(false);
          }
        },
        onTileError: (error: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorInfo = error as any;
          const tileCoords = errorInfo?.tile?.index || errorInfo?.index || {};
          const url = errorInfo?.tile?.url || errorInfo?.url || 'unknown';
          const status =
            errorInfo?.response?.status || errorInfo?.status || 'unknown';
          console.error(`[TILE-ERROR] Failed to load tile:`, {
            year: targetYear,
            lodLevel,
            coords: `${tileCoords.z}/${tileCoords.x}/${tileCoords.y}`,
            url,
            status,
            error: errorInfo?.message || errorInfo?.error || errorInfo,
          });
          callbacks.setTileLoading(false);
        },
        tileOptions: {
          fadeMs: tileFadeMs,
          // While interacting: avoid parent fetches and raise concurrency to reduce waterfall
          refinementStrategy: (isZooming || isPanning) ? 'no-overlap' : 'best-available',
          debounceTime: (isZooming || isPanning) ? 80 : 10,
          // Limit Deck.gl request scheduler to 6 concurrent fetches to reduce churn
          maxRequests: 6,
          // Disable radius animation on the newly introduced year layer to avoid initial size pop
          radiusTransitionMs: isNewYearLayer ? 0 : 250,
        },
        debugTint: undefined,
        colorScheme,
      },
      layerOpacity,
      instanceId,
    );
  };
}
