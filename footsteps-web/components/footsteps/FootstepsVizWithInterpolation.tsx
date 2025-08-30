'use client';

import { useState, useMemo, useEffect, memo } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import { getLODLevel } from '@/lib/lod';
import {
  createSeaLayer,
  createContinentsLayer,
  createTerrainLayer,
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
import { GPUInterpolationLayer } from '@/components/footsteps/layers';

const DEBUG = (process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true';
const ENABLE_PLAIN_BASEMAP =
  (process.env.NEXT_PUBLIC_ENABLE_PLAIN_BASEMAP || 'true') === 'true';

interface FootstepsVizWithInterpolationProps {
  year: number;
  enableInterpolation?: boolean;
  interpolationThreshold?: number;
}

const DEFAULT_COLOURSCHEME = 'cyan';

// Generate a deterministic canvas representing population density for a given year.
// In a real implementation this would fetch actual population rasters.
function createPopulationCanvas(year: number): HTMLCanvasElement {
  const width = 256;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const rng = mulberry32(year);
  const imageData = ctx.createImageData(width, height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = Math.floor(rng() * 255);
    imageData.data[i] = v;
    imageData.data[i + 1] = v;
    imageData.data[i + 2] = v;
    imageData.data[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

// Deterministic pseudo-random generator
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function FootstepsVizWithInterpolation({
  year,
  enableInterpolation = true,
  interpolationThreshold = 50, // Only interpolate for year changes > 50 years
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
  const {
    isInterpolating,
    fromYear,
    toYear,
    interpolationT,
    currentDisplayYear,
    startInterpolation,
    stopInterpolation,
  } = useInterpolation(year, {
    animationDurationMs: 2000,
    interpolationThreshold,
  });

  // Placeholder population textures derived from the bounding years
  const fromImage = useMemo(() => createPopulationCanvas(fromYear), [fromYear]);
  const toImage = useMemo(() => createPopulationCanvas(toYear), [toYear]);

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
      const gpuLayer = new GPUInterpolationLayer({
        id: `human-interpolation-${colorScheme}`,
        fromImage,
        toImage,
        progress: interpolationT,
        bounds: [-180, -90, 180, 90],
      });

      return [...baseLayers, gpuLayer] as LayersList;
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
    fromImage,
    toImage,
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
