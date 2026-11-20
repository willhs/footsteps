'use client';

import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import type { LayersList } from '@deck.gl/core';
import SupportingText from '@/components/footsteps/overlays/SupportingText';
import DeckGLView from '@/components/footsteps/views/DeckGLView';
import useGlobeViewState from '@/components/footsteps/hooks/useGlobeViewState';
import VizToggles from '@/components/ui/VizToggles';
import ControlRow from '@/components/ui/ControlRow';
import type { ColorScheme } from '@/components/footsteps/layers/color';
import TooltipOverlay, { useTooltipData, useTooltipOverlay } from '@/components/footsteps/overlays/TooltipOverlay';
import PopulationTooltip from './overlays/PopulationTooltip';
import useBackgroundLayers from '@/components/footsteps/hooks/useBackgroundLayers';
import useHumanLayers from '@/components/footsteps/hooks/useHumanLayers';
import { describePerson, type Person } from '@/components/footsteps/layers/people';
import { evidenceAt, nearestDataYear, populationAt } from '@/lib/time';
import { CLOSE3D_ZOOM, close3dParam, pitchForZoom } from '@/lib/close3d';
import useGridLayer from '@/components/footsteps/hooks/useGridLayer';
import usePresenceLayers from '@/components/footsteps/hooks/usePresenceLayers';
import usePersonTags from '@/components/footsteps/hooks/usePersonTags';
import GroundingPanel from './overlays/GroundingPanel';
import { groundingFacts } from './layers/grounding';
import { MODEL_NOTES_URL, nearestDotTileYear } from '@/lib/constants';
import { PEOPLE_MODES, type PeopleMode } from './hooks/peopleView';
import { UnitKind } from './layers/units';
import { cssRgb, LOOKS, WayOfLife, type WayOfLifeValue } from '@/lib/waysOfLife';
import HoverCard from './overlays/HoverCard';
import useRegionalGroup from './hooks/useRegionalGroup';
import useLargestSettlement from './hooks/useLargestSettlement';
import { regionTintLayer } from './layers/regionTint';
import useEvidenceLayer from './hooks/useEvidenceLayer';
import EvidenceTooltip from './overlays/EvidenceTooltip';
import useOtherHumansLayer, { OTHER_HUMANS_RGB } from './hooks/useOtherHumansLayer';
import OtherHumansTooltip from './overlays/OtherHumansTooltip';
import useHoverPoint, { type Unproject } from './hooks/useHoverPoint';
import useSolarClock from './hooks/useSolarClock';
import NightExtension from './layers/NightExtension';
import { sunPosition } from '@/lib/sunTime';
import type { Season } from '@/lib/seasons';
import { SettlementNote } from './SettlementNote';
import { settlementsFromParams } from '@/lib/settlements';
import ToggleButton from '@/components/ui/ToggleButton';

const NIGHT = new NightExtension();

