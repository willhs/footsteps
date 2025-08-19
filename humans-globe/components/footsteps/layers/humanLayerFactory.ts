import type { MutableRefObject } from 'react';
import { createHumanTilesLayer, radiusStrategies } from './index';
import { buildTooltipData, type PickingInfo } from './tooltip';
import { aggregateTileMetrics } from './tileMetrics';
import { computeFadeMs, handleTileLoad, triggerCrossfade } from './crossfade';

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
              const metricsResult = aggregateTileMetrics(rawTiles);
              metrics.setFeatureCount(metricsResult.count);
              metrics.setTotalPopulation(metricsResult.population);
              triggerCrossfade(
                callbacks.setTileLoading,
                callbacks.startCrossfade,
              );
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
