'use client';

import { useState, useMemo, useEffect, memo, useCallback, useRef } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import { getLODLevel } from '@/lib/lod';
import { createHumanTilesLayer, createStaticTerrainLayer, radiusStrategies } from '@/components/footsteps/layers/layers';
import { type Layer, type LayersList } from '@deck.gl/core';
import HumanDotsOverlay from '@/components/footsteps/overlays/HumanDotsOverlay';
import LegendOverlay from '@/components/footsteps/overlays/LegendOverlay';
import PopulationTooltip from '@/components/footsteps/overlays/PopulationTooltip';
import GlobeView3D from '@/components/footsteps/views/GlobeView3D';
import MapView2D from '@/components/footsteps/views/MapView2D';
import useGlobeViewState from '@/components/footsteps/hooks/useGlobeViewState';


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
  
  // Toggle between per-LOD tiles and single-layer yearly tiles
  const [useSingleLayer, setUseSingleLayer] = useState(false);
  
  // Save view mode preference to cookie
  useEffect(() => {
    setViewMode(is3DMode);
  }, [is3DMode]);
  
  

  // Removed complex viewport bounds system - tiles handle spatial filtering efficiently

  // Simplified loading state tracking
  const [tileLoading, setTileLoading] = useState<boolean>(true);
  const [featureCount, setFeatureCount] = useState<number>(0);
  const [totalPopulation, setTotalPopulation] = useState<number>(0);

  // Simple layer instance ID to prevent deck.gl layer ID collisions
  const layerInstanceIdRef = useRef<string>(`human-layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Removed hardcoded basemap - rely on satellite terrain layer for land/water visualization

  // Static terrain layer
  const terrainLayer = useMemo(() => {
    return createStaticTerrainLayer();
  }, []);
  
  
  // Stable LOD level for memoization - only changes at discrete boundaries
  const roundedZoom = Math.floor(viewState.zoom);
  const stableLODLevel = useMemo(() => {
    return getLODLevel(roundedZoom);
  }, [roundedZoom]);
  
  // Simplified: use viewState directly since LOD system provides stability
  const layerViewState = viewState;
  
  // Reset loading state when parameters change
  useEffect(() => {
    // Generate new instance ID to prevent layer reuse
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    layerInstanceIdRef.current = `human-layer-${timestamp}-${randomSuffix}`;

    // Reset simple loading state
    setTileLoading(true);
    setFeatureCount(0);
    setTotalPopulation(0);
  }, [year, stableLODLevel, is3DMode, useSingleLayer]);
  
  
  // Feature extraction helper (quiet in production)
  const featuresFromTile = (tile: any): Array<{ properties?: { population?: number } }> => {
    try {
      const tileCoords = tile?.index ? `${tile.index.z}/${tile.index.x}/${tile.index.y}` : 'unknown';
      
      // Try multiple possible locations for features in tile structure
      const possibleFeatures = [
        tile?.data?.features,
        tile?.content?.features,
        tile?.data,
        tile?.content,
        // MVT tiles may have layered structure
        tile?.data?.layers?.[`humans_lod_0`]?.features,
        tile?.content?.layers?.[`humans_lod_0`]?.features,
        // Check if it's directly an array
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
  };

  // Shared tooltip handler to eliminate duplication
  const handleTooltipInteraction = useCallback((raw: unknown, clearOnEmpty = false) => {
    if (raw && typeof raw === 'object' && 'object' in (raw as Record<string, unknown>)) {
      const info = raw as PickingInfo;
      if (info.object) {
        const f = info.object;
        const population = f.properties?.population || 0;
        const coordinates = (f.geometry?.coordinates as [number, number]) || [0, 0];
        const clickPosition = { x: info.x || 0, y: info.y || 0 };
        setTooltipData({ population, coordinates, year, clickPosition });
        return;
      }
    }
    if (clearOnEmpty) setTooltipData(null);
  }, [year]);

  const createHumanLayer = useCallback((lodLevel: number) => {
    const radiusStrategy = is3DMode ? radiusStrategies.globe3D : radiusStrategies.zoomAdaptive;
     
    return createHumanTilesLayer(
      year,
      lodLevel,
      layerViewState,
      radiusStrategy,
      // onClick
      (raw: unknown) => handleTooltipInteraction(raw),
      // onHover
      (raw: unknown) => handleTooltipInteraction(raw, true),
      // comprehensive tile loading callbacks with error logging
      {
        onTileLoad: (_tile: unknown) => {
          setTileLoading(false);
        },
        onViewportLoad: (rawTiles: unknown[]) => {
          try {
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
          } catch (error) {
            console.error(`[VIEWPORT-LOAD-ERROR] Year: ${year}, LOD: ${lodLevel}:`, error);
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
            year,
            lodLevel,
            coords: `${tileCoords.z}/${tileCoords.x}/${tileCoords.y}`,
            url,
            status,
            error: errorInfo?.message || errorInfo?.error || errorInfo
          });
          
          // Continue loading other tiles
          setTileLoading(false);
        }
      },
      1.0, // always use full opacity
      layerInstanceIdRef.current,
      // Disable depth test in 2D so dots render on top of terrain
      is3DMode,
      // Single-layer tiling mode switch
      useSingleLayer
    );
  }, [layerViewState, year, is3DMode, handleTooltipInteraction, useSingleLayer]);
  
  // Create human tiles layer (createHumanLayer is already memoized)
  const humanTilesLayer = createHumanLayer(stableLODLevel);
  
  // Layer ordering: terrain -> settlement points
  const layers: LayersList = [terrainLayer, humanTilesLayer] as LayersList;
  
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
        lodEnabled={!useSingleLayer}
        toggleLOD={() => setUseSingleLayer(v => !v)}
        renderMetrics={{loadTime: 0, processTime: 0, renderTime: 0, lastUpdate: 0}}
        cacheSize={1}
        progressiveRenderStatus={undefined}
        viewportBounds={null}
        is3DMode={is3DMode}
      />

      {/* Mode toggle: LOD vs Single-layer */}
      <div
        className="absolute"
        style={{ top: '11rem', left: '2rem', zIndex: 31 }}
      >
        <button
          onClick={() => setUseSingleLayer(v => !v)}
          className="px-3 py-1 text-xs rounded-md bg-gray-700/60 text-gray-200 hover:bg-gray-600/70 border border-gray-600/60"
          title="Toggle between per-LOD tiles and single-layer tiles"
        >
          Mode: {useSingleLayer ? 'Single-layer' : 'LOD layers'}
        </button>
      </div>
      
      {/* View Mode Toggle */}
      <div className="absolute top-4 right-4 z-10">
        {/* Pill toggle */}
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
