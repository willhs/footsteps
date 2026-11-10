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
import { describePerson, type Person } from '@/components/footsteps/layers/people';
import { nearestDataYear, populationAt } from '@/lib/time';
import useGridLayer from '@/components/footsteps/hooks/useGridLayer';
import usePresenceLayers, { presenceFromUrl, type Presence } from '@/components/footsteps/hooks/usePresenceLayers';
import GroundingPanel from './overlays/GroundingPanel';
import { groundingFacts } from './layers/grounding';
import { nearestDotTileYear } from '@/lib/constants';
import { PEOPLE_MODES, type PeopleMode } from './hooks/peopleView';
import { UnitKind } from './layers/units';

// The look follows zoom ('auto'). ?mode=units|grid|dots is a debug override
// and also reveals the mode button.
const RENDER_MODE_LABEL: Record<PeopleMode, string> = { auto: 'Auto', dots: 'Dots', grid: 'Grid', units: 'Units' };
const DEFAULT_RENDER_MODE: PeopleMode = 'auto';
function modeParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('mode');
}
function initialRenderMode(): PeopleMode {
  const m = modeParam();
  return PEOPLE_MODES.includes(m as PeopleMode) ? (m as PeopleMode) : DEFAULT_RENDER_MODE;
}
const UNIT_KIND_LABEL: Record<number, string> = {
  [UnitKind.Band]: 'A band',
  [UnitKind.Village]: 'A village',
  [UnitKind.Glow]: 'A town or city',
};

interface FootstepsVizProps {
  /** Continuous year; data years are points along it. */
  time: number;
  /** Reports the data years still loading for the current view (null = ready). */
  onLoadingChange?: (loading: [number, number] | null) => void;
}

const DEFAULT_COLOURSCHEME = 'cyan';

