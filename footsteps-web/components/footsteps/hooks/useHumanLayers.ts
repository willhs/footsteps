'use client';

import { useMemo } from 'react';
import { getLODLevel } from '@/lib/lod';
import { createHumanLayerFactory } from '@/components/footsteps/layers';
import type { ColorScheme } from '@/components/footsteps/layers/color';
import type { LayersList } from '@deck.gl/core';
import useYearCrossfade from '@/components/footsteps/hooks/useYearCrossfade';
import type { TooltipData } from '@/components/footsteps/overlays/TooltipOverlay';

interface UseHumanLayersProps {
  year: number;
  is3DMode: boolean;
  viewState: { zoom: number };
  isZooming: boolean;
  isPanning: boolean;
  colorScheme: ColorScheme;
  setTileLoading: (v: boolean) => void;
  setMetricsLoading: (v: boolean) => void;
  setFeatureCount: (v: number) => void;
  setTotalPopulation: (v: number) => void;
  setTooltipData: (data: TooltipData | null) => void;
}

export default function useHumanLayers({
  year,
  is3DMode,
  viewState,
  isZooming,
  isPanning,
  colorScheme,
  setTileLoading,
  setMetricsLoading,
  setFeatureCount,
  setTotalPopulation,
  setTooltipData,
}: UseHumanLayersProps) {
  const { previousYear, currentOpacity, previousOpacity, newLayerHasTileRef } =
    useYearCrossfade(year);

  const roundedZoom = Math.floor(viewState.zoom);
  const stableLODLevel = useMemo(() => getLODLevel(roundedZoom), [roundedZoom]);

  const layerViewState = viewState;

  const createHumanLayerForYear = useMemo(
    () =>
      createHumanLayerFactory({
        is3DMode,
        layerViewState,
        isZooming,
        isPanning,
        newLayerHasTileRef,
        callbacks: {
          setTileLoading,
          setMetricsLoading,
          setTooltipData,
        },
        metrics: {
          setFeatureCount,
          setTotalPopulation,
        },
        colorScheme,
      }),
    [
      is3DMode,
      layerViewState,
      isZooming,
      isPanning,
      newLayerHasTileRef,
      setTileLoading,
      setMetricsLoading,
      setTooltipData,
      setFeatureCount,
      setTotalPopulation,
      colorScheme,
    ],
  );

  const currentYearLayer = useMemo(
    () =>
      createHumanLayerForYear(
        year,
        stableLODLevel,
        currentOpacity,
        `human-layer-current-${colorScheme}`,
        true,
      ),
    [createHumanLayerForYear, year, stableLODLevel, currentOpacity, colorScheme],
  );

  const previousYearLayer = useMemo(
    () =>
      previousYear !== null
        ? createHumanLayerForYear(
            previousYear as number,
            stableLODLevel,
            previousOpacity,
            `human-layer-previous-${colorScheme}`,
            false,
          )
        : null,
    [
      createHumanLayerForYear,
      previousYear,
      stableLODLevel,
      previousOpacity,
      colorScheme,
    ],
  );

  const layers: LayersList = previousYearLayer
    ? ([previousYearLayer, currentYearLayer] as LayersList)
    : ([currentYearLayer] as LayersList);

  return { layers, stableLODLevel } as const;
}

