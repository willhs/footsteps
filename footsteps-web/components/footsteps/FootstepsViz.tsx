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
import useGridLayer from '@/components/footsteps/hooks/useGridLayer';

type RenderMode = 'dots' | 'grid' | 'units';
const RENDER_MODES: RenderMode[] = ['dots', 'grid', 'units'];
const RENDER_MODE_LABEL: Record<RenderMode, string> = { dots: 'Dots', grid: 'Grid', units: 'Units' };
function initialRenderMode(): RenderMode {
  if (typeof window === 'undefined') return 'dots';
  const m = new URLSearchParams(window.location.search).get('mode');
  return RENDER_MODES.includes(m as RenderMode) ? (m as RenderMode) : 'dots';
}

interface FootstepsVizProps {
  year: number;
}

const DEFAULT_COLOURSCHEME = 'cyan';

function FootstepsVizInner({ year }: FootstepsVizProps) {
  const setTooltipData = useTooltipOverlay();

  const [is3DMode, setIs3DMode] = useState(() => getViewMode());
  const [colorScheme, setColorScheme] = useState<ColorScheme>(DEFAULT_COLOURSCHEME);

  const [renderMode, setRenderMode] = useState<RenderMode>(initialRenderMode);

  const { viewState, onViewStateChange, isZooming, isPanning } =
    useGlobeViewState();

  const [, setTileLoading] = useState<boolean>(true);
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

  const gridLayers = useGridLayer({
    year,
    enabled: renderMode !== 'dots',
    style: renderMode === 'units' ? 'units' : 'grid',
    zoom: viewState.zoom,
    setFeatureCount,
    setTotalPopulation,
    setMetricsLoading,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (renderMode !== 'dots') url.searchParams.set('mode', renderMode);
    else url.searchParams.delete('mode');
    window.history.replaceState(null, '', url);
  }, [renderMode]);

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

  const layers: LayersList = [
    ...backgroundLayers,
    ...(renderMode === 'dots' ? humanLayers : gridLayers),
  ] as LayersList;

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

      {renderMode === 'units' && (
        <div className="pointer-events-none absolute bottom-20 left-4 z-10 max-w-xs text-[11px] leading-snug text-white/60">
          <span className="text-[#ffbe6e]">●</span> band (~30 people){' '}
          <span className="text-[#ffe1a0]">●</span> village (~300){' '}
          <span className="text-cyan-300">●</span> town/city density
          <br />
          Head counts per ~10 km cell are HYDE estimates. Where bands and villages
          sit inside a cell is illustrative, not known.
        </div>
      )}

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
        {/* Prototype: compare pre-built dot tiles with the raw HYDE grid */}
        <button
          type="button"
          onClick={() =>
            setRenderMode((m) => RENDER_MODES[(RENDER_MODES.indexOf(m) + 1) % RENDER_MODES.length])
          }
          className="rounded bg-black/60 px-2 py-1 text-xs text-white/80 hover:text-white"
          title="Dots: pre-built dot tiles. Grid: one dot per HYDE cell. Units: bands, villages and city glow by density."
        >
          {RENDER_MODE_LABEL[renderMode]}
        </button>
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
