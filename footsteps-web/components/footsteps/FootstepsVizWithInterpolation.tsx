'use client';

import { useState, useMemo, useEffect, memo } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import { getLODLevel } from '@/lib/lod';
import {
  createSeaLayer,
  createContinentsLayer,
  createTerrainLayer,
  InterpolationLayer,
} from '@/components/footsteps/layers';
import { createHumanLayerFactory } from '@/components/footsteps/layers';
import { type LayersList } from '@deck.gl/core';
import SupportingText from '@/components/footsteps/overlays/SupportingText';
import PopulationTooltip from '@/components/footsteps/overlays/PopulationTooltip';
import DeckGLView from '@/components/footsteps/views/DeckGLView';
import useGlobeViewState from '@/components/footsteps/hooks/useGlobeViewState';
import useYearCrossfade from '@/components/footsteps/hooks/useYearCrossfade';
import { useInterpolation } from '@/components/footsteps/hooks/useInterpolation';
import VizToggles from '@/components/ui/VizToggles';
import { type ColorScheme } from '@/components/footsteps/layers/color';
import { radiusStrategies } from '@/components/footsteps/layers/radiusStrategies';

const DEBUG = (process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true';
const ENABLE_PLAIN_BASEMAP =
  (process.env.NEXT_PUBLIC_ENABLE_PLAIN_BASEMAP || 'true') === 'true';

interface FootstepsVizWithInterpolationProps {
  year: number;
  enableInterpolation?: boolean;
  interpolationThreshold?: number;
  manualInterpolation?: {
    fromYear: number;
    toYear: number;
    t: number;
  };
}

const DEFAULT_COLOURSCHEME = 'cyan';

function FootstepsVizWithInterpolation({
  year,
  enableInterpolation = true,
  interpolationThreshold = 50, // Only interpolate for year changes > 50 years
  manualInterpolation,
}: FootstepsVizWithInterpolationProps) {
  const [is3DMode, setIs3DMode] = useState(() => getViewMode());
  const [showTerrain, setShowTerrain] = useState(() => !ENABLE_PLAIN_BASEMAP);
  const [colorScheme, setColorScheme] =
    useState<ColorScheme>(DEFAULT_COLOURSCHEME);

  const { viewState, onViewStateChange, isZooming, isPanning } =
    useGlobeViewState();

  const [tooltipData, setTooltipData] = useState<{
    population: number;
    coordinates: [number, number];
    year: number;
    settlementType?: string;
    clickPosition: { x: number; y: number };
  } | null>(null);

  // Interpolation state management
  const interpolationState = useInterpolation(year, {
    animationDurationMs: 2000,
    interpolationThreshold,
  });

  let {
    isInterpolating,
    fromYear,
    toYear,
    interpolationT,
    currentDisplayYear,
  } = interpolationState;

  if (manualInterpolation) {
    isInterpolating = true;
    fromYear = manualInterpolation.fromYear;
    toYear = manualInterpolation.toYear;
    interpolationT = manualInterpolation.t;
    currentDisplayYear = Math.round(
      manualInterpolation.fromYear +
        (manualInterpolation.toYear - manualInterpolation.fromYear) *
          manualInterpolation.t,
    );
  }

  // Use year crossfade hook for non-interpolated transitions
  const { previousYear, currentOpacity, previousOpacity, newLayerHasTileRef } =
    useYearCrossfade(enableInterpolation ? currentDisplayYear : year);

  useEffect(() => {
    setViewMode(is3DMode);
  }, [is3DMode]);

  const [tileLoading, setTileLoading] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [featureCount, setFeatureCount] = useState<number>(0);
  const [totalPopulation, setTotalPopulation] = useState<number>(0);
  const [yearChangedAt, setYearChangedAt] = useState<number>(() => Date.now());

  // Reset metrics when year changes
  useEffect(() => {
    setTileLoading(true);
    setMetricsLoading(true);
    setFeatureCount(0);
    setYearChangedAt(Date.now());
  }, [year]);

  // Background layers
  const backgroundLayers = useMemo(() => {
    if (!showTerrain) return [createSeaLayer(), createContinentsLayer()];
    return [createTerrainLayer()];
  }, [showTerrain]);

  // Stable LOD level for memoization
  const roundedZoom = Math.floor(viewState.zoom);
  const stableLODLevel = useMemo(() => {
    return getLODLevel(roundedZoom);
  }, [roundedZoom]);

  const layerViewState = viewState;

  // Create human layer factory for non-interpolated rendering
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

  // Choose rendering mode: interpolation vs traditional crossfade
  const layers: LayersList = useMemo(() => {
    const baseLayers = [...backgroundLayers];

    if (enableInterpolation && isInterpolating) {
      // Use interpolation layer during animation
      const interpolationLayer = new InterpolationLayer({
        id: `human-interpolation-${colorScheme}`,
        fromYear,
        toYear,
        t: interpolationT,
        viewState: layerViewState,
        radiusStrategy: is3DMode
          ? radiusStrategies.globe3D
          : radiusStrategies.zoomAdaptive,
        colorScheme,
        opacity: 1.0,
        onTileLoad: () => {
          setTileLoading(false);
        },
        onClick: (info: unknown) => {
          // Handle click for tooltip
          const clickInfo = info as any;
          if (clickInfo && clickInfo.object) {
            // Build tooltip data similar to humanLayer.ts
            const data = {
              population: clickInfo.object.properties?.population || 0,
              coordinates: clickInfo.object.geometry?.coordinates || [0, 0],
              year: currentDisplayYear,
              clickPosition: { x: clickInfo.x, y: clickInfo.y },
            };
            setTooltipData(data);
          }
        },
        onHover: (info: unknown) => {
          // Handle hover similar to click
          const hoverInfo = info as any;
          if (hoverInfo && hoverInfo.object) {
            const data = {
              population: hoverInfo.object.properties?.population || 0,
              coordinates: hoverInfo.object.geometry?.coordinates || [0, 0],
              year: currentDisplayYear,
              clickPosition: { x: hoverInfo.x, y: hoverInfo.y },
            };
            setTooltipData(data);
          } else {
            setTooltipData(null);
          }
        },
      });

      return [...baseLayers, interpolationLayer] as LayersList;
    } else {
      // Use traditional crossfade approach
      const currentYearLayer = createHumanLayerForYear(
        currentDisplayYear,
        stableLODLevel,
        currentOpacity,
        `human-layer-current-${colorScheme}`,
        true,
      );

      const previousYearLayer =
        previousYear !== null
          ? createHumanLayerForYear(
              previousYear as number,
              stableLODLevel,
              previousOpacity,
              `human-layer-previous-${colorScheme}`,
              false,
            )
          : null;

      return previousYearLayer
        ? ([...baseLayers, previousYearLayer, currentYearLayer] as LayersList)
        : ([...baseLayers, currentYearLayer] as LayersList);
    }
  }, [
    backgroundLayers,
    enableInterpolation,
    isInterpolating,
    fromYear,
    toYear,
    interpolationT,
    layerViewState,
    is3DMode,
    colorScheme,
    currentDisplayYear,
    createHumanLayerForYear,
    stableLODLevel,
    currentOpacity,
    previousYear,
    previousOpacity,
  ]);

  // Debug logging
  if (process.env.NODE_ENV !== 'production' && DEBUG) {
    try {
      console.log('[INTERPOLATION-VIZ]', {
        year,
        currentDisplayYear,
        isInterpolating,
        fromYear,
        toYear,
        interpolationT,
        enableInterpolation,
        layerCount: layers.length,
      });
    } catch {
      // ignore logging errors
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
        year={currentDisplayYear} // Show interpolated year
      />

      {/* View Mode + Terrain toggles */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <VizToggles
          is3DMode={is3DMode}
          onModeChange={setIs3DMode}
          showTerrain={showTerrain}
          onToggle={(v) => {
            setShowTerrain(v);
          }}
          colorScheme={colorScheme}
          onColorSchemeChange={setColorScheme}
        />

        {/* Interpolation debug info */}
        {DEBUG && enableInterpolation && (
          <div className="bg-black bg-opacity-50 text-white text-xs p-2 rounded">
            <div>Interpolating: {isInterpolating ? 'Yes' : 'No'}</div>
            {isInterpolating && (
              <>
                <div>
                  From: {fromYear} → To: {toYear}
                </div>
                <div>Progress: {Math.round(interpolationT * 100)}%</div>
                <div>Display Year: {currentDisplayYear}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Population Tooltip */}
      <PopulationTooltip
        data={tooltipData}
        onClose={() => setTooltipData(null)}
      />
    </div>
  );
}

export default memo(FootstepsVizWithInterpolation);