// The look follows zoom ('auto'). ?mode=units|grid|dots is a debug override
// and also reveals the mode button.
const RENDER_MODE_LABEL: Record<PeopleMode, string> = { auto: 'Auto', dots: 'Dots', grid: 'Grid', units: 'Units' };
const DEFAULT_RENDER_MODE: PeopleMode = 'auto';
function modeParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('mode');
}
function renderModeFromUrl(): PeopleMode {
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
const NOTES_KEY = 'footsteps.legendNotes';
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
  const tooltipData = useTooltipData();

  // Everything the browser alone knows (query string, cookie) is applied after mount: the static HTML
  // and the first client render both use these defaults, or React throws hydration error #418.
  const [is3DMode, setIs3DMode] = useState(false);
  const changeViewMode = (is3D: boolean) => {
    setIs3DMode(is3D);
    setViewMode(is3D);
  };
  const [colorScheme, setColorScheme] = useState<ColorScheme>(DEFAULT_COLOURSCHEME);

  const [renderMode, setRenderMode] = useState<PeopleMode>(DEFAULT_RENDER_MODE);
  const [debugModes, setDebugModes] = useState(false);
  const [hoverCard, setHoverCard] = useState(true);
  const [settlements, setSettlements] = useState(true);
  const [seasonsEnabled, setSeasonsEnabled] = useState(false);
  const [season, setSeason] = useState<Season>('off');
  const [nightOn, setNightOn] = useState(false);
  const now = useSolarClock();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSeasonsEnabled(params.get('seasons') === '1');
    setSettlements(settlementsFromParams(params));
    setRenderMode(renderModeFromUrl());
    setDebugModes(modeParam() !== null);
    setHoverCard(hoverParam());
    setIs3DMode(getViewMode());
  }, []);

  const { viewState, onViewStateChange, isZooming, isPanning } =
    useGlobeViewState();

  const [, setTileLoading] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [featureCount, setFeatureCount] = useState<number>(0);
  const [totalPopulation, setTotalPopulation] = useState<number>(0);
  const [yearChangedAt, setYearChangedAt] = useState<number>(() => Date.now());

  // Zoomed in, the map tilts into a 3D landscape (lib/close3d.ts); ?close3d=0 keeps it flat.
  const [close3dOn, setClose3dOn] = useState(false);
  useEffect(() => setClose3dOn(close3dParam(window.location.search)), []);
  const close3d = close3dOn && !is3DMode && viewState.zoom >= CLOSE3D_ZOOM - 0.5;
  const deckViewState = close3dOn && !is3DMode ? { ...viewState, pitch: pitchForZoom(viewState.zoom) } : viewState;

  const { backgroundLayers, showTerrain, setShowTerrain } = useBackgroundLayers(time, close3d);
  const shadedBackground = useMemo(() => {
    const nightSun = nightOn ? sunPosition(now) : null;
    const props = { extensions: [NIGHT], nightSun };
    return backgroundLayers.map(layer => layer.clone(props));
  }, [backgroundLayers, nightOn, now]);

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

  // The legend's notes start folded (they took a third of a phone screen); the choice is remembered.
  const [notesOpen, setNotesOpenState] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(NOTES_KEY) === '1') setNotesOpenState(true);
    } catch {}
  }, []);
  const setNotesOpen = (open: boolean) => {
    setNotesOpenState(open);
    try {
      localStorage.setItem(NOTES_KEY, open ? '1' : '0');
    } catch {}
  };
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
  // Other kinds of human (Neanderthals, Denisovans, ...): on by default; ?humans=0 or the View panel turns it off.
  const [otherHumansOn, setOtherHumansOn] = useState(true);
  useEffect(() => setOtherHumansOn(new URLSearchParams(window.location.search).get('humans') !== '0'), []);
  const otherHumans = useOtherHumansLayer({
    enabled: otherHumansOn,
    time,
    zoom: viewState.zoom,
  });

  const [selectedPlace, setSelectedPlace] = useState<[number, number] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ kind: number; people: number } | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const screenSize =
    typeof window === 'undefined' ? undefined : { width: window.innerWidth, height: window.innerHeight };
  const { layers: gridLayers, grid, blend, loading, people } = useGridLayer({
    year,
    time,
    enabled: renderMode !== 'dots',
    mode: renderMode === 'dots' ? 'auto' : renderMode,
    view: viewState,
    size: screenSize,
    globe: is3DMode,
    season,
    households: settlements,
    setFeatureCount,
    setTotalPopulation,
    setMetricsLoading,
  });

  // The regional group (the level above a camp, ?settlements=1 only): a soft tint and a hover-card line for the
  // group under the cursor, or else the selected one. Close in, where groups can be picked one by one.
  const regionOn = settlements && blend.pickable && (renderMode === 'auto' || renderMode === 'units');
  // The left column swaps its legend for the hover card while the cursor is on the map; over the column itself
  // (to reach the legend or "About the data") there is no card, so the legend comes back.
  const columnRef = useRef<HTMLDivElement | null>(null);
  const columnRight = columnRef.current?.getBoundingClientRect().right ?? 0;
  const onMap = (x: number) => x > columnRight + 8;
  // One thing at a time in the column: a hovered site, band or evidence mark beats the place card under it.
  const evidenceHover = evidenceOn && evidence.hover && onMap(evidence.hover.x) ? evidence.hover : null;
  const otherHover = !evidenceHover && otherHumans.hover && onMap(otherHumans.hover.x) ? otherHumans.hover : null;
  const cardPoint = hoverCard && !evidenceHover && !otherHover && hoverPoint && onMap(hoverPoint.x) ? hoverPoint : null;
  const columnBusy = Boolean(cardPoint || evidenceHover || otherHover || tooltipData);
  const hoverRegion = useRegionalGroup(grid, hoverPoint, regionOn);
  const selectedRegion = useRegionalGroup(grid, selectedPlace && { lon: selectedPlace[0], lat: selectedPlace[1] }, regionOn);
  const hoverLargest = useLargestSettlement(grid, year, hoverPoint, settlements && (renderMode === 'auto' || renderMode === 'units'));
  const regionLayers = useMemo(() => regionTintLayer(hoverRegion ?? selectedRegion), [hoverRegion, selectedRegion]);

  // Name tags beside the walkers at the closest zoom: imagined, like the people (layers/personTags.ts).
  // On by default; ?tags=0 turns them off (to compare frame rates, or for a plain view of the prints).
  const [tagsOn, setTagsOn] = useState(true);
  useEffect(() => setTagsOn(new URLSearchParams(window.location.search).get('tags') !== '0'), []);
  const tagLayers = usePersonTags({
    people,
    view: deckViewState,
    size: screenSize,
    enabled: tagsOn && renderMode !== 'dots' && !is3DMode,
    peopleOpacity: blend.people,
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
    ...shadedBackground,
    ...otherHumans.below,
    ...(renderMode === 'dots' ? (modelled ? [] : humanLayers) : [...regionLayers, ...gridLayers, ...presenceLayers, ...tagLayers]),
    ...evidence.layers,
    ...otherHumans.above,
  ] as LayersList;

  return (
    <div className="relative w-full h-full">
      <DeckGLView
        mode={is3DMode ? '3d' : '2d'}
        viewState={deckViewState}
        onViewStateChange={onViewStateChange}
        layers={layers}
        containerProps={hoverCard ? hoverBind : undefined}
        unprojectRef={hoverCard ? unprojectRef : undefined}
        // Night lights flicker and bands/villages move on the GPU; redraw
        // continuously only while either is on screen.
        animate={renderMode !== 'dots' && (showTerrain || blend.units > 0 || presenceAnimating || otherHumans.shown)}
        onClick={(info) => {
          if (!peopleView || !info.coordinate) return;
          const [lon, lat] = info.coordinate;
          const person = info.layer?.id?.startsWith('people') ? (info.object as Person | undefined) : undefined;
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
        close3d={close3d}
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
        now={now}
      />

      {/* Bottom-left stack: details panel above the legend, both above the timeline. */}
      <div
        ref={columnRef}
        className="pointer-events-none absolute z-20 flex flex-col justify-end gap-2 sm:w-[360px]"
        style={{
          left: 'var(--ov-left)',
          right: 'var(--ov-right)',
          bottom: 'calc(var(--ov-timeline-h) + 8px)',
          // stay clear of the year/population panel at the top
          top: 'calc(var(--ov-top) + var(--ov-stats-h, 150px) + 8px)',
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

        {/* The settlement model's one-line note, above the hover card. */}
        {settlements && renderMode !== 'dots' && renderMode !== 'grid' && (
          <SettlementNote season={season} />
        )}
        {/* Hover card, docked here rather than following the cursor; the details panel takes its place while open. */}
        {tooltipData && <PopulationTooltip data={tooltipData} onClose={() => setTooltipData(null)} />}
        {evidenceHover && <EvidenceTooltip hover={evidenceHover} doc={evidence.doc} dnaDoc={evidence.dnaDoc} />}
        {otherHover && <OtherHumansTooltip hover={otherHover} />}
        {cardPoint && !(peopleView && selectedPlace) && (
          <HoverCard point={cardPoint} time={time} year={year} grid={grid} region={hoverRegion} largest={hoverLargest} />
        )}

        {/* Legend: hidden while the details panel or the hover card is up, which need the height. */}
        {peopleView && !selectedPlace && !columnBusy ? (
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
            <button
              type="button"
              onClick={() => setNotesOpen(!notesOpen)}
              aria-expanded={notesOpen}
              className="ov-note pointer-events-auto mt-1 flex items-center gap-1 text-[var(--ov-text-3)] hover:text-[var(--ov-text)]"
              data-testid="notes-toggle"
            >
              {modelled && <strong className="mr-1 font-semibold text-[var(--ov-amber)]">Modelled, not measured.</strong>}
              {notesOpen ? 'Hide notes ▴' : 'About the data ▾'}
            </button>
            {!notesOpen ? null : modelled ? (
              <p className="ov-note mt-1.5">
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
            {notesOpen && evidenceOn && (
              <p className="ov-note mt-1.5">
                <span style={{ color: '#78a0ff' }}>●</span> Dated sites (radiocarbon, p3k14c).
                <span style={{ color: '#50ebd7' }}> ◆</span> Ancient-DNA individuals (AADR). Measured evidence; dates and locations have uncertainty.
                Counts reflect excavations and sampling, not population.
              </p>
            )}
            {otherHumans.shown && (
              <p className="ov-note mt-1">
                <span style={{ color: `rgb(${OTHER_HUMANS_RGB.join(',')})` }}>●</span> Other kinds of human
                (Neanderthals, Denisovans, Flores, Luzon), drawn like our own people · bands of ~15; numbers and places guessed.
                {notesOpen && ' Places follow climate and habitat inside rough ranges drawn around known fossils and DNA. Ringed dots are key dated sites (hover for the find and source); brighter ones date to around the year shown. Fainter fires east of Borneo are hinted only by Denisovan DNA in Papuans today.'}
              </p>
            )}
            {notesOpen && showTerrain && <TerrainNote />}
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
          onModeChange={changeViewMode}
          showTerrain={showTerrain}
          onToggle={setShowTerrain}
          colorScheme={colorScheme}
          onColorSchemeChange={setColorScheme}
          showColorScheme={renderMode === 'dots'}
        >
          <ControlRow label="Day / night">
            <ToggleButton pressed={nightOn} onClick={() => setNightOn(on => !on)} label="Day/night shading" title="Shade Earth's night side using today's UTC clock; independent of the historical year">
              {nightOn ? 'On · live sun' : 'Off'}
            </ToggleButton>
          </ControlRow>
          <ControlRow label="Other humans">
            <ToggleButton pressed={otherHumansOn} onClick={() => setOtherHumansOn(on => !on)} label="Other kinds of human" title="Neanderthals, Denisovans, Homo floresiensis and Homo luzonensis: guessed bands drawn like our own people and key dated sites, until each was last seen">
              {otherHumansOn ? 'On' : 'Off'}
            </ToggleButton>
          </ControlRow>
          {seasonsEnabled && peopleView && (
            <ControlRow label="Season · modelled">
              <div className="ov-seg" role="group" aria-label="Seasonal scenario">
                {(['off', 'june', 'december'] as const).map(value => (
                  <ToggleButton key={value} pressed={season === value} onClick={() => setSeason(value)} label={`Season ${value}`}>
                    {{ off: 'Off', june: 'Jun', december: 'Dec' }[value]}
                  </ToggleButton>
                ))}
              </div>
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
