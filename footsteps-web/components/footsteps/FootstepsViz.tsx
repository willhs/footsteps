'use client';

import { useState, useEffect, memo } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import type { LayersList } from '@deck.gl/core';
import SupportingText from '@/components/footsteps/overlays/SupportingText';
import DeckGLView from '@/components/footsteps/views/DeckGLView';
import useGlobeViewState from '@/components/footsteps/hooks/useGlobeViewState';
import VizToggles from '@/components/ui/VizToggles';
import ControlRow from '@/components/ui/ControlRow';
import type { ColorScheme } from '@/components/footsteps/layers/color';
import TooltipOverlay, { useTooltipOverlay } from '@/components/footsteps/overlays/TooltipOverlay';
import useBackgroundLayers from '@/components/footsteps/hooks/useBackgroundLayers';
import useHumanLayers from '@/components/footsteps/hooks/useHumanLayers';
import { describePerson, type Person } from '@/components/footsteps/layers/people';
import { hasPeopleData, nearestDataYear, populationAt } from '@/lib/time';
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

  const { layers: presenceLayers, animating: presenceAnimating, waiting: presenceWaiting } = usePresenceLayers({
    enabled: renderMode === 'auto',
    presence,
    time,
    view: viewState,
    far: blend.glow,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (presence.lights === 'classic') url.searchParams.set('lights', 'classic');
    else url.searchParams.delete('lights');
    window.history.replaceState(null, '', url);
  }, [presence]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (renderMode !== DEFAULT_RENDER_MODE) url.searchParams.set('mode', renderMode);
    else url.searchParams.delete('mode');
    window.history.replaceState(null, '', url);
  }, [renderMode]);

  const waitingOn = loading ?? presenceWaiting;
  const loadingKey = waitingOn ? waitingOn.join() : '';
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

  // HYDE starts at 10,000 BCE; before that the map shows Earth only.
  const peopleOn = hasPeopleData(time);
  const layers: LayersList = [
    ...backgroundLayers,
    ...(!peopleOn ? [] : renderMode === 'dots' ? humanLayers : [...gridLayers, ...presenceLayers]),
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
          if (!peopleView || !peopleOn || !info.coordinate) return;
          const [lon, lat] = info.coordinate;
          const person = info.layer?.id === 'people' ? (info.object as Person | undefined) : undefined;
          setSelectedPerson(person ?? null);
          const group = info.object as { kind: number; people: number } | undefined;
          setSelectedGroup(!person && group && typeof group.kind === 'number' ? group : null);
          if (Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lat) <= 90) setSelectedPlace([lon, lat]);
        }}
      />

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

      {/* Bottom-left stack: details panel above the legend, both above the timeline. */}
      <div
        className="pointer-events-none absolute z-20 flex flex-col justify-end gap-2 sm:w-[360px]"
        style={{
          left: 'var(--ov-left)',
          right: 'var(--ov-right)',
          bottom: 'calc(var(--ov-timeline-h) + 8px)',
          // stay clear of the year/population panel at the top
          top: 'calc(var(--ov-top) + 150px)',
        }}
      >
        {peopleView && peopleOn && selectedPlace && (
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

        {/* Legend: hidden while the details panel is open, which needs the height. */}
        {!peopleOn ? (
          <div className="ov-panel shrink-0 px-3.5 py-3">
            <p className="ov-body">
              No population data before 10,000 BCE, where HYDE starts. People were
              here, but nobody has mapped how many or where, so the map shows Earth only.
            </p>
            {showTerrain && <TerrainNote />}
          </div>
        ) : peopleView && !selectedPlace ? (
          <div className="ov-panel shrink-0 px-3.5 py-3">
            {showGlowLegend ? (
              <p className="ov-body">
                Brightness is people per ~10 km cell:{' '}
                <span className="text-[#ffbe6e]">sparse</span>,{' '}
                <span className="text-[#ffe1a0]">farming</span>,{' '}
                <span className="text-cyan-300">towns and cities</span>. Zoom in to
                see bands and villages.
              </p>
            ) : (
              <ul className="ov-body flex flex-wrap gap-x-4 gap-y-1">
                <li><span className="mr-1.5 text-[#ffbe6e]">●</span>band (~30 people)</li>
                <li><span className="mr-1.5 text-[#ffe1a0]">●</span>village (~300)</li>
                <li><span className="mr-1.5 text-cyan-300">●</span>town/city density</li>
                {blend.pickable && <li className="text-[var(--ov-text-3)]">Click a mark to name it</li>}
              </ul>
            )}
            <p className="ov-note mt-1.5">
              Head counts per ~10 km cell are HYDE estimates. Where bands and villages
              sit inside a cell is illustrative, not known.
            </p>
            {showTerrain && <TerrainNote />}
          </div>
        ) : (
          !peopleView && showTerrain && (
            <div className="ov-panel shrink-0 px-3.5 py-3">
              <TerrainNote />
            </div>
          )
        )}
      </div>

      {/* Map controls */}
      <div className="absolute z-30" style={{ top: 'var(--ov-top)', right: 'var(--ov-right)' }}>
        <VizToggles
          is3DMode={is3DMode}
          onModeChange={setIs3DMode}
          showTerrain={showTerrain}
          onToggle={setShowTerrain}
          colorScheme={colorScheme}
          onColorSchemeChange={setColorScheme}
          showColorScheme={renderMode === 'dots'}
        >
          {renderMode === 'auto' && (
            <ControlRow label="Lights">
              <PresencePicker presence={presence} onChange={setPresence} />
            </ControlRow>
          )}
          {/* Debug only (?mode=): compare the zoom-chosen view with fixed ones */}
          {debugModes && (
            <ControlRow label="Mode (debug)">
              <button
                type="button"
                onClick={() =>
                  setRenderMode((m) => PEOPLE_MODES[(PEOPLE_MODES.indexOf(m) + 1) % PEOPLE_MODES.length])
                }
                className="ov-seg-btn border border-[var(--ov-border)]"
                title="Auto: look chosen by zoom. Units: bands, villages and city glow at every zoom. Grid: one dot per HYDE cell. Dots: pre-built dot tiles."
              >
                {RENDER_MODE_LABEL[renderMode]}
              </button>
            </ControlRow>
          )}
        </VizToggles>
      </div>
    </div>
  );
}

/** Prototype: compare ways of showing people (lights style). */
function PresencePicker({ presence, onChange }: { presence: Presence; onChange: (p: Presence) => void }) {
  return (
    <div role="group" aria-label="How people are shown" className="ov-seg">
      <button type="button" aria-pressed={presence.lights === 'fire'} className="ov-seg-btn"
        title="Firelight: flickering hearths and settlements"
        onClick={() => onChange({ ...presence, lights: 'fire' })}>Firelight</button>
      <button type="button" aria-pressed={presence.lights === 'classic'} className="ov-seg-btn"
        title="Classic glow: smooth density glow"
        onClick={() => onChange({ ...presence, lights: 'classic' })}>Classic</button>
    </div>
  );
}

/** One-line source note for the terrain images. */
function TerrainNote() {
  return (
    <span className="ov-note mt-1.5 block">
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
