import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { createHumanLayerFactory } from '@/components/footsteps/layers/humanLayerFactory';

interface CrossfadeRefs {
  prevYear: number | null;
  currentYearOpacity: number;
  prevYearOpacity: number;
  isYearCrossfading: boolean;
  newLayerReadyRef: MutableRefObject<boolean>;
  newLayerHasTileRef: MutableRefObject<boolean>;
  startCrossfade: () => void;
}

interface UseHumanLayersOptions {
  year: number;
  lodLevel: number;
  is3DMode: boolean;
  layerViewState: { zoom?: number } | null;
  isZooming: boolean;
  isPanning: boolean;
  crossfade: CrossfadeRefs;
  setTileLoading: (loading: boolean) => void;
  setFeatureCount: (count: number) => void;
  setTotalPopulation: (total: number) => void;
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

export default function useHumanLayers(options: UseHumanLayersOptions) {
  const {
    year,
    lodLevel,
    is3DMode,
    layerViewState,
    isZooming,
    isPanning,
    crossfade,
    setTileLoading,
    setFeatureCount,
    setTotalPopulation,
    setTooltipData,
  } = options;

  const createHumanLayerForYear = useMemo(
    () =>
      createHumanLayerFactory({
        is3DMode,
        layerViewState,
        isZooming,
        isPanning,
        isYearCrossfading: crossfade.isYearCrossfading,
        newLayerReadyRef: crossfade.newLayerReadyRef,
        newLayerHasTileRef: crossfade.newLayerHasTileRef,
        startCrossfade: crossfade.startCrossfade,
        setTileLoading,
        setFeatureCount,
        setTotalPopulation,
        setTooltipData,
      }),
    [
      is3DMode,
      layerViewState,
      isZooming,
      isPanning,
      crossfade.isYearCrossfading,
      crossfade.newLayerReadyRef,
      crossfade.newLayerHasTileRef,
      crossfade.startCrossfade,
      setTileLoading,
      setFeatureCount,
      setTotalPopulation,
      setTooltipData,
    ],
  );

  const currentLayer = useMemo(
    () =>
      createHumanLayerForYear(
        year,
        lodLevel,
        crossfade.currentYearOpacity,
        `human-layer-${year}`,
        true,
      ),
    [createHumanLayerForYear, year, lodLevel, crossfade.currentYearOpacity],
  );

  const previousLayer = useMemo(
    () =>
      crossfade.prevYear !== null
        ? createHumanLayerForYear(
            crossfade.prevYear as number,
            lodLevel,
            crossfade.prevYearOpacity,
            `human-layer-${crossfade.prevYear}`,
            false,
          )
        : null,
    [
      createHumanLayerForYear,
      crossfade.prevYear,
      lodLevel,
      crossfade.prevYearOpacity,
    ],
  );

  return [currentLayer, previousLayer] as const;
}