function FootstepsVizInner({ time, onLoadingChange }: FootstepsVizProps) {
  // Views that can only show whole data years use the nearest one; the glow
  // mixes the two data years either side of `time`.
  const year = nearestDataYear(time);
  const setTooltipData = useTooltipOverlay();

  const [is3DMode, setIs3DMode] = useState(() => getViewMode());
  const [colorScheme, setColorScheme] = useState<ColorScheme>(DEFAULT_COLOURSCHEME);

  const [renderMode, setRenderMode] = useState<PeopleMode>(initialRenderMode);
  const [debugModes] = useState(() => modeParam() !== null);

  const { viewState, onViewStateChange, isZooming, isPanning } =
    useGlobeViewState();

  const [, setTileLoading] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [featureCount, setFeatureCount] = useState<number>(0);
  const [totalPopulation, setTotalPopulation] = useState<number>(0);
  const [yearChangedAt, setYearChangedAt] = useState<number>(() => Date.now());

  const { backgroundLayers, showTerrain, setShowTerrain } = useBackgroundLayers(time);

  const { layers: humanLayers, stableLODLevel } = useHumanLayers({
    enabled: renderMode === 'dots',
    year: nearestDotTileYear(year),
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

  const [selectedPlace, setSelectedPlace] = useState<[number, number] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ kind: number; people: number } | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [presence, setPresence] = useState<Presence>(presenceFromUrl);
  const { layers: gridLayers, grid, blend, loading } = useGridLayer({
    year,
    time,
    onTerrain: showTerrain,
    glowHidden: presence.lights === 'fire',
    enabled: renderMode !== 'dots',
    mode: renderMode === 'dots' ? 'auto' : renderMode,
    view: viewState,
    size:
      typeof window === 'undefined'
        ? undefined
        : { width: window.innerWidth, height: window.innerHeight },
    globe: is3DMode,
    setFeatureCount,
    setTotalPopulation,
    setMetricsLoading,
  });

  const viewSize =
    typeof window === 'undefined' ? { width: 1440, height: 900 } : { width: window.innerWidth, height: window.innerHeight };
  const { layers: presenceLayers, animating: presenceAnimating } = usePresenceLayers({
    enabled: renderMode === 'auto',
    presence,
    time,
    view: viewState,
    size: viewSize,
    far: blend.glow,
    people: blend.people,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (presence.lights === 'classic') url.searchParams.set('lights', 'classic');
    else url.searchParams.delete('lights');
    if (!presence.steps) url.searchParams.set('steps', '0');
    else url.searchParams.delete('steps');
    window.history.replaceState(null, '', url);
  }, [presence]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (renderMode !== DEFAULT_RENDER_MODE) url.searchParams.set('mode', renderMode);
    else url.searchParams.delete('mode');
    window.history.replaceState(null, '', url);
  }, [renderMode]);

  const loadingKey = loading ? loading.join() : '';
  useEffect(() => {
    onLoadingChange?.(loadingKey ? (loadingKey.split(',').map(Number) as [number, number]) : null);
  }, [loadingKey, onLoadingChange]);

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

  const peopleView = renderMode === 'auto' || renderMode === 'units';
  const showGlowLegend = renderMode === 'auto' && blend.units < 0.5;

  const layers: LayersList = [
    ...backgroundLayers,
    ...(renderMode === 'dots' ? humanLayers : [...gridLayers, ...presenceLayers]),
  ] as LayersList;

  return (
    <div className="relative w-full h-full">
      <DeckGLView
        mode={is3DMode ? '3d' : '2d'}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        layers={layers}
        // Night lights flicker and bands/villages move on the GPU; redraw
        // continuously only while either is on screen.
        animate={renderMode !== 'dots' && (showTerrain || blend.units > 0 || presenceAnimating)}
        onClick={(info) => {
          if (!peopleView || !info.coordinate) return;
          const [lon, lat] = info.coordinate;
          const person = info.layer?.id === 'people' ? (info.object as Person | undefined) : undefined;
          setSelectedPerson(person ?? null);
          const group = info.object as { kind: number; people: number } | undefined;
          setSelectedGroup(!person && group && typeof group.kind === 'number' ? group : null);
          if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90) setSelectedPlace([lon, lat]);
        }}
      />

      {peopleView && selectedPlace && (
        <GroundingPanel
          facts={grid ? groundingFacts(grid, year, ...selectedPlace) : null}
          group={
            selectedGroup && {
              label: UNIT_KIND_LABEL[selectedGroup.kind] ?? 'A group',
              people: selectedGroup.people,
              placed: selectedGroup.kind !== UnitKind.Glow,
            }
          }
          person={selectedPerson ? describePerson(selectedPerson) : null}
          portrait={
            selectedPerson
              ? { person: selectedPerson, year: Math.round(time), lat: selectedPerson.position[1] }
              : null
          }
          day={
            selectedPerson && selectedPlace && grid
              ? (() => {
                  const facts = groundingFacts(grid, year, ...selectedPlace);
                  return {
                    year: Math.round(time),
                    lat: selectedPerson.position[1],
                    lon: selectedPerson.position[0],
                    cellPeople: facts?.people ?? 0,
                    neighbourhoodPeople: facts?.neighbourhoodPeople ?? 0,
                    densityClass: facts?.densityClass ?? 'unknown',
                    confidence: facts?.confidence ?? '',
                    person: {
                      age: selectedPerson.age,
                      female: selectedPerson.female,
                      role: selectedPerson.role,
                      groupKind: selectedPerson.groupKind,
                      groupPeople: selectedPerson.groupPeople,
                    },
                  };
                })()
              : null
          }
          onClose={() => {
            setSelectedPlace(null);
            setSelectedGroup(null);
            setSelectedPerson(null);
          }}
        />
      )}

      {/* Data info overlay */}
      <SupportingText
        loading={
          // Grid views compute the total from the time model, so never wait.
          renderMode === 'dots' &&
          (metricsLoading ||
            (Date.now() - yearChangedAt < 1000 && totalPopulation === 0))
        }
        dotCount={featureCount}
        totalPopulation={renderMode === 'dots' ? totalPopulation : populationAt(time)}
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
        cacheSize={renderMode === 'dots' ? 1 : 0}
        progressiveRenderStatus={undefined}
        viewportBounds={null}
        is3DMode={is3DMode}
        year={Math.round(time)}
      />

      {peopleView && (
        <div className="pointer-events-none absolute bottom-[92px] left-4 z-10 max-w-xs text-[11px] leading-snug text-white/60">
          {showGlowLegend ? (
            <>
              Brightness is people per ~10 km cell:{' '}
              <span className="text-[#ffbe6e]">sparse</span>,{' '}
              <span className="text-[#ffe1a0]">farming</span>,{' '}
              <span className="text-cyan-300">towns and cities</span>. Zoom in to
              see bands and villages.
            </>
          ) : (
            <>
              <span className="text-[#ffbe6e]">●</span> band (~30 people){' '}
              <span className="text-[#ffe1a0]">●</span> village (~300){' '}
              <span className="text-cyan-300">●</span> town/city density
              {blend.pickable && ' · click a mark to name it'}
            </>
          )}
          <br />
          Head counts per ~10 km cell are HYDE estimates. Where bands and villages
          sit inside a cell is illustrative, not known.
          {showTerrain && <TerrainNote />}
        </div>
      )}
      {!peopleView && showTerrain && (
        <div className="pointer-events-none absolute bottom-[92px] left-4 z-10 max-w-xs text-[11px] leading-snug text-white/60">
          <TerrainNote />
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
        {renderMode === 'auto' && <PresencePicker presence={presence} onChange={setPresence} />}
        {/* Debug only (?mode=): compare the zoom-chosen view with fixed ones */}
        {debugModes && <button
          type="button"
          onClick={() =>
            setRenderMode((m) => PEOPLE_MODES[(PEOPLE_MODES.indexOf(m) + 1) % PEOPLE_MODES.length])
          }
          className="rounded bg-black/60 px-2 py-1 text-xs text-white/80 hover:text-white"
          title="Auto: look chosen by zoom. Units: bands, villages and city glow at every zoom. Grid: one dot per HYDE cell. Dots: pre-built dot tiles."
        >
          {RENDER_MODE_LABEL[renderMode]}
        </button>}
      </div>
    </div>
  );
}

/** Prototype: compare ways of showing people (lights style, footsteps on/off). */
function PresencePicker({ presence, onChange }: { presence: Presence; onChange: (p: Presence) => void }) {
  const chip = (on: boolean) =>
    `rounded-full border px-2 py-0.5 text-[11px] ${on ? 'border-white bg-white text-black' : 'border-white/25 text-white/80 hover:text-white'}`;
  return (
    <div role="group" aria-label="How people are shown" className="flex flex-col items-end gap-1 rounded bg-black/55 p-1.5">
      <div className="flex gap-1">
        <button type="button" aria-pressed={presence.lights === 'fire'} className={chip(presence.lights === 'fire')}
          onClick={() => onChange({ ...presence, lights: 'fire' })}>Firelight</button>
        <button type="button" aria-pressed={presence.lights === 'classic'} className={chip(presence.lights === 'classic')}
          onClick={() => onChange({ ...presence, lights: 'classic' })}>Classic glow</button>
      </div>
      <button type="button" aria-pressed={presence.steps} className={chip(presence.steps)}
        onClick={() => onChange({ ...presence, steps: !presence.steps })}>Footsteps</button>
    </div>
  );
}

/** One-line source note for the terrain images. */
function TerrainNote() {
  return (
    <span className="mt-1 block text-white/50">
      Land, sea and ice reconstructed from climate and ice models (Krapp et al. 2021),
      coloured from NASA Blue Marble; the green Sahara is drawn from the literature.
      Faint line: today&apos;s coast.
    </span>
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
