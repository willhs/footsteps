'use client';

import { useState, useEffect, memo } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import type { LayersList } from '@deck.gl/core';
import SupportingText from '@/components/footsteps/overlays/SupportingText';
import DeckGLView from '@/components/footsteps/views/DeckGLView';
import useGlobeViewState from '@/components/footsteps/hooks/useGlobeViewState';
import VizToggles from '@/components/ui/VizToggles';
import type { ColorScheme } from '@/components/footsteps/layers/color';
import TooltipOverlay, { useTooltipOverlay } from '@/components/footsteps/overlays/TooltipOverlay';
import useBackgroundLayers from '@/components/footsteps/hooks/useBackgroundLayers';
import useHumanLayers from '@/components/footsteps/hooks/useHumanLayers';

const DEBUG = (process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true';

interface FootstepsVizProps {
  year: number;
}

const DEFAULT_COLOURSCHEME = 'cyan';

function FootstepsVizInner({ year }: FootstepsVizProps) {
  const setTooltipData = useTooltipOverlay();

  const [is3DMode, setIs3DMode] = useState(() => getViewMode());
  const [colorScheme, setColorScheme] = useState<ColorScheme>(DEFAULT_COLOURSCHEME);

  const { viewState, onViewStateChange, isZooming, isPanning } =
    useGlobeViewState();

  const [tileLoading, setTileLoading] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [featureCount, setFeatureCount] = useState<number>(0);
  const [totalPopulation, setTotalPopulation] = useState<number>(0);
  const [yearChangedAt, setYearChangedAt] = useState<number>(() => Date.now());

  const { backgroundLayers, showTerrain, setShowTerrain } = useBackgroundLayers();

  const { layers: humanLayers, stableLODLevel } = useHumanLayers({
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
  });

  useEffect(() => {
    setViewMode(is3DMode);
  }, [is3DMode]);

  // Reset metrics when year changes
  useEffect(() => {
    setTileLoading(true);
    setMetricsLoading(true);
    setFeatureCount(0);
    setYearChangedAt(Date.now());
  }, [year]);

  const layers: LayersList = [...backgroundLayers, ...humanLayers];

  if (process.env.NODE_ENV !== 'production' && DEBUG) {
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
      humanLayers.forEach((layer, idx) =>
        logLayer(layer, idx === humanLayers.length - 1 ? 'current' : 'previous',
          idx === humanLayers.length - 1 ? year : null),
      );
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
    </div>
  );
}

function FootstepsViz(props: FootstepsVizProps) {
  return (
    <TooltipOverlay>
      <FootstepsVizInner {...props} />
    </TooltipOverlay>
  );
}

export default memo(FootstepsViz);

