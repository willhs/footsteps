'use client';

import { useState, useEffect, useRef, memo } from 'react';
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
import { evidenceAt, nearestDataYear, populationAt } from '@/lib/time';
import useGridLayer from '@/components/footsteps/hooks/useGridLayer';
import usePresenceLayers from '@/components/footsteps/hooks/usePresenceLayers';
import GroundingPanel from './overlays/GroundingPanel';
import { groundingFacts } from './layers/grounding';
import { MODEL_NOTES_URL, nearestDotTileYear } from '@/lib/constants';
import { PEOPLE_MODES, type PeopleMode } from './hooks/peopleView';
import { UnitKind } from './layers/units';
import { cssRgb, LOOKS, WayOfLife, type WayOfLifeValue } from '@/lib/waysOfLife';
import HoverCard from './overlays/HoverCard';
import useEvidenceLayer from './hooks/useEvidenceLayer';
import EvidenceTooltip from './overlays/EvidenceTooltip';
import useHoverPoint, { type Unproject } from './hooks/useHoverPoint';

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
// The hover card (habitat, climate, animals and people under the cursor) is on by default;
// ?hover=0 turns it off.
function hoverParam(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('hover') !== '0';
}
// ?evidence=1 draws dated archaeological sites as cool marks (experiment). Off by default.
function evidenceParam(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('evidence') === '1';
}
const LEGEND: WayOfLifeValue[] = [WayOfLife.Forager, WayOfLife.Farmer, WayOfLife.Herder, WayOfLife.Urban];
// The model has no land use: everyone before HYDE is drawn as a forager.
const MODELLED_LEGEND: WayOfLifeValue[] = [WayOfLife.Forager];
const UNIT_KIND_LABEL: Record<number, string> = {
  [UnitKind.Band]: 'A forager band',
  [UnitKind.Village]: 'A farming village',
  [UnitKind.Camp]: 'A herding camp',
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

  const [hoverCard] = useState(hoverParam);
  const unprojectRef = useRef<Unproject | null>(null);
  const { point: hoverPoint, bind: hoverBind } = useHoverPoint({
    enabled: hoverCard,
    suspended: isZooming || isPanning,
    unprojectRef,
  });

  // Read after mount so the server-rendered HTML (no query string) matches the first client render.
  const [evidenceOn, setEvidenceOn] = useState(false);
  useEffect(() => setEvidenceOn(evidenceParam()), []);
  const evidence = useEvidenceLayer({ enabled: evidenceOn, time, zoom: viewState.zoom });

  const [selectedPlace, setSelectedPlace] = useState<[number, number] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ kind: number; people: number } | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const { layers: gridLayers, grid, blend, loading } = useGridLayer({
    year,
    time,
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
    time,
    view: viewState,
    far: blend.glow,
  });

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

  // From 10,000 BCE people are HYDE's (measured); before that they are the model's.
  const modelled = evidenceAt(Math.round(time)) === 'modelled';
  const layers: LayersList = [
    ...backgroundLayers,
    ...(renderMode === 'dots' ? (modelled ? [] : humanLayers) : [...gridLayers, ...presenceLayers]),
    ...evidence.layers,
  ] as LayersList;

  return (
    <div className="relative w-full h-full">
      <DeckGLView
        mode={is3DMode ? '3d' : '2d'}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        layers={layers}
        containerProps={hoverCard ? hoverBind : undefined}
        unprojectRef={hoverCard ? unprojectRef : undefined}
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

      {evidenceOn && <EvidenceTooltip hover={evidence.hover} doc={evidence.doc} />}
      {hoverCard && <HoverCard point={hoverPoint} time={time} year={year} grid={grid} />}

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
        {peopleView && selectedPlace && (
          <GroundingPanel
            facts={grid ? groundingFacts(grid, year, ...selectedPlace) : null}
            place={{ lat: selectedPlace[1], lon: selectedPlace[0], year: Math.round(time) }}
            modelled={modelled}
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
              // 'Imagine their day' works in every era; before HYDE the day API labels it more strongly.
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
        {peopleView && !selectedPlace ? (
          <div className="ov-panel shrink-0 px-3.5 py-3">
            <ul className="ov-body flex flex-wrap gap-x-4 gap-y-1">
              {(modelled ? MODELLED_LEGEND : LEGEND).map((way) => (
                <li key={way}>
                  <span className="mr-1.5" style={{ color: cssRgb(way) }}>●</span>
                  {LOOKS[way].name}
                  {!showGlowLegend && way !== WayOfLife.Urban && (
                    <span className="text-[var(--ov-text-3)]"> · {LOOKS[way].mark}</span>
                  )}
                </li>
              ))}
              {!showGlowLegend && blend.pickable && (
                <li className="text-[var(--ov-text-3)]">Click a mark to name it</li>
              )}
            </ul>
            {modelled ? (
              <p className="ov-note mt-1.5">
                <strong className="font-semibold text-[var(--ov-amber)]">Modelled, not measured.</strong>{' '}
                Where foragers would live if density followed plant productivity,
                scaled to a published world total; no one has seen these people.
                The model has no land use, so all are drawn as foragers. Where
                bands sit is illustrative.{' '}
                <a href={MODEL_NOTES_URL} target="_blank" rel="noreferrer" className="pointer-events-auto underline">
                  How it was made
                </a>
              </p>
            ) : (
              <p className="ov-note mt-1.5">
                Head counts per ~10 km cell are HYDE estimates. Way of life is read
                from HYDE cropland and grazing in the cell, not known for any one
                group, and where its bands, villages and camps sit inside the cell
                is illustrative.
              </p>
            )}
            {evidenceOn && (
              <p className="ov-note mt-1.5">
                <span style={{ color: '#78a0ff' }}>●</span> Dated sites (radiocarbon, p3k14c): where people definitely were.
                Few sites means few excavations, not few people.
              </p>
            )}
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

/** One-line source note for the terrain images. */
function TerrainNote() {
  return (
    <span className="ov-note mt-1.5 block">
      Land, sea and ice reconstructed from climate and ice models (Krapp et al. 2021),
      coloured from NASA Blue Marble; the green Sahara is drawn from the literature.
      Faint line: today&apos;s coast.
      Relief: <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Mapzen / AWS Terrain Tiles</a> (modern elevation, including seabed).
      Fine surface grain is illustrative.
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
