'use client';

import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { FIRST_GLOBE, FIRST_PEOPLE, markOnce } from '@/lib/firstLoadMarks';
import { prefetchAfterFirstPeople } from '@/lib/lazyModule';
import { CLOSE3D_MODULE } from '@/components/footsteps/hooks/useTerrainLayers';
import { terrainTilesParam } from '@/lib/terrainDetail';
import { getViewMode, setViewMode } from '@/lib/viewModeStore';
import { WebMercatorViewport, type LayersList, type PickingInfo } from '@deck.gl/core';
import { bandsInView, emptyViewNote, peopleInView } from '@/lib/emptyView';
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
import { personCard, type Person } from '@/components/footsteps/layers/people';
import { clampTime, evidenceAt, nearestDataYear, populationAt } from '@/lib/time';
import { seaLevelAt } from '@/lib/climate';
import { CLOSE3D_ZOOM, EXAGGERATION, SKY_FULL_ZOOM, close3dParam, farMultiplier, pitchForZoom } from '@/lib/close3d';
import { heightAt } from '@/lib/groundHeights';
import { reanchor } from './views/liftAnchor';
import useSmokeLayer from '@/components/footsteps/hooks/useSmokeLayer';
import { smokeParam } from '@/lib/hearths';
import useGridLayer from '@/components/footsteps/hooks/useGridLayer';
import usePresenceLayers from '@/components/footsteps/hooks/usePresenceLayers';
import usePersonTags from '@/components/footsteps/hooks/usePersonTags';
import GroundingPanel from './overlays/GroundingPanel';
import { AVATAR_3D } from './overlays/avatarLazy';
import { avatarFromParams } from '@/lib/avatar';
import { groundingFacts } from './layers/grounding';
import { MODEL_NOTES_URL, nearestDotTileYear } from '@/lib/constants';
import { PEOPLE_MODES, type PeopleMode } from './hooks/peopleView';
import { UnitKind } from './layers/units';
import { LOOKS, WayOfLife, type WayOfLifeValue } from '@/lib/waysOfLife';
import HoverCard from './overlays/HoverCard';
import EstimatePanel from './overlays/EstimatePanel';
import { explainParam } from '@/lib/estimate';
import WaySign from './overlays/WaySign';
import FeaturedPerson from './overlays/FeaturedPerson';
import { personKey, pickFeatured, samePerson } from '@/lib/featuredPerson';
import useRegionalGroup from './hooks/useRegionalGroup';
import useLargestSettlement from './hooks/useLargestSettlement';
import useOtherHumansLayer, { OTHER_HUMANS_RGB } from './hooks/useOtherHumansLayer';
import OtherHumansTooltip from './overlays/OtherHumansTooltip';
import useHoverPoint, { type Unproject } from './hooks/useHoverPoint';
import useSolarClock from './hooks/useSolarClock';
import useGroundLift from './hooks/useGroundLift';
import { epochHour, routineParam } from '@/lib/routine';
import NightExtension from './layers/NightExtension';
import { sunPosition } from '@/lib/sunTime';
import { sceneLight, skyBackdrop, skyParam } from '@/lib/sky';
import { setSolarClockAt, solarClockParams } from '@/lib/solarClock';
import { DEFAULT_DIAL_HOUR, dialInstant, hourParam, skyPhase, type DialSun } from '@/lib/timeOfDay';
import parseInitialViewState from '@/lib/parseInitialViewState';
import { sunHours } from '@/lib/sunTime';
import type { Season } from '@/lib/seasons';
import { SettlementNote } from './SettlementNote';
import { settlementsFromParams } from '@/lib/settlements';
import { pastWaterNote, pastWaterParam } from '@/lib/pastWater';
import { iceNote, iceParam } from '@/lib/iceSheets';
import { ADJUSTED_SPREAD_LABEL, spreadNote, spreadParam } from '@/lib/adjustedSpread';
import TimeOfDayDial from '@/components/ui/TimeOfDayDial';
import FeaturesMenu from '@/components/ui/FeaturesMenu';
import { loadDwellings, sheltersParam, type DwellingTable } from '@/lib/dwellings';
import { fieldsParam } from './layers/fields';
import useLand from './hooks/useLand';
import { shelterHoverOf, type ShelterHover } from './layers/shelters';
import { treesParam } from '@/lib/close3d';
import ShelterTooltip from './overlays/ShelterTooltip';


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
  // The seasonal scenario control was removed (2026-11-28); groups stay where the year-round model puts them.
  const season: Season = 'off';
  const now = useSolarClock();
  // The time-of-day dial (lib/timeOfDay.ts) sets one sun for the whole Earth: its hour, at the place the view was centred on when
  // it was set (the start view, or wherever the dial was last turned). Panning and zooming then never move the sun or the night
  // side; the dial just reads the local hour at the new centre. It starts in daytime, or at `?hour=`.
  // Null while a URL clock (`?utc=`, `?warp=`) runs, until the dial is first turned.
  const [dialSun, setDialSun] = useState<DialSun | null>(null);
  useEffect(() => {
    const search = window.location.search;
    const start = parseInitialViewState(search);
    const hour = hourParam(search) ?? (solarClockParams(search) ? null : DEFAULT_DIAL_HOUR);
    setDialSun(hour === null ? null : { hour, lon: start.longitude, lat: start.latitude });
  }, []);
  useEffect(() => {
    if (dialSun) setSolarClockAt(dialInstant(dialSun.hour, dialSun.lon, dialSun.lat));
  }, [dialSun]);
  // The daily routine (lib/routine.ts), ?routine=1: people sleep, stay at the hearth, play or go on trips by the sun clock.
  // Its plans are keyed on the hour of the (sun) clock, so they are rebuilt once an hour, not every tick.
  // `?pastwater=1`: the dated past-water scenarios (lib/pastWater.ts), off until reviewed on prod. The note says what it does at this date and in this mode.
  const [pastWaterOn, setPastWaterOn] = useState(false);
  useEffect(() => setPastWaterOn(pastWaterParam(window.location.search)), []);
  // `?ice=1`: the dated ice sheets (lib/iceSheets.ts), off until reviewed on prod. The note names the epoch drawn and what the groups did.
  const [iceOn, setIceOn] = useState(false);
  useEffect(() => setIceOn(iceParam(window.location.search)), []);
  // `?spread=1`: HYDE's people moved toward where the climate then let them live, 10,000–4,000 BCE (lib/adjustedSpread.ts), off until reviewed.
  const [spreadOn, setSpreadOn] = useState(false);
  useEffect(() => setSpreadOn(spreadParam(window.location.search)), []);
  const [routineOn, setRoutineOn] = useState(false);
  useEffect(() => setRoutineOn(routineParam(window.location.search)), []);
  const routineEpoch = routineOn ? epochHour(now.getTime()) : null;
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSettlements(settlementsFromParams(params));
    setRenderMode(renderModeFromUrl());
    setDebugModes(modeParam() !== null);
    setHoverCard(hoverParam());
    setIs3DMode(getViewMode());
  }, []);

  const { viewState, onViewStateChange, isZooming, isPanning } =
    useGlobeViewState();
  // `?explain=1` (lib/estimate.ts, off until Will decides how to show uncertainty): a quiet "How is this estimated?" link under
  // the counter opens a panel naming the sources, methods and a confidence word for the place and year.
  const [explainOn, setExplainOn] = useState(false);
  useEffect(() => setExplainOn(explainParam(window.location.search)), []);
  const [explainOpen, setExplainOpen] = useState(false);

  const [, setTileLoading] = useState<boolean>(true);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [featureCount, setFeatureCount] = useState<number>(0);
  const [totalPopulation, setTotalPopulation] = useState<number>(0);
  const [yearChangedAt, setYearChangedAt] = useState<number>(() => Date.now());

  // Zoomed in, the map shows the 3D landscape (lib/close3d.ts); ?close3d=0 keeps it flat.
  const [close3dOn, setClose3dOn] = useState(false);
  useEffect(() => setClose3dOn(close3dParam(window.location.search)), []);
  // `?sky=1` (lib/sky.ts, off until reviewed on prod): the close-up lit by the sun clock, hazed into a sky, with moving water. It also
  // tilts the close-up further from zoom 11 so the horizon is in frame.
  const [skyOn, setSkyOn] = useState(false);
  useEffect(() => setSkyOn(skyParam(window.location.search)), []);
  // The close-up never tilts by itself as you zoom (removed 2026-11-28: a tilt that changes with zoom made it hard to zoom onto a
  // group). A right-drag still tilts by hand, and the sky shows once the horizon is in frame.
  const autoTilt = false;
  const close3d = close3dOn && !is3DMode && viewState.zoom >= CLOSE3D_ZOOM - 0.5;
  const closePitch = autoTilt ? pitchForZoom(viewState.zoom, skyOn) : viewState.pitch ?? 0;
  // With the sky the camera looks out to the horizon; draw the ground only as far as the haze leaves it visible (rounded, so
  // the view is not rebuilt every frame of a zoom).
  const farZ = skyOn && close3d ? Math.round(farMultiplier(closePitch) * 100) / 100 : undefined;
  const farZMultiplier = farZ !== undefined && farZ < 1.01 ? farZ : undefined;
  const tiltForZoom = useMemo(() => (autoTilt ? (zoom: number) => pitchForZoom(zoom, skyOn) : undefined), [autoTilt, skyOn]);
  // The close-up ground's drawn height (lib/groundHeights.ts, exaggerated as drawn; the sea's surface at 0), for zooming onto what is under the cursor.
  const groundZ = useMemo(() => (tiltForZoom ? (lon: number, lat: number) => { const h = heightAt(lon, lat); return h === null ? null : Math.max(0, h) * EXAGGERATION; } : undefined), [tiltForZoom]);
  // With the sky tilt the camera is low; lift it by the ground under it so it never stands inside a mountain (deck.gl measures it from sea level).
  const groundLift = useGroundLift(skyOn && close3d, viewState.longitude, viewState.latitude, viewState.zoom, closePitch, typeof window === 'undefined' ? 800 : window.innerHeight);
  // A view the map moved keeps the lift it was moved with (views/liftAnchor.ts: re-described on the ground when not animating), so the
  // camera does not jump; a view set any other way (the URL, the tour) starts from `full`. Either way never below the camera's clearance.
  const liftAnchor = useRef<{ longitude: number; latitude: number; zoom: number; lift: number } | null>(null);
  const anchor = liftAnchor.current;
  const anchored = anchor && anchor.longitude === viewState.longitude && anchor.latitude === viewState.latitude && anchor.zoom === viewState.zoom ? anchor.lift : null;
  const lift = skyOn && close3d ? Math.max(groundLift.min, anchored ?? groundLift.full) : 0;
  const liftRef = useRef(0);
  liftRef.current = lift;
  const viewStateRef = useRef(viewState);
  viewStateRef.current = viewState;
  const deckViewState = close3dOn && !is3DMode
    ? { ...viewState, pitch: closePitch, ...(skyOn && close3d ? { position: [0, 0, lift] as [number, number, number] } : {}) }
    : viewState;
  /** How long after the map stops moving its lift is re-described on the ground (longer than a scroll's pause between wheel steps). */
  const REANCHOR_AFTER_MS = 900;
  const liftOnAt = useCallback((zoom: number) => skyOn && close3dOn && !is3DMode && zoom >= CLOSE3D_ZOOM - 0.5, [skyOn, close3dOn, is3DMode]);

  // A moment after the map stops moving, describe the view again with its target on the ground the centre looks at: the camera stays
  // put (views/liftAnchor.ts). Not while it moves: deck drags in a plane at the lift's height, a new centre or zoom cancels its animations,
  // and a scroll's glide counts zoom levels from its start (views/tiltController.ts). Not below SKY_FULL_ZOOM, where the tilt still follows
  // the zoom.
  const interaction = useRef<Record<string, boolean | undefined>>({});
  const reanchorTimer = useRef<number | undefined>(undefined);
  const reanchorSoon = useCallback(() => {
    window.clearTimeout(reanchorTimer.current);
    reanchorTimer.current = window.setTimeout(() => {
      if (interaction.current.isDragging || interaction.current.inTransition) return reanchorSoon();
      const a = liftAnchor.current;
      const vs = viewStateRef.current;
      if (!a || !groundZ || !liftOnAt(vs.zoom) || vs.zoom < SKY_FULL_ZOOM || a.longitude !== vs.longitude || a.latitude !== vs.latitude || a.zoom !== vs.zoom) return;
      const pitch = pitchForZoom(vs.zoom, true);
      const r = reanchor({ longitude: vs.longitude, latitude: vs.latitude, zoom: vs.zoom, pitch, bearing: vs.bearing ?? 0, width: window.innerWidth, height: window.innerHeight }, a.lift, groundZ, SKY_FULL_ZOOM);
      if (!r) return;
      liftAnchor.current = r;
      onViewStateChange({ viewState: { ...vs, longitude: r.longitude, latitude: r.latitude, zoom: r.zoom, pitch } });
    }, REANCHOR_AFTER_MS);
  }, [groundZ, liftOnAt, onViewStateChange]);
  useEffect(() => () => window.clearTimeout(reanchorTimer.current), []);
  const onInteractionStateChange = useCallback((state: Record<string, boolean | undefined>) => {
    interaction.current = state;
  }, []);
  const onDeckViewStateChange = useCallback(
    (change: Parameters<typeof onViewStateChange>[0] & { interactionState?: Record<string, boolean | undefined> }) => {
      const vs = change.viewState as typeof change.viewState & { position?: number[] };
      // A move made on the map keeps its lift, and so does any change after one (deck sends one more as a drag ends); a change at load or on
      // resize, before the ground lift is known, would pin it at 0.
      const i = change.interactionState ?? {};
      const moved = Boolean(i.isDragging || i.isPanning || i.isZooming || i.isRotating || i.inTransition) || liftAnchor.current !== null;
      liftAnchor.current = liftOnAt(vs.zoom) && moved
        ? { longitude: vs.longitude, latitude: vs.latitude, zoom: vs.zoom, lift: vs.position?.[2] ?? liftRef.current }
        : null;
      onViewStateChange(change);
      if (liftAnchor.current) reanchorSoon();
    },
    [onViewStateChange, liftOnAt, reanchorSoon],
  );
  // One light for the view, from its centre (rounded to 0.1°, so panning does not rebuild it every frame).
  const lightLon = Math.round(viewState.longitude * 10) / 10;
  const lightLat = Math.round(viewState.latitude * 10) / 10;
  // What the dial shows: the local sun hour at the view's centre now. Turning it re-anchors the sun at this centre.
  const shownHour = sunHours(lightLon, now);
  const shownPhase = skyPhase(now.getTime(), lightLon, lightLat);
  const turnDial = useCallback(
    (hour: number) => setDialSun((sun) => ({ hour, lon: lightLon, lat: sun?.lat ?? lightLat })),
    [lightLon, lightLat],
  );
  // The light, the night shading and the firelight all follow the sun clock, which the dial sets.
  const light = useMemo(
    () => (skyOn && close3d ? sceneLight(lightLon, lightLat, now.getTime()) : null),
    [skyOn, close3d, lightLon, lightLat, now],
  );

  const { backgroundLayers, showTerrain, setShowTerrain } = useBackgroundLayers(time, close3d);
  // The close-up's code is not in the first load; fetch it once the first people are drawn, so zooming in does not wait.
  useEffect(() => (close3dOn ? prefetchAfterFirstPeople(CLOSE3D_MODULE) : undefined), [close3dOn]);
  // `?avatar=3d`: fetch the 3D person's code once the people are up, so a click shows the figure without waiting for it.
  useEffect(() => (avatarFromParams(window.location.search) ? prefetchAfterFirstPeople(AVATAR_3D) : undefined), []);
  const shadedBackground = useMemo(() => {
    const nightSun = sunPosition(now);
    const props = { extensions: [NIGHT], nightSun };
    return backgroundLayers.map((layer) => {
      if (light && layer.id === 'close3d') return layer.clone({ ...props, light, groundTop: lift } as typeof props);
      // Keep a layer's own extensions (the flat backdrop's SkyTint under the close-up) beside the night shading, and give it the light.
      const own = (layer.props.extensions ?? []).filter((e) => e !== NIGHT);
      return layer.clone({ ...props, extensions: [NIGHT, ...own], ...(light && own.length ? { skyLight: light } : {}) } as typeof props);
    });
  }, [backgroundLayers, now, light, lift]);

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
  // Other kinds of human (Neanderthals, Denisovans, ...): on by default; ?humans=0 or the Features menu turns it off.
  const [otherHumansOn, setOtherHumansOn] = useState(true);
  useEffect(() => setOtherHumansOn(new URLSearchParams(window.location.search).get('humans') !== '0'), []);
  const otherHumans = useOtherHumansLayer({
    enabled: otherHumansOn,
    time,
    zoom: viewState.zoom,
    globe: is3DMode,
    view: viewState,
    size: typeof window === 'undefined' ? undefined : { width: window.innerWidth, height: window.innerHeight },
    routineEpoch,
  });

  // Close-up dwellings (`?shelters=1`, off by default until reviewed): type modelled from analogs, place imagined (lib/dwellings.ts).
  const [sheltersOn, setSheltersOn] = useState(false);
  const [treesOn, setTreesOn] = useState(false);
  useEffect(() => setTreesOn(treesParam(window.location.search)), []);
  useEffect(() => setSheltersOn(sheltersParam(window.location.search)), []);
  const [dwellings, setDwellings] = useState<DwellingTable | null>(null);
  useEffect(() => {
    if (sheltersOn || treesOn) loadDwellings().then(setDwellings).catch((error) => console.warn('[shelters] failed to load', error));
  }, [sheltersOn, treesOn]);
  const [shelterHover, setShelterHover] = useState<ShelterHover | null>(null);
  // Close-up fields, gardens and paths (`?fields=1`, off by default until reviewed): imagined layout, farmed share from HYDE (layers/fields.ts).
  const [fieldsOn, setFieldsOn] = useState(false);
  useEffect(() => setFieldsOn(fieldsParam(window.location.search)), []);
  // The dwelling under the cursor is gone when the set changes (a pan, zoom out or scrub): drop its card rather than leave it stale.

  // Hearth smoke and, at night, firelight (`?smoke=1`, off by default until reviewed): imagined (lib/hearths.ts).
  const [smokeOn, setSmokeOn] = useState(false);
  useEffect(() => setSmokeOn(smokeParam(window.location.search)), []);

  const [selectedPlace, setSelectedPlace] = useState<[number, number] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ kind: number; people: number } | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const screenSize =
    typeof window === 'undefined' ? undefined : { width: window.innerWidth, height: window.innerHeight };
  const { layers: gridLayers, grid, unresolved, blend, loading, people, shelters, inView, hearths } = useGridLayer({
    year,
    time,
    enabled: renderMode !== 'dots',
    mode: renderMode === 'dots' ? 'auto' : renderMode,
    view: viewState,
    size: screenSize,
    globe: is3DMode,
    season,
    households: settlements,
    routineEpoch,
    dwellings: ((sheltersOn && settlements) || treesOn) && close3d ? dwellings : null,
    homes3d: sheltersOn && settlements && close3d && !!dwellings,
    onGround: close3d,
    fields: fieldsOn && settlements && close3d,
    smoke: smokeOn && settlements,
    setFeatureCount,
    setTotalPopulation,
    setMetricsLoading,
  });

  const land = useLand({ enabled: fieldsOn && settlements && close3d, inView, season, grid });

  const smokeLayers = useSmokeLayer({ enabled: smokeOn && !is3DMode && blend.people > 0, hearths, zoom: viewState.zoom, seaLevel: seaLevelAt(clampTime(time)), onGround: close3d });

  // The regional group (the level above a camp, ?settlements=1 only): a hover-card line for the group under the cursor. Close in,
  // where groups can be picked one by one. Its soft tint (nested squares round the cursor) was removed on 2026-11-28: it read as a
  // stray light, not a group.
  const regionOn = settlements && blend.pickable && (renderMode === 'auto' || renderMode === 'units');
  // The left column swaps its legend for the hover card while the cursor is on the map; over the column itself
  // (to reach the legend or "About the data") there is no card, so the legend comes back.
  const columnRef = useRef<HTMLDivElement | null>(null);
  const columnRight = columnRef.current?.getBoundingClientRect().right ?? 0;
  const onMap = (x: number) => x > columnRight + 8;
  // One thing at a time in the column: a hovered site, band or evidence mark beats the place card under it.
  const otherHover = otherHumans.hover && onMap(otherHumans.hover.x) ? otherHumans.hover : null;
  const shelterInfo = sheltersOn && !otherHover && shelterHover && shelters.length && onMap(shelterHover.x) ? shelterHover : null;
  const cardPoint = hoverCard && !otherHover && !shelterInfo && hoverPoint && onMap(hoverPoint.x) ? hoverPoint : null;
  const columnBusy = Boolean(cardPoint || otherHover || shelterInfo || tooltipData);
  // The explainer follows the cursor while it is on the map, and keeps the last spot when the cursor leaves for the panel.
  const lastPointRef = useRef<{ lon: number; lat: number } | null>(null);
  if (cardPoint) lastPointRef.current = { lon: cardPoint.lon, lat: cardPoint.lat };
  const hoverRegion = useRegionalGroup(grid, hoverPoint, regionOn);
  const hoverLargest = useLargestSettlement(grid, year, hoverPoint, settlements && (renderMode === 'auto' || renderMode === 'units'));

  // Name tags beside the walkers at the closest zoom: imagined, like the people (layers/personTags.ts).
  // On by default; ?tags=0 turns them off (to compare frame rates, or for a plain view of the prints).
  const [tagsOn, setTagsOn] = useState(true);
  useEffect(() => setTagsOn(new URLSearchParams(window.location.search).get('tags') !== '0'), []);
  // Their walkers (other kinds of human) get tags too.
  const taggedPeople = useMemo(
    () => (otherHumans.people.length ? [...people, ...otherHumans.people] : people),
    [people, otherHumans.people],
  );
  // At street zoom the left column shows someone in frame without a click: kept while they stay in frame, else the
  // one nearest the middle (lib/featuredPerson.ts). Zooming in narrows the frame, so the choice narrows with it.
  const featuredKey = useRef<string | null>(null);
  const featuredPerson = useRef<Person | null>(null);
  const featuredOn = !!screenSize && (renderMode === 'auto' || renderMode === 'units') && blend.people >= 0.5 && !is3DMode && !selectedPlace && taggedPeople.length > 0;
  const featured = useMemo(() => {
    if (!featuredOn || !screenSize) return null;
    const [west, south, east, north] = new WebMercatorViewport({
      longitude: deckViewState.longitude,
      latitude: deckViewState.latitude,
      zoom: deckViewState.zoom,
      pitch: deckViewState.pitch ?? 0,
      bearing: deckViewState.bearing ?? 0,
      width: screenSize.width,
      height: screenSize.height,
    }).getBounds();
    const pick = pickFeatured(taggedPeople, { west, south: Math.max(-90, south), east, north: Math.min(90, north) }, [deckViewState.longitude, deckViewState.latitude], featuredKey.current);
    // The people are rebuilt as the view moves; keep the same object for the same person so the card (and its 3D
    // figure) does not rebuild on every zoom or pan.
    return pick && featuredPerson.current && samePerson(pick, featuredPerson.current) ? featuredPerson.current : pick;
  }, [featuredOn, taggedPeople, deckViewState.longitude, deckViewState.latitude, deckViewState.zoom, deckViewState.pitch, deckViewState.bearing, screenSize?.width, screenSize?.height]);
  useEffect(() => {
    featuredKey.current = featured ? personKey(featured) : null;
    featuredPerson.current = featured;
  }, [featured]);
  const tagLayers = usePersonTags({
    people: taggedPeople,
    view: deckViewState,
    size: screenSize,
    enabled: tagsOn && renderMode !== 'dots' && !is3DMode,
    peopleOpacity: blend.people,
    routineEpoch,
    onGround: close3d,
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
  // `?spread=1`: the grid on screen came from the adjusted image (gridData.ts); the labels follow what is drawn, not the flag.
  const adjusted = renderMode !== 'dots' && grid?.adjusted === true;

  // An empty view reads as "still loading": say when no one is on screen (zoomed in, flat map, data loaded).
  // Checked 400 ms after the view settles, not every frame.
  const [emptyNote, setEmptyNote] = useState<string | null>(null);
  const emptyCheck = !is3DMode && viewState.zoom >= 4 && grid && !loading ? grid : null;
  useEffect(() => {
    if (!emptyCheck) {
      setEmptyNote(null);
      return;
    }
    const timer = window.setTimeout(() => {
      const [west, south, east, north] = new WebMercatorViewport({
        longitude: deckViewState.longitude,
        latitude: deckViewState.latitude,
        zoom: deckViewState.zoom,
        pitch: deckViewState.pitch ?? 0,
        bearing: deckViewState.bearing ?? 0,
        width: window.innerWidth,
        height: window.innerHeight,
      }).getBounds();
      const box = { west, south: Math.max(-90, south), east, north: Math.min(90, north) };
      setEmptyNote(emptyViewNote(peopleInView(emptyCheck, box), bandsInView(otherHumans.bands, box), modelled ? 'model' : emptyCheck.adjusted ? 'adjusted' : 'hyde'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [emptyCheck, deckViewState.longitude, deckViewState.latitude, deckViewState.zoom, deckViewState.pitch, deckViewState.bearing, otherHumans.bands, modelled]);
  // The dwellings stand on the close-up ground, so they ride in its layer (it samples the relief under each).
  useEffect(() => setShelterHover(null), [shelters]);
  // The fields and paths are draped on the same ground (`?fields=1`).
  const sceneBackground = useMemo(
    () =>
      ((sheltersOn || treesOn) && shelters.length) || land
        ? shadedBackground.map((layer) =>
            layer.id === 'close3d'
              ? layer.clone({
                  shelters: sheltersOn ? shelters : [],
                  clearings: treesOn ? shelters.map((s) => ({ position: s.position, radius: Math.max(18, s.size[0] * 2) })) : [],
                  onHover: (info: PickingInfo) => setShelterHover(shelterHoverOf(info)),
                  ...(land ? { land } : {}),
                })
              : layer,
          )
        : shadedBackground,
    [shadedBackground, sheltersOn, treesOn, shelters, land],
  );
  const layers: LayersList = [
    ...sceneBackground,
    ...otherHumans.below,
    ...(renderMode === 'dots' ? (modelled ? [] : humanLayers) : [...gridLayers, ...smokeLayers, ...presenceLayers, ...tagLayers]),
    ...otherHumans.above,
  ] as LayersList;
  // First-load marks (lib/firstLoadMarks.ts): the frame after the Earth, then the year's people, are handed to deck.gl.
  const firstLoad = useRef({ globe: false, people: false });
  firstLoad.current = {
    globe: sceneBackground.length > 0,
    people: (renderMode === 'dots' ? humanLayers.filter(Boolean).length : presenceLayers.length + gridLayers.length) > 0,
  };
  const onAfterRender = useCallback(() => {
    if (firstLoad.current.globe) markOnce(FIRST_GLOBE);
    if (firstLoad.current.people) markOnce(FIRST_PEOPLE);
  }, []);

  return (
    <div className="relative w-full h-full">
      <DeckGLView
        onAfterRender={onAfterRender}
        mode={is3DMode ? '3d' : '2d'}
        viewState={deckViewState}
        backdrop={light ? skyBackdrop(light, deckViewState.pitch ?? 0) : undefined}
        onViewStateChange={onDeckViewStateChange}
        onInteractionStateChange={onInteractionStateChange}
        tilt={tiltForZoom}
        ground={groundZ}
        farZMultiplier={farZMultiplier}
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
        countLabel={renderMode === 'dots' ? 'Dots drawn' : renderMode === 'grid' ? 'Cells, whole map' : 'Groups, whole map'}
        totalPopulation={renderMode === 'dots' ? totalPopulation : populationAt(time)}
        viewState={viewState}
        close3d={close3d}
        pastWater={pastWaterOn ? pastWaterNote(year, renderMode === 'dots' || renderMode === 'grid' ? renderMode : 'units', unresolved) : null}
        ice={iceOn ? iceNote(year, renderMode === 'dots' || renderMode === 'grid' ? renderMode : 'units', unresolved) : null}
        spread={spreadOn ? spreadNote(year, renderMode === 'dots' || renderMode === 'grid' ? renderMode : 'units', grid ? grid.adjusted === true : undefined) : null}
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
            person={selectedPerson ? personCard(selectedPerson, routineOn ? now.getTime() : undefined) : null}
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
                        ...(selectedPerson.kindOfHuman && { kindOfHuman: selectedPerson.kindOfHuman }),
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

        {emptyNote && peopleView && (
          <div className="ov-panel ov-note shrink-0 px-3.5 py-2.5 text-[var(--ov-text-2)]" data-testid="empty-view-note" role="status">
            {emptyNote}
          </div>
        )}
        {/* The settlement model's one-line note, above the hover card. */}
        {settlements && renderMode !== 'dots' && renderMode !== 'grid' && (
          <SettlementNote season={season} shelters={sheltersOn} smoke={smokeOn} />
        )}
        {/* Hover card, docked here rather than following the cursor; the details panel takes its place while open. */}
        {tooltipData && <PopulationTooltip data={tooltipData} onClose={() => setTooltipData(null)} />}
        {otherHover && <OtherHumansTooltip hover={otherHover} />}
        {shelterInfo && <ShelterTooltip hover={shelterInfo} table={dwellings} />}
        {featured && (
          <FeaturedPerson
            person={featured}
            year={Math.round(time)}
            routineMs={routineOn ? now.getTime() : undefined}
            onOpen={() => {
              setSelectedPerson(featured);
              setSelectedGroup(null);
              setSelectedPlace([featured.position[0], featured.position[1]]);
            }}
          />
        )}
        {cardPoint && !featured && !(peopleView && selectedPlace) && (
          <HoverCard point={cardPoint} time={time} year={year} grid={grid} region={hoverRegion} largest={hoverLargest} />
        )}

        {/* Legend: hidden while the details panel or the hover card is up, which need the height. */}
        {peopleView && !selectedPlace && !columnBusy && !featured ? (
          <div className="ov-panel shrink-0 px-3.5 py-3">
            <ul className="ov-body flex flex-wrap gap-x-4 gap-y-1">
              {(modelled ? MODELLED_LEGEND : LEGEND).map((way) => (
                <li key={way}>
                  <WaySign way={way} />
                  {LOOKS[way].name}
                  {!showGlowLegend && way !== WayOfLife.Urban && (
                    <span className="text-[var(--ov-text-3)]"> · {LOOKS[way].mark}</span>
                  )}
                </li>
              ))}
              {!showGlowLegend && blend.pickable && (
                <li className="text-[var(--ov-text-3)]">Click a mark to name it</li>
              )}
              {sheltersOn && shelters.length > 0 && (
                <li className="text-[var(--ov-text-3)]">Dwellings: type modelled from analogs, place imagined. Hover one.</li>
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
              {adjusted && <strong className="mr-1 font-semibold text-[var(--ov-amber)]" data-testid="spread-label">{ADJUSTED_SPREAD_LABEL}.</strong>}
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
                {adjusted
                  ? "Head counts are HYDE's, moved within continent-scale regions toward where the climate then let people live (the Green Sahara, the dry shelves), each region keeping HYDE's total; moved people sit in ~55 km blocks. "
                  : 'Head counts per ~10 km cell are HYDE estimates. '}
                Way of life is read
                from HYDE cropland and grazing in the cell, not known for any one
                group, and where its bands, villages and camps sit inside the cell
                is illustrative.
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
          <ControlRow label="Time of day">
            <TimeOfDayDial hour={shownHour} phase={shownPhase} onChange={turnDial} />
          </ControlRow>
          <FeaturesMenu
            live={{ humans: { on: otherHumansOn, set: setOtherHumansOn } }}
            viewParams={() => ({
              lat: viewState.latitude.toFixed(4),
              lon: viewState.longitude.toFixed(4),
              zoom: viewState.zoom.toFixed(2),
              year: String(Math.round(time)),
            })}
          />
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
        {/* `?explain=1`: where the numbers come from. Beside the hover card, not instead of it: that says what is here, this says how we know. */}
        {explainOn && (
          <div className="mt-2 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setExplainOpen((o) => !o)}
              aria-expanded={explainOpen}
              aria-label="How we estimate this"
              title="How we estimate this"
              data-testid="explain-toggle"
              className={`ov-panel pointer-events-auto flex h-8 w-8 items-center justify-center !rounded-full !p-0 text-[14px] font-semibold ${explainOpen ? 'text-[var(--ov-text)]' : 'text-[var(--ov-text-3)]'} hover:text-[var(--ov-text)]`}
            >
              ?
            </button>
            {explainOpen && (
              <EstimatePanel
                time={time}
                adjusted={adjusted}
                place={
                  selectedPlace
                    ? { lon: selectedPlace[0], lat: selectedPlace[1] }
                    : lastPointRef.current ?? { lon: viewState.longitude, lat: viewState.latitude }
                }
                onClose={() => setExplainOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** One-line source note for the terrain images. */
function TerrainNote() {
  // The colour pyramid's line only when it is drawn (`?terrain_tiles=1`, lib/terrainDetail.ts).
  const [tiles, setTiles] = useState(false);
  useEffect(() => setTiles(terrainTilesParam(window.location.search)), []);
  return (
    <span className="ov-note mt-1.5 block">
      Land, sea and ice reconstructed from climate and ice models (Krapp et al. 2021),
      coloured from NASA Blue Marble; the green Sahara is drawn from the literature.
      {tiles && <>Close in, the fine texture is today&apos;s ground (Blue Marble 500 m) recoloured to the era: imagined detail, not a map of then. </>}
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
