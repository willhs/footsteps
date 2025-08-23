'use client';

import { useState, useMemo, useEffect, memo } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import { getLODLevel } from '@/lib/lod';
import {
  SEA_LAYER,
  CONTINENTS_LAYER,
  TERRAIN_LAYER,
} from '@/components/footsteps/layers';
import { createHumanLayerFactory } from '@/components/footsteps/layers';
import { type LayersList } from '@deck.gl/core';
import SupportingText from '@/components/footsteps/overlays/SupportingText';
import PopulationTooltip from '@/components/footsteps/overlays/PopulationTooltip';
import DeckGLView from '@/components/footsteps/views/DeckGLView';
import useGlobeViewState from '@/components/footsteps/hooks/useGlobeViewState';
import useYearCrossfade from '@/components/footsteps/hooks/useYearCrossfade';
import VizToggles from '@/components/ui/VizToggles';
import { type ColorScheme } from '@/components/footsteps/layers/color';

interface FootstepsVizProps {
  year: number;
}

function FootstepsViz({ year }: FootstepsVizProps) {
  const [is3DMode, setIs3DMode] = useState(() => getViewMode());

  const [showTerrain, setShowTerrain] = useState(false);
  const [colorScheme, setColorScheme] = useState<ColorScheme>('white');

  const { viewState, onViewStateChange, isZooming, isPanning } =
    useGlobeViewState();

  const [tooltipData, setTooltipData] = useState<{
    population: number;
    coordinates: [number, number];
    year: number;
    settlementType?: string;
    clickPosition: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    setViewMode(is3DMode);
  }, [is3DMode]);

  const [tileLoading, setTileLoading] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [featureCount, setFeatureCount] = useState<number>(0);
  const [totalPopulation, setTotalPopulation] = useState<number>(0);
  const [yearChangedAt, setYearChangedAt] = useState<number>(() => Date.now());

  const { previousYear, currentOpacity, previousOpacity, newLayerHasTileRef } =
    useYearCrossfade(year);

  // Reset metrics when year changes
  useEffect(() => {
    setTileLoading(true);
    setMetricsLoading(true);
    setFeatureCount(0);
    setYearChangedAt(Date.now());
  }, [year]);

  // Background layers - terrain or plain based on toggle
  const backgroundLayers = useMemo(() => {
    return showTerrain ? [TERRAIN_LAYER] : [SEA_LAYER, CONTINENTS_LAYER];
  }, [showTerrain]);

  // Stable LOD level for memoization - only changes at discrete boundaries
  const roundedZoom = Math.floor(viewState.zoom);
  const stableLODLevel = useMemo(() => {
    return getLODLevel(roundedZoom);
  }, [roundedZoom]);

  // Simplified: use viewState directly since LOD system provides stability
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
      setFeatureCount,
      setTotalPopulation,
      setTooltipData,
      colorScheme,
    ],
  );

  // Create human tiles layer for current year
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
    [createHumanLayerForYear, previousYear, stableLODLevel, previousOpacity, colorScheme],
  );

  // Layer ordering: background layers -> settlement points
  const layers: LayersList = previousYearLayer
    ? ([...backgroundLayers, previousYearLayer, currentYearLayer] as LayersList)
    : ([...backgroundLayers, currentYearLayer] as LayersList);

  if (process.env.NODE_ENV !== 'production') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const logLayer = (layer: any, tag: string, tagYear: number | null) => {
        const props = layer?.props || {};
        const transitions = props?.transitions || {};
        const opacityTransition = transitions?.opacity || {};
        // eslint-disable-next-line no-console
        console.log('[LAYER-VIS]', {
          tag,
          year: tagYear,
          id: props?.id ?? layer?.id,
          opacity: props?.opacity,
          visible: props?.visible,
          pickable: props?.pickable,
          fadeMs: opacityTransition?.duration,
          is3DMode,
        });
      };
      logLayer(currentYearLayer, 'current', year);
      if (previousYearLayer && previousYear !== null)
        logLayer(previousYearLayer, 'previous', previousYear);
    } catch {
      // ignore logging errors in dev
    }
  }

  return (
    <div className="relative w-full h-full">
      <DeckGLView
        mode={is3DMode ? '3d' : '2d'}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        layers={layers}
      />

      {/* Data info overlay */}
      <SupportingText
        loading={
          metricsLoading ||
          (Date.now() - yearChangedAt < 1000 && totalPopulation === 0)
        }
        dotCount={featureCount}
        totalPopulation={totalPopulation}
        viewState={viewState}
        lodLevel={stableLODLevel}
        lodEnabled={false}
        toggleLOD={() => {}}
        renderMetrics={{
          loadTime: 0,
          processTime: 0,
          renderTime: 0,
          lastUpdate: 0,
        }}
        cacheSize={1}
        progressiveRenderStatus={undefined}
        viewportBounds={null}
        is3DMode={is3DMode}
        year={year}
      />

      {/* View Mode + Terrain toggles */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <VizToggles
          is3DMode={is3DMode}
          onModeChange={setIs3DMode}
          showTerrain={showTerrain}
          onToggle={setShowTerrain}
          colorScheme={colorScheme}
          onColorSchemeChange={setColorScheme}
        />
      </div>

      {/* Population Tooltip */}
      <PopulationTooltip
        data={tooltipData}
        onClose={() => setTooltipData(null)}
      />
    </div>
  );
}

export default memo(FootstepsViz);
