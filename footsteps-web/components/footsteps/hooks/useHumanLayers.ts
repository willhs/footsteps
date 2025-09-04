'use client';

import { useMemo, useEffect, useState } from 'react';
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

  // Hysteresis thresholds between LOD levels (keep in sync with lib/lod.ts)
  const LOD_THRESHOLDS = [2, 4, 6];

  const [stableLODLevel, setStableLODLevel] = useState(() =>
    getLODLevel(viewState.zoom),
  );
  const [previousLODLevel, setPreviousLODLevel] = useState<number | null>(null);
  const [currentLODOpacity, setCurrentLODOpacity] = useState(1);
  const [previousLODOpacity, setPreviousLODOpacity] = useState(0);
  const lodFadeMs = 300;

  const layerViewState = viewState;

  useEffect(() => {
    const target = getLODLevel(viewState.zoom);
    if (target === stableLODLevel) return;

    const boundaryIndex = target > stableLODLevel ? stableLODLevel : target;
    const boundary = LOD_THRESHOLDS[boundaryIndex];
    const threshold = target > stableLODLevel ? boundary + 0.5 : boundary - 0.5;
    const zoom = viewState.zoom;

    const crossed =
      target > stableLODLevel ? zoom >= threshold : zoom <= threshold;

    if (!crossed) return;

    setPreviousLODLevel(stableLODLevel);
    setStableLODLevel(target);
    setCurrentLODOpacity(0);
    setPreviousLODOpacity(1);
    // Allow new layer to prefetch tiles before becoming fully opaque
    requestAnimationFrame(() => {
      setCurrentLODOpacity(1);
      setPreviousLODOpacity(0);
    });

    const timeout = setTimeout(() => {
      setPreviousLODLevel(null);
    }, lodFadeMs);

    return () => clearTimeout(timeout);
  }, [viewState.zoom, stableLODLevel]);

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
        currentOpacity * currentLODOpacity,
        `human-layer-current-${colorScheme}`,
        true,
      ),
    [
      createHumanLayerForYear,
      year,
      stableLODLevel,
      currentOpacity,
      currentLODOpacity,
      colorScheme,
    ],
  );

  const previousYearLayer = useMemo(
    () =>
      previousYear !== null
        ? createHumanLayerForYear(
            previousYear as number,
            stableLODLevel,
            previousOpacity * currentLODOpacity,
            `human-layer-previous-${colorScheme}`,
            false,
          )
        : null,
    [
      createHumanLayerForYear,
      previousYear,
      stableLODLevel,
      previousOpacity,
      currentLODOpacity,
      colorScheme,
    ],
  );

  const previousLODLayer = useMemo(
    () =>
      previousLODLevel !== null
        ? createHumanLayerForYear(
            year,
            previousLODLevel,
            currentOpacity * previousLODOpacity,
            `human-layer-previous-lod-${colorScheme}`,
            false,
          )
        : null,
    [
      createHumanLayerForYear,
      year,
      previousLODLevel,
      currentOpacity,
      previousLODOpacity,
      colorScheme,
    ],
  );

  const layers: LayersList = [
    ...((previousYearLayer ? [previousYearLayer] : []) as LayersList),
    ...((previousLODLayer ? [previousLODLayer] : []) as LayersList),
    currentYearLayer,
  ];

  return { layers, stableLODLevel } as const;
}

