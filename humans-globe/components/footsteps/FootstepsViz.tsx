'use client';

import { useState, useMemo, useEffect, memo, useCallback } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import { getLODLevel } from '@/lib/lod';
import {
  createHumanTilesLayer,
  createStaticTerrainLayer,
  createPlainBackgroundLayers,
  radiusStrategies,
} from '@/components/footsteps/layers/layers';
import { type LayersList } from '@deck.gl/core';
import SupportingText from '@/components/footsteps/overlays/SupportingText';
import LegendOverlay from '@/components/footsteps/overlays/LegendOverlay';
import PopulationTooltip from '@/components/footsteps/overlays/PopulationTooltip';
import GlobeView3D from '@/components/footsteps/views/GlobeView3D';
import MapView2D from '@/components/footsteps/views/MapView2D';
import useGlobeViewState from '@/components/footsteps/hooks/useGlobeViewState';
import useYearCrossfade, {
  YEAR_FADE_MS,
  NEW_YEAR_FADE_MS,
} from '@/components/footsteps/hooks/useYearCrossfade';
import VizToggles from '@/components/ui/VizToggles';

type PickingInfo = {
  object?: {
    properties?: { population?: number };
    geometry?: { coordinates?: [number, number] };
  };
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
  const { viewState, onViewStateChange, isZooming, isPanning } =
    useGlobeViewState();

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

  const {
    prevYear: renderPrevYear,
    currentYearOpacity: renderCurrentOpacity,
    prevYearOpacity: renderPrevOpacity,
    isYearCrossfading,
    newLayerReadyRef,
    newLayerHasTileRef,
    startCrossfade,
  } = useYearCrossfade(year);

  // Reset metrics when year changes
  useEffect(() => {
    setTileLoading(true);
    setFeatureCount(0);
    setTotalPopulation(0);
  }, [year]);

  // Background layers - terrain or plain based on toggle
  const backgroundLayers = useMemo(() => {
    return showTerrain
      ? [createStaticTerrainLayer()]
      : createPlainBackgroundLayers();
  }, [showTerrain]);

  // Stable LOD level for memoization - only changes at discrete boundaries
  const roundedZoom = Math.floor(viewState.zoom);
  const stableLODLevel = useMemo(() => {
    return getLODLevel(roundedZoom);
  }, [roundedZoom]);

  // Simplified: use viewState directly since LOD system provides stability
  const layerViewState = viewState;

  // Hoisted helper so it's available to callbacks declared below
  function featuresFromTile(
    tile: any,
  ): Array<{ properties?: { population?: number } }> {
    try {
      const tileCoords = tile?.index
        ? `${tile.index.z}/${tile.index.x}/${tile.index.y}`
        : 'unknown';
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

  const createHumanLayerForYear = useCallback(
    (
      targetYear: number,
      lodLevel: number,
      layerOpacity: number,
      instanceId: string,
      isNewYearLayer: boolean,
    ) => {
      const radiusStrategy = is3DMode
        ? radiusStrategies.globe3D
        : radiusStrategies.zoomAdaptive;

      // Crossfade policy:
      // - Before new tiles are ready: no transitions (avoid enter fade on prev layer)
      // - When crossfade starts: NEW fades in briefly (NEW_YEAR_FADE_MS) for visibility,
      //   PREV fades out (YEAR_FADE_MS)
      const fadeMs = newLayerReadyRef.current
        ? isNewYearLayer
          ? NEW_YEAR_FADE_MS
          : YEAR_FADE_MS
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
            const coordinates = (f?.geometry?.coordinates as [
              number,
              number,
            ]) || [0, 0];
            const clickPosition = { x: info.x || 0, y: info.y || 0 };
            setTooltipData({
              population,
              coordinates,
              year: targetYear,
              clickPosition,
            });
          }
        },
        // onHover
        (raw: unknown) => {
          const info = raw as PickingInfo;
          if (info?.object) {
            const f = info.object as any;
            const population = f?.properties?.population || 0;
            const coordinates = (f?.geometry?.coordinates as [
              number,
              number,
            ]) || [0, 0];
            const clickPosition = { x: info.x || 0, y: info.y || 0 };
            setTooltipData({
              population,
              coordinates,
              year: targetYear,
              clickPosition,
            });
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
                  for (const g of feats)
                    pop += Number(g?.properties?.population) || 0;
                }
                setFeatureCount(count);
                setTotalPopulation(pop);
                setTileLoading(false);

                // Start crossfade once new layer has some tiles
                startCrossfade();
              }
            } catch (error) {
              console.error(
                `[VIEWPORT-LOAD-ERROR] Year: ${targetYear}, LOD: ${lodLevel}:`,
                error,
              );
              setTileLoading(false);
            }
          },
          onTileError: (error: unknown) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const errorInfo = error as any;
            const tileCoords = errorInfo?.tile?.index || errorInfo?.index || {};
            const url = errorInfo?.tile?.url || errorInfo?.url || 'unknown';
            const status =
              errorInfo?.response?.status || errorInfo?.status || 'unknown';
            console.error(`[TILE-ERROR] Failed to load tile:`, {
              year: targetYear,
              lodLevel,
              coords: `${tileCoords.z}/${tileCoords.x}/${tileCoords.y}`,
              url,
              status,
              error: errorInfo?.message || errorInfo?.error || errorInfo,
            });
            setTileLoading(false);
          },
          tileOptions: {
            fadeMs: fadeMs, // drives opacity transitions per crossfade policy
            debounceTime: isZooming || isPanning ? 80 : 20,
            useBinary: false,
          },
          // Dev-only tint to make crossfade layers visually distinct during debugging
          debugTint:
            process.env.NODE_ENV !== 'production' && isYearCrossfading
              ? isNewYearLayer
                ? [0, 30, 80]
                : [80, 0, 0]
              : undefined,
        },
        layerOpacity,
        instanceId,
        is3DMode,
      );
    },
    [
      layerViewState,
      is3DMode,
      isZooming,
      isPanning,
      isYearCrossfading,
      newLayerHasTileRef,
      newLayerReadyRef,
      startCrossfade,
    ],
  );

  // Create human tiles layers for current and (if crossfading) previous year
  const currentYearLayer = createHumanLayerForYear(
    year,
    stableLODLevel,
    renderCurrentOpacity,
    `human-layer-${year}`,
    true,
  );
  const previousYearLayer =
    renderPrevYear !== null
      ? createHumanLayerForYear(
          renderPrevYear as number,
          stableLODLevel,
          renderPrevOpacity,
          `human-layer-${renderPrevYear}`,
          false,
        )
      : null;

  // Layer ordering: background layers -> settlement points
  const layers: LayersList = previousYearLayer
    ? ([...backgroundLayers, previousYearLayer, currentYearLayer] as LayersList)
    : ([...backgroundLayers, currentYearLayer] as LayersList);

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
        isYearCrossfading,
        newLayerReady: newLayerReadyRef.current,
      });
    };
    logLayer(currentYearLayer, 'current', year);
    if (previousYearLayer)
      logLayer(previousYearLayer, 'previous', renderPrevYear as number);
  } catch {
    // ignore logging errors in dev
  }

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
      <SupportingText
        loading={tileLoading}
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
