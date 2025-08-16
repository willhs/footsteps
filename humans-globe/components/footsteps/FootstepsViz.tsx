'use client';

import { useState, useMemo, useEffect, memo, useCallback, useRef } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import { getLODLevel } from '@/lib/lod';
import { createHumanTilesLayer, createStaticTerrainLayer, createPlainBackgroundLayers, radiusStrategies } from '@/components/footsteps/layers/layers';
import { type LayersList } from '@deck.gl/core';
import HumanDotsOverlay from '@/components/footsteps/overlays/HumanDotsOverlay';
import LegendOverlay from '@/components/footsteps/overlays/LegendOverlay';
import PopulationTooltip from '@/components/footsteps/overlays/PopulationTooltip';
import GlobeView3D from '@/components/footsteps/views/GlobeView3D';
import MapView2D from '@/components/footsteps/views/MapView2D';
import useGlobeViewState from '@/components/footsteps/hooks/useGlobeViewState';
import TerrainToggle from '@/components/ui/TerrainToggle';

type PickingInfo = {
  object?: { properties?: { population?: number }; geometry?: { coordinates?: [number, number] } };
  x?: number;
  y?: number;
};

interface FootstepsVizProps {
  year: number;
}

function FootstepsViz({ year }: FootstepsVizProps) {
  // View mode toggle state with cookie persistence for SSR compatibility
  const [is3DMode, setIs3DMode] = useState(() => getViewMode());
  
  // Terrain toggle state - default to plain mode for better dot visibility
  const [showTerrain, setShowTerrain] = useState(false);
  
  // Simplified viewState management - single state for both modes
  const { viewState, onViewStateChange, isZooming, isPanning } = useGlobeViewState();
  
  // Population tooltip state
  const [tooltipData, setTooltipData] = useState<{
    population: number;
    coordinates: [number, number];
    year: number;
    settlementType?: string;
    clickPosition: { x: number; y: number };
  } | null>(null);
  
  
  // Save view mode preference to cookie
  useEffect(() => {
    setViewMode(is3DMode);
  }, [is3DMode]);
  
  

  // Removed complex viewport bounds system - tiles handle spatial filtering efficiently

  // Simplified loading state tracking
  const [tileLoading, setTileLoading] = useState<boolean>(true);
  const [featureCount, setFeatureCount] = useState<number>(0);
  const [totalPopulation, setTotalPopulation] = useState<number>(0);

  // Year crossfade state
  const [prevYear, setPrevYear] = useState<number | null>(null);
  const [isYearCrossfading, setIsYearCrossfading] = useState<boolean>(false);
  const [currentYearOpacity, setCurrentYearOpacity] = useState<number>(1);
  const [prevYearOpacity, setPrevYearOpacity] = useState<number>(0);
  const prevPropYearRef = useRef<number>(year);
  const yearFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newLayerReadyRef = useRef<boolean>(false);
  const newLayerHasTileRef = useRef<boolean>(false);
  const YEAR_FADE_MS = 300;
  const NEW_YEAR_FADE_MS = 120; // brief fade-in for perceptibility


  useEffect(() => {
    // If the year changed, set up a crossfade from the previous year to the new year.
    if (year !== prevPropYearRef.current) {
      const oldYear = prevPropYearRef.current;
      prevPropYearRef.current = year;

      // Prepare crossfade: show previous year at full opacity, new year at 0 until ready
      setPrevYear(oldYear);
      setIsYearCrossfading(true);
      setPrevYearOpacity(1);
      setCurrentYearOpacity(0);
      newLayerReadyRef.current = false;
      newLayerHasTileRef.current = false;

      // Reset loading/metrics
      setTileLoading(true);
      setFeatureCount(0);
      setTotalPopulation(0);

      // Clear any pending cleanup
      if (yearFadeTimeoutRef.current) {
        clearTimeout(yearFadeTimeoutRef.current);
        yearFadeTimeoutRef.current = null;
      }
      return;
    }

    // Initial mount or non-year updates: keep loading state consistent
    setTileLoading(true);
    setFeatureCount(0);
    setTotalPopulation(0);
  }, [year]);
  
  // Pre-render guard: if the year just changed on this render,
  // keep the previous year visible and hide the new year until tiles arrive.
  // This prevents a blank frame where the new-year layer (opacity 1) has no tiles yet
  // and the previous-year layer has not been added by the effect.
  const yearChangedThisRender = year !== prevPropYearRef.current;
  const renderPrevYear = yearChangedThisRender ? prevPropYearRef.current : prevYear;
  const renderCurrentOpacity = yearChangedThisRender ? 0 : currentYearOpacity;
  const renderPrevOpacity = yearChangedThisRender ? 1 : prevYearOpacity;

  // Background layers - terrain or plain based on toggle
  const backgroundLayers = useMemo(() => {
    return showTerrain ? [createStaticTerrainLayer()] : createPlainBackgroundLayers();
  }, [showTerrain]);
  
  
  // Stable LOD level for memoization - only changes at discrete boundaries
  const roundedZoom = Math.floor(viewState.zoom);
  const stableLODLevel = useMemo(() => {
    return getLODLevel(roundedZoom);
  }, [roundedZoom]);
  
  // Simplified: use viewState directly since LOD system provides stability
  const layerViewState = viewState;
  
  // Hoisted helper so it's available to callbacks declared below
  function featuresFromTile(tile: any): Array<{ properties?: { population?: number } }> {
    try {
      const tileCoords = tile?.index ? `${tile.index.z}/${tile.index.x}/${tile.index.y}` : 'unknown';
      void tileCoords; // quiet unused in production
      const possibleFeatures = [
        tile?.data?.features,
        tile?.content?.features,
        tile?.data,
        tile?.content,
        tile?.data?.layers?.['humans']?.features,
        tile?.content?.layers?.['humans']?.features,
        Array.isArray(tile?.data) ? tile.data : null,
        Array.isArray(tile?.content) ? tile.content : null,
      ].filter(Boolean);

      for (let i = 0; i < possibleFeatures.length; i++) {
        const candidate = possibleFeatures[i];
        if (Array.isArray(candidate) && candidate.length > 0) {
          return candidate;
        }
      }
      return [];
    } catch (error) {
      console.error(`[FEATURE-EXTRACT-ERROR]:`, error);
      return [];
    }
  }

  const createHumanLayerForYear = useCallback((targetYear: number, lodLevel: number, layerOpacity: number, instanceId: string, isNewYearLayer: boolean) => {
    const radiusStrategy = is3DMode ? radiusStrategies.globe3D : radiusStrategies.zoomAdaptive;

    // Crossfade policy:
    // - Before new tiles are ready: no transitions (avoid enter fade on prev layer)
    // - When crossfade starts: NEW fades in briefly (NEW_YEAR_FADE_MS) for visibility,
    //   PREV fades out (YEAR_FADE_MS)
    const fadeMs = newLayerReadyRef.current
      ? (isNewYearLayer ? NEW_YEAR_FADE_MS : YEAR_FADE_MS)
      : 0;

    return createHumanTilesLayer(
      targetYear,
      lodLevel,
      layerViewState,
      radiusStrategy,
      // onClick
      (raw: unknown) => {
        const info = raw as PickingInfo;
        if (info?.object) {
          const f = info.object as any;
          const population = f?.properties?.population || 0;
          const coordinates = (f?.geometry?.coordinates as [number, number]) || [0, 0];
          const clickPosition = { x: info.x || 0, y: info.y || 0 };
          setTooltipData({ population, coordinates, year: targetYear, clickPosition });
        }
      },
      // onHover
      (raw: unknown) => {
        const info = raw as PickingInfo;
        if (info?.object) {
          const f = info.object as any;
          const population = f?.properties?.population || 0;
          const coordinates = (f?.geometry?.coordinates as [number, number]) || [0, 0];
          const clickPosition = { x: info.x || 0, y: info.y || 0 };
          setTooltipData({ population, coordinates, year: targetYear, clickPosition });
        } else {
          setTooltipData(null);
        }
      },
      {
        onTileLoad: (_tile: unknown) => {
          // Only consider tile readiness/loading state from the NEW year layer.
          // Do NOT start crossfade here; wait for onViewportLoad to ensure full coverage.
          if (isNewYearLayer) {
            setTileLoading(false);
            if (!newLayerHasTileRef.current) {
              newLayerHasTileRef.current = true;
            }
          }
        },
        onViewportLoad: (rawTiles: unknown[]) => {
          try {
            // Update metrics from the new (target) year layer when it reports tiles
            if (isNewYearLayer) {
              const tiles = rawTiles as Array<unknown>;
              let count = 0;
              let pop = 0;
              for (const t of tiles) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tile = t as any;
                const feats = featuresFromTile(tile);
                count += feats.length;
                for (const g of feats) pop += Number(g?.properties?.population) || 0;
              }
              setFeatureCount(count);
              setTotalPopulation(pop);
              setTileLoading(false);

              // Start crossfade once new layer has some tiles
              if (!newLayerReadyRef.current && isYearCrossfading) {
                newLayerReadyRef.current = true;
                setCurrentYearOpacity(1);
                setPrevYearOpacity(0);
                // Remove previous layer after fade completes
                yearFadeTimeoutRef.current = setTimeout(() => {
                  setPrevYear(null);
                  setIsYearCrossfading(false);
                  yearFadeTimeoutRef.current = null;
                }, YEAR_FADE_MS + 50);
              }
            }
          } catch (error) {
            console.error(`[VIEWPORT-LOAD-ERROR] Year: ${targetYear}, LOD: ${lodLevel}:`, error);
            setTileLoading(false);
          }
        },
        onTileError: (error: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const errorInfo = error as any;
          const tileCoords = errorInfo?.tile?.index || errorInfo?.index || {};
          const url = errorInfo?.tile?.url || errorInfo?.url || 'unknown';
          const status = errorInfo?.response?.status || errorInfo?.status || 'unknown';
          console.error(`[TILE-ERROR] Failed to load tile:`, {
            year: targetYear,
            lodLevel,
            coords: `${tileCoords.z}/${tileCoords.x}/${tileCoords.y}`,
            url,
            status,
            error: errorInfo?.message || errorInfo?.error || errorInfo
          });
          setTileLoading(false);
        },
        tileOptions: {
          fadeMs: fadeMs, // drives opacity transitions per crossfade policy
          debounceTime: (isZooming || isPanning) ? 80 : 20,
          useBinary: false
        },
        // Dev-only tint to make crossfade layers visually distinct during debugging
        debugTint: (process.env.NODE_ENV !== 'production' && isYearCrossfading)
          ? (isNewYearLayer ? [0, 30, 80] : [80, 0, 0])
          : undefined
      },
      layerOpacity,
      instanceId,
      is3DMode
    );
  }, [layerViewState, is3DMode, isZooming, isPanning, isYearCrossfading]);

  // Fallback: if a tile arrived before crossfade flag turned true, start crossfade now.
  useEffect(() => {
    // Intentionally no-op: we defer crossfade until onViewportLoad confirms
    // the new year's tiles in the current viewport are loaded. This avoids
    // fading out the previous year too early and showing large missing squares.
  }, [isYearCrossfading, year]);

  // Create human tiles layers for current and (if crossfading) previous year
  const currentYearLayer = createHumanLayerForYear(year, stableLODLevel, renderCurrentOpacity, `human-layer-${year}`, true);
  const previousYearLayer = renderPrevYear !== null ? createHumanLayerForYear(renderPrevYear as number, stableLODLevel, renderPrevOpacity, `human-layer-${renderPrevYear}`, false) : null;
  
  // Layer ordering: background layers -> settlement points
  const layers: LayersList = previousYearLayer
    ? ([...backgroundLayers, previousYearLayer, currentYearLayer] as LayersList)
    : ([...backgroundLayers, currentYearLayer] as LayersList);
  
  return (
    <div className="relative w-full h-full">
      {is3DMode ? (
        <GlobeView3D
          viewState={viewState}
          onViewStateChange={onViewStateChange}
          layers={layers}
        />
      ) : (
        <MapView2D
          viewState={viewState}
          onViewStateChange={onViewStateChange}
          layers={layers}
        />
      )}
      
      {/* Data info overlay */}
      <HumanDotsOverlay
        loading={tileLoading}
        dotCount={featureCount}
        totalPopulation={totalPopulation}
        viewState={viewState}
        samplingRate={100}
        lodLevel={stableLODLevel}
        lodEnabled={false}
        toggleLOD={() => {}}
        renderMetrics={{loadTime: 0, processTime: 0, renderTime: 0, lastUpdate: 0}}
        cacheSize={1}
        progressiveRenderStatus={undefined}
        viewportBounds={null}
        is3DMode={is3DMode}
      />
      
      {/* View Mode Toggle */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {/* View Mode Toggle */}
        <div className="relative inline-flex rounded-full bg-gray-700/60 p-1 backdrop-blur-md shadow-inner ring-1 ring-gray-600/60">
          {/* Sliding highlight */}
          <span
            className={`absolute top-1 left-1 h-8 w-1/2 rounded-full bg-blue-500/80 transition-transform duration-300 ease-out ${
              is3DMode ? 'translate-x-full' : ''
            }`}
          />
          <button
            onClick={() => setIs3DMode(false)}
            className={`relative z-10 flex-1 text-center text-sm px-10 py-3 rounded-full transition-colors duration-200 ${
              !is3DMode ? 'text-white font-bold ring-2 ring-white/80' : 'text-gray-300 hover:text-white'
            }`}
            title="2D Map View"
          >
            Map
          </button>
          <button
            onClick={() => setIs3DMode(true)}
            className={`relative z-10 flex-1 text-center text-sm px-10 py-3 rounded-full transition-colors duration-200 ${
              is3DMode ? 'text-white font-bold ring-2 ring-white/80' : 'text-gray-300 hover:text-white'
            }`}
            title="3D Globe View"
          >
            Globe
          </button>
        </div>
        
        {/* Terrain Toggle */}
        <TerrainToggle 
          showTerrain={showTerrain}
          onToggle={setShowTerrain}
        />
      </div>

      {/* Legend */}
      <LegendOverlay />
      
      {/* Population Tooltip */}
      <PopulationTooltip 
        data={tooltipData}
        onClose={() => setTooltipData(null)}
      />
    </div>
  );
}

export default memo(FootstepsViz);
