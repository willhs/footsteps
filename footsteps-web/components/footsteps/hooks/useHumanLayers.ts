'use client';
import { getLODLevel } from '@/lib/lod';
import type { ColorScheme } from '@/components/footsteps/layers/color';
import type { LayersList } from '@deck.gl/core';
import { useEffect, useRef, useState } from 'react';
import type { TooltipData } from '@/components/footsteps/overlays/TooltipOverlay';

// PMTiles, the MVT loader and the tile-metrics worker are only needed for Dots
// mode, so they load on first use instead of weighing down the default view.
type HumanLayerFactory =
  typeof import('@/components/footsteps/layers/humanLayer').createHumanLayerFactory;

interface UseHumanLayersProps {
  enabled: boolean;
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
  enabled,
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
  const [createFactory, setCreateFactory] = useState<{
    create: HumanLayerFactory;
  } | null>(null);
  useEffect(() => {
    if (!enabled || createFactory) return;
    let live = true;
    import('@/components/footsteps/layers/humanLayer')
      .then((module) => {
        if (live) setCreateFactory({ create: module.createHumanLayerFactory });
      })
      .catch((error) => console.warn('[dots] failed to load', error));
    return () => {
      live = false;
    };
  }, [enabled, createFactory]);

  const roundedZoom = Math.floor(viewState.zoom);
  const stableLODLevel = getLODLevel(roundedZoom);

  const layerViewState = viewState;

  if (!enabled || !createFactory) return { layers: [], stableLODLevel } as const;

  const createHumanLayerForYear = createFactory.create({
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
