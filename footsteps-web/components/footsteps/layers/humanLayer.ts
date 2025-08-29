import type { MutableRefObject } from 'react';
import { MVTLayer } from '@deck.gl/geo-layers';
import { getTileUrlPattern } from '@/lib/tilesConfig';
import { getTileArrayBuffer } from '@/lib/pmtilesClient';
import { radiusStrategies, type RadiusStrategy } from './radiusStrategies';
import { getPointRadius } from './radius';
import { createOnTileLoadHandler } from './tileCache';
import { getFillColor, type ColorScheme } from './color';
import { buildTooltipData, type PickingInfo } from './tooltip';
import { getWorkerManager } from './WorkerManager';
// Removed crossfade imports

// Allow tuning of tile fade duration via env; default to a subtle crossfade
const DEFAULT_TILE_FADE_MS = 1000
// const DEFAULT_TILE_FADE_MS =
 // Number(process.env.NEXT_PUBLIC_TILE_FADE_MS) || 200;

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
      // New: control radius attribute transition duration
      radiusTransitionMs?: number;
    };
    debugTint?: [number, number, number];
    colorScheme?: ColorScheme;
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

  // Include colorScheme in layer id to force recreation when colors change
  const colorSchemeSuffix = extra?.colorScheme || 'orange';
  const layerId = instanceId || `human-tiles-${radiusStrategy.getName()}-${colorSchemeSuffix}`;
  const zoomRange = { min: 0, max: 12 };

  return new MVTLayer({
    id: layerId,
    // Use URL pattern for standard MVT layer behavior
    data: getTileUrlPattern(year),
    minZoom: zoomRange.min,
    maxZoom: zoomRange.max,
    // Use best-available refinement to ensure tiles load
    refinementStrategy: 'best-available',
    // Set reasonable defaults for tile loading
    maxCacheSize: tileOptions.maxCacheSize ?? 300,
    maxCacheByteSize: tileOptions.maxCacheByteSize ?? 64 * 1024 * 1024, // 64MB
    debounceTime: tileOptions.debounceTime ?? 0, // No debounce by default
    maxRequests: tileOptions.maxRequests ?? 6,
    zoomOffset: tileOptions.zoomOffset ?? 0,
    autoHighlight: false,
    // Use binary tiles for performance
    binary: true,
    // Simplified load options
    loadOptions: {
      mvt: {
        coordinates: 'wgs84',
        layers: ['humans'],
      },
    },
    pickable: true,
    // Forward events
    onClick: onClick || (() => {}),
    onHover: onHover || (() => {}),
    // Ensure deck.gl always receives callable callbacks to avoid TypeErrors
    onTileLoad: createOnTileLoadHandler(extra?.onTileLoad),
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
        (
          extra as { debugTint?: [number, number, number]; colorScheme?: ColorScheme } | undefined
        )?.debugTint?.join(','),
        extra?.colorScheme,
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
        duration:
          typeof tileOptions.radiusTransitionMs === 'number'
            ? tileOptions.radiusTransitionMs
            : 250,
        easing: tileOptions.easing || ((t: number) => t * t * (3.0 - 2.0 * t)),
      },
    },
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
              const workerManager = getWorkerManager();
              workerManager.calculateMetrics(rawTiles, (metricsResult) => {
                metrics.setFeatureCount(metricsResult.count);
                metrics.setTotalPopulation(metricsResult.population);
                // Signal that metrics are ready only once we have a real new-year tile
                // or non-zero metrics, to avoid flashing to 0 during year transitions.
                if (
                  newLayerHasTileRef.current ||
                  metricsResult.count > 0 ||
                  metricsResult.population > 0
                ) {
                  try {
                    callbacks.setMetricsLoading?.(false);
                  } catch {}
                }
                callbacks.setTileLoading(false);
              });
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
          debounceTime: isZooming || isPanning ? 80 : 20,
          useBinary: true,
          // Disable radius animation on the newly introduced year layer to avoid initial size pop
          radiusTransitionMs: isNewYearLayer ? 0 : 250,
        },
        debugTint: undefined,
        colorScheme,
      },
      layerOpacity,
      instanceId,
      is3DMode,
    );
  };
}
