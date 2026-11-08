'use client';
import { getLODLevel } from '@/lib/lod';
import { createHumanLayerFactory } from '@/components/footsteps/layers';
import type { ColorScheme } from '@/components/footsteps/layers/color';
import type { LayersList } from '@deck.gl/core';
import { useRef } from 'react';
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
  const newLayerHasTileRef = useRef(false);

  const roundedZoom = Math.floor(viewState.zoom);
  const stableLODLevel = getLODLevel(roundedZoom);

  const layerViewState = viewState;

  const createHumanLayerForYear = createHumanLayerFactory({
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
  });

  const currentYearLayer = createHumanLayerForYear(
    year,
    stableLODLevel,
    1,
    `human-layer-current-${colorScheme}`,
    true,
  );

  const layers: LayersList = [currentYearLayer];

  return { layers, stableLODLevel } as const;
}
