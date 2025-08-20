import type { MutableRefObject } from 'react';
import { MVTLayer } from '@deck.gl/geo-layers';
import { getTileUrlPattern } from '@/lib/tilesConfig';
import { radiusStrategies, type RadiusStrategy } from './radiusStrategies';
import { getPointRadius } from './radius';
import { createLayerId, createOnTileLoadHandler } from './tileCache';
import { getFillColor } from './color';
import { buildTooltipData, type PickingInfo } from './tooltip';
import { aggregateTileMetrics } from './tileMetrics';
import type { TileMetrics } from './tileMetrics';
import { computeFadeMs, handleTileLoad, triggerCrossfade } from './crossfade';

const tileMetricsWorker: Worker | null =
  typeof window !== 'undefined'
    ? new Worker(new URL('./tileMetrics.worker.ts', import.meta.url))
    : null;

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
  const layerId = createLayerId(year, radiusStrategy, instanceId);
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
    getFillColor: (f: unknown) => getFillColor(f, extra?.debugTint),
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

// Factory pattern for human layers with crossfading and metrics
export interface HumanLayerCallbacks {
  startCrossfade: () => void;
  setTileLoading: (loading: boolean) => void;
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
  isYearCrossfading: boolean;
  newLayerReadyRef: MutableRefObject<boolean>;
  newLayerHasTileRef: MutableRefObject<boolean>;
  callbacks: HumanLayerCallbacks;
  metrics: HumanLayerMetrics;
}

export function createHumanLayerFactory(config: HumanLayerFactoryConfig) {
  const {
    is3DMode,
    layerViewState,
    isZooming,
    isPanning,
    isYearCrossfading,
    newLayerReadyRef,
    newLayerHasTileRef,
    callbacks,
    metrics,
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

    const fadeMs = computeFadeMs(isNewYearLayer, newLayerReadyRef);

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
          handleTileLoad(
            isNewYearLayer,
            newLayerHasTileRef,
            callbacks.setTileLoading,
          );
        },
        onViewportLoad: (rawTiles: unknown[]) => {
          try {
            if (isNewYearLayer) {
              if (tileMetricsWorker) {
                tileMetricsWorker.onmessage = (
                  e: MessageEvent<TileMetrics>,
                ) => {
                  const { count, population } = e.data;
                  metrics.setFeatureCount(count);
                  metrics.setTotalPopulation(population);
                  triggerCrossfade(
                    newLayerHasTileRef,
                    callbacks.setTileLoading,
                    callbacks.startCrossfade,
                  );
                };
                tileMetricsWorker.postMessage(rawTiles);
              } else {
                const metricsResult = aggregateTileMetrics(rawTiles);
                metrics.setFeatureCount(metricsResult.count);
                metrics.setTotalPopulation(metricsResult.population);
                triggerCrossfade(
                  newLayerHasTileRef,
                  callbacks.setTileLoading,
                  callbacks.startCrossfade,
                );
              }
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
          if (newLayerHasTileRef.current) {
            triggerCrossfade(
              newLayerHasTileRef,
              callbacks.setTileLoading,
              callbacks.startCrossfade,
            );
          } else {
            callbacks.setTileLoading(false);
          }
        },
        tileOptions: {
          fadeMs: fadeMs,
          debounceTime: isZooming || isPanning ? 80 : 20,
          useBinary: false,
        },
        debugTint:
          process.env.NODE_ENV !== 'production' && isYearCrossfading
            ? isNewYearLayer
              ? [0, 30, 80]
              : [80, 0, 0]
            : undefined,
      },
      layerOpacity,
      instanceId,
      is3DMode,
    );
  };
}
