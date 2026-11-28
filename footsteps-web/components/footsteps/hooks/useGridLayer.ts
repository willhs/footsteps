import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { drawnGroundZ, groundVersion, subscribeGround } from '@/lib/groundHeights';
import type { LayersList } from '@deck.gl/core';
import { blendCities, type AllocatedCity } from '@/lib/settlements';
import type { DwellingTable } from '@/lib/dwellings';
import { hearthsForView, type Hearth } from '@/lib/hearths';
import { siteByWater } from '@/lib/campSiting';
import { loadRivers, type Rivers } from '@/lib/rivers';
import { sheltersForGroups, sheltersForTown, type Shelter, type ShelterGroup, type TownInView } from '../layers/shelters';
import { UnitKind } from '../layers/units';
import { cityLayers as buildCityLayers } from '../layers/cityLayers';
import { PEOPLE_YEARS } from '@/lib/constants';
import { type GridData, type PointBuffers, type YearGrid } from './gridData';
import { loadGrid, loadUnitMorph } from './gridLoader';
import type { MorphPoints } from './unitMorph';
import { WORLD, type Region } from './unitRegion';
import {
  nextRegion,
  viewBlend,
  viewBounds,
  ZOOM,
  type PeopleMode,
  type ViewBlend,
} from './peopleView';
import useYearCrossfade from './useYearCrossfade';
import useHandover from './useHandover';
import { bracket } from '@/lib/time';
import type { Season } from '@/lib/seasons';
import GridYearLayer from '../layers/GridYearLayer';
import {
  PeopleLayer,
  figureBlend,
  footprintData,
  peopleForMorph,
  routineProps,
  type MorphGroupInView,
  type Person,
} from '../layers/people';

/** Zoom levels before the groups start to fade in (ZOOM.unitsIn) at which their data starts building, so it is ready on arrival. */
export const UNITS_PREFETCH_ZOOMS = 0.8;

const NO_PEOPLE: readonly Person[] = [];
const NO_SHELTERS: readonly Shelter[] = [];
/** The groups and towns in view at one data year. */
export type GroupsInView = { year: number; groups: ShelterGroup[]; towns: TownInView[] };
const NO_HEARTHS: readonly Hearth[] = [];

export { gridUrl, type GridData, type YearGrid } from './gridData';
export { loadGrid } from './gridLoader';
export type GridStyle = 'grid' | 'units';
export type GridMode = Exclude<PeopleMode, 'dots'>;
type View = { longitude: number; latitude: number; zoom: number };
type Scene = {
  year: number;
  fromYear: number;
  data: PointBuffers | MorphPoints;
  style: GridStyle;
  region: Region;
};
const regionKey = (r: Region) => `${r.west},${r.south},${r.east},${r.north}`;

/** People drawn from the per-year population images. In `auto` the look follows
 * zoom (see peopleView.ts): firelight (drawn elsewhere, faded by `blend.glow`) far out, unit marks for the
 * cells around the viewport closer in, cross-faded in between. */
export default function useGridLayer({
  year,
  time,
  enabled,
  mode = 'auto',
  view = { longitude: 0, latitude: 0, zoom: 1 },
  size = { width: 1440, height: 900 },
  globe = false,
  season = 'off',
  households = false,
  routineEpoch = null,
  dwellings = null,
  homes3d = false,
  onGround = false,
  fields = false,
  smoke = false,
  setFeatureCount,
  setTotalPopulation,
  setMetricsLoading,
}: {
  year: number;
  /** Continuous year: when set, units morph between the data years either side. */
  time?: number;
  enabled: boolean;
  mode?: GridMode;
  view?: View;
  size?: { width: number; height: number };
  globe?: boolean;
  season?: Season;
  /** `?settlements=1`: people stand in households of about 4-5 round their group's spot (layers/households.ts). */
  households?: boolean;
  /** The daily routine's plan hour (lib/routine.ts `epochHour`), or null for the old always-the-same gait (`?routine=1`). */
  routineEpoch?: number | null;
  /** `?shelters=1`: the dwelling table; the dwellings in view are returned as `shelters` (layers/shelters.ts). Null: none. */
  dwellings?: DwellingTable | null;
  /** The close-up draws 3D dwellings (`?shelters=1`): the households' flat house icons are left out, so the two are not drawn on top
   * of each other (the icons, blended additively, made a cream pancake of every village at zoom 12-14). */
  homes3d?: boolean;
  /** The close-up 3D ground is drawn: people stand on its drawn height (lib/groundHeights.ts drawnGroundZ), where the dwellings and fields are. */
  onGround?: boolean;
  /** `?fields=1`: return the groups in view as `inView` for the land round them (layers/fields.ts). */
  fields?: boolean;
  /** `?smoke=1`: the hearths in view are returned as `hearths` (lib/hearths.ts). */
  smoke?: boolean;
  setFeatureCount: (v: number) => void;
  setTotalPopulation: (v: number) => void;
  setMetricsLoading: (v: boolean) => void;
}): {
  layers: LayersList;
  grid: GridData | null;
  /** `?pastwater=1`: groups the model could not place at this year (all lake), or undefined when it did not run. */
  unresolved: YearGrid['units']['unresolved'];
  blend: ViewBlend;
  /** Data years being fetched/decoded for what's on screen, or null when ready. */
  loading: [number, number] | null;
  /** The people drawn at full strength (present at both data years): what name tags are for. */
  people: readonly Person[];
  scenePeople: readonly Person[];
  /** One dwelling per household in view, and roof clusters for towns, at the nearer data year (`?shelters=1`; else empty). */
  shelters: readonly Shelter[];
  /** The groups and towns in view at the nearer data year (`?shelters=1`, `?fields=1` or `?smoke=1`, people drawn); else null. */
  inView: GroupsInView | null;
  /** One hearth per household in view, where its dwelling would stand (`?smoke=1`; else empty). */
  hearths: readonly Hearth[];
} {
  const blend = viewBlend(view.zoom, mode);
  const style: GridStyle = mode === 'grid' ? 'grid' : 'units';
  const marksOn = enabled && (mode === 'grid' || blend.units > 0);
  // Approaching the groups' zoom from the far-out fires: build their data before it is drawn.
  const unitsSoon = enabled && mode !== 'grid' && view.zoom >= ZOOM.unitsIn - UNITS_PREFETCH_ZOOMS;
  // Keep the region while it covers the screen; mutate-in-render is idempotent.
  const regionRef = useRef<Region | null>(null);
  regionRef.current =
    !(marksOn || unitsSoon) || mode === 'grid'
      ? null
      : nextRegion(
          regionRef.current,
          viewBounds(view, size.width, size.height),
          globe ? 0.6 : 0.25,
        );
  const region = regionRef.current ?? WORLD;

  const [grid, setGrid] = useState<YearGrid | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [ready, setReady] = useState<Scene | null>(null);
  // Continuous time draws units as one morph between the data years either
  // side of `time` (below), so the discrete year cross-fade is off for them.
  const unitsContinuous = time !== undefined && marksOn && style === 'units';
  // The unit morph is built from the prefetch zoom on (and kept while there), drawn only once the groups fade in.
  const morphWanted = time !== undefined && (marksOn || unitsSoon) && style === 'units';
  const frames = useYearCrossfade(ready, marksOn && !unitsContinuous);
  // Continuous time: the data years either side of `time`.
  const { y0, y1, f } = bracket(time ?? year);
  const [morphScene, setMorphScene] = useState<{
    y0: number;
    y1: number;
    region: Region;
    data: MorphPoints;
    citiesFrom: AllocatedCity[];
    citiesTo: AllocatedCity[];
  } | null>(null);
  useEffect(() => {
    if (!morphWanted) {
      setMorphScene(null);
      return;
    }
    let live = true;
    Promise.all([loadUnitMorph(y0, y1, region, season), loadGrid(y0), loadGrid(y1)])
      .then(([data, from, to]) => {
        if (live) setMorphScene({ y0, y1, region, data, citiesFrom: from.cities ?? [], citiesTo: to.cities ?? [] });
      })
      .catch((error) => console.warn('[grid] failed to morph', y0, y1, error));
    return () => {
      live = false;
    };
  }, [morphWanted, y0, y1, region, season]);
  const morphLayer = useMemo(
    () =>
      morphScene
        ? new GridYearLayer({
            id: `units-continuous@${regionKey(morphScene.region)}`,
            data: morphScene.data,
            units: true,
            morph: true,
            year: morphScene.y1,
            fromYear: morphScene.y0,
            minPx: 1,
            brightness: 1,
            progress: 0,
            pickable: false,
            onReady: () => {},
          })
        : null,
    [morphScene],
  );
  // While the next pair builds, hold the old morph at its nearer end.
  const morphProgress = morphScene
    ? morphScene.y0 === y0 && morphScene.y1 === y1
      ? f
      : (time ?? year) > morphScene.y1
        ? 1
        : 0
    : 0;
  const target = useRef(scene);
  target.current =
    scene?.year === year && scene.style === style && scene.region === region
      ? scene
      : null;
  useEffect(() => {
    if (!marksOn) {
      setReady(null);
      setScene(null);
    }
  }, [marksOn]);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setMetricsLoading(true);
    loadGrid(year)
      .then((snapshot) => {
        if (!live) return;
        setGrid(snapshot);
        setTotalPopulation(snapshot.data.total);
        setFeatureCount(
          style === 'units' ? snapshot.units.length : snapshot.data.length,
        );
        setMetricsLoading(false);
        const index = PEOPLE_YEARS.indexOf(year);
        for (const neighbour of [
          PEOPLE_YEARS[index - 1],
          PEOPLE_YEARS[index + 1],
        ]) {
          if (neighbour !== undefined)
            void loadGrid(neighbour).catch((error) =>
              console.warn('[grid] prefetch failed', neighbour, error),
            );
        }
      })
      .catch((error) => {
        if (live) {
          setMetricsLoading(false);
          console.warn('[grid] failed to load', year, error);
        }
      });
    return () => {
      live = false;
    };
  }, [
    year,
    enabled,
    style,
    setFeatureCount,
    setTotalPopulation,
    setMetricsLoading,
  ]);

  // Prepare a union against the year that will actually precede it. A queued
  // request waits for the active fade, so rapid reversal cannot use stale endpoints.
  useEffect(() => {
    if (unitsContinuous || !marksOn || !grid || grid.year !== year || frames.length === 2)
      return;
    if (
      grid.year === ready?.year &&
      style === ready.style &&
      region === ready.region
    )
      return;
    let live = true;
    const fromYear = ready?.year ?? grid.year;
    const data =
      style === 'units'
        ? loadUnitMorph(fromYear, grid.year, region)
        : Promise.resolve(grid.gridPoints);
    data
      .then((data) => {
        if (live) setScene({ year: grid.year, fromYear, data, style, region });
      })
      .catch((error) => {
        if (live) console.warn('[grid] failed to prepare transition', error);
      });
    return () => {
      live = false;
    };
  }, [
    unitsContinuous,
    marksOn,
    year,
    grid,
    ready?.year,
    ready?.style,
    ready?.region,
    frames.length,
    style,
    region,
  ]);

  const first = frames[0]?.snapshot;
  const second = frames[1]?.snapshot;
  const staging =
    scene !== ready &&
    target.current === scene &&
    frames.length < 2 &&
    scene?.fromYear === (ready?.year ?? scene?.year)
      ? scene
      : null;
  const layers = useMemo(
    () =>
      [first, second, staging, ready]
        .filter(
          (snapshot, index, snapshots) =>
            snapshot && snapshots.indexOf(snapshot) === index,
        )
        .flatMap((snapshot) =>
          snapshot
            ? [
                {
                  snapshot,
                  layer: new GridYearLayer({
                    id: `${snapshot.style}-${snapshot.year}${snapshot.style === 'units' ? `@${regionKey(snapshot.region)}` : ''}`,
                    data: snapshot.data,
                    units: snapshot.style === 'units',
                    morph: snapshot.style === 'units',
                    year: snapshot.year,
                    fromYear: snapshot.fromYear,
                    minPx: 1,
                    brightness: 1,
                    progress: 1,
                    pickable: false,
                    onReady: () => {
                      if (target.current === snapshot) setReady(snapshot);
                    },
                  }),
                },
              ]
            : [],
        ),
    [first, second, staging, ready],
  );

  // The groups take over from the fires only once their data is in: until then the fires stay at full strength (no empty map
  // while it builds), and then the two cross-fade over HANDOVER_MS whatever the zoom is doing.
  const handover = useHandover(!unitsContinuous || !!morphScene);
  const units = blend.units * handover;
  const shownBlend = useMemo(
    () => ({ ...blend, units, glow: 1 - (1 - blend.glow) * handover }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blend.glow, blend.units, blend.minPx, blend.brightness, blend.pickable, blend.people, blend.settle, blend.halo, handover],
  );
  const { minPx, brightness, pickable } = blend;

  // Street-level zoom: the bands and villages in view become individual people.
  const peopleOn = unitsContinuous && blend.people > 0 && !!morphScene;
  // The box the people, homes, fields and hearths are built for: the view grown by half its size each way, kept while the view
  // stays inside it. Snapping the view to 0.02° rebuilt them (a scan of every group of the year and a re-upload of every
  // footprint) every ~150 px of a pan at street zoom; now only when the view leaves the box, or the box grows far past it.
  const peopleBox = useRef<Region | null>(null);
  // Close in, camps and villages near a mapped river stand on its bank (lib/campSiting.ts): the rivers load with the close-up anyway.
  const [rivers, setRivers] = useState<Rivers | null>(null);
  useEffect(() => {
    if (!peopleOn || rivers) return;
    let live = true;
    loadRivers().then((r) => live && setRivers(r)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [peopleOn, rivers]);
  const sited = (lon: number, lat: number, kind: number): [number, number] =>
    kind === UnitKind.Glow ? [lon, lat] : siteByWater(rivers, lon, lat);
  const viewBox = peopleOn ? viewBounds(view, size.width, size.height) : null;
  peopleBox.current = viewBox ? stickyBox(peopleBox.current, viewBox) : null; // idempotent: mutate-in-render as regionRef above
  const bounds = peopleBox.current;
  const boundsKey = bounds ? [bounds.west, bounds.south, bounds.east, bounds.north].join() : '';
  const people = useMemo(() => {
    if (!peopleOn || !morphScene || !bounds) return null;
    const pad = 0.05;
    const { west, south, east, north } = bounds;
    const pos = morphScene.data.attributes.getPosition.value;
    const { kind, people: to, fromPeople: from } = morphScene.data.info;
    const groups: MorphGroupInView[] = [];
    for (let i = 0; i < kind.length; i++) {
      const lon = pos[i * 2];
      const lat = pos[i * 2 + 1];
      if (lon < west - pad || lon > east + pad || lat < south - pad || lat > north + pad) continue;
      if (from[i] > 0 || to[i] > 0) {
        const [x, y] = sited(lon, lat, kind[i]);
        groups.push({ lon: x, lat: y, kind: kind[i], from: from[i], to: to[i] });
      }
    }
    return peopleForMorph(groups, morphScene.y1, households ? 'households' : 'hearths');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleOn, morphScene, boundsKey, households, rivers]);
  const nearerPart = morphProgress < 0.5 ? 'leaving' : 'entering';
  const scenePeople = useMemo(() => people ? [...people.steady, ...people[nearerPart]] : NO_PEOPLE, [people, nearerPart]);
  // The groups and towns in view at the nearer data year, for the dwellings (`?shelters=1`), the land round them (`?fields=1`) and hearths
  // (`?smoke=1`), so a roof, a field or a fire never stands without its people. Rebuilt only when the snapped view box, the scene or the nearer year changes.
  const nearTo = morphProgress >= 0.5;
  const inView = useMemo((): GroupsInView | null => {
    if ((!dwellings && !fields && !smoke) || !peopleOn || !morphScene || !bounds) return null;
    const pad = 0.05;
    const { west, south, east, north } = bounds;
    const within = (lon: number, lat: number) => lon >= west - pad && lon <= east + pad && lat >= south - pad && lat <= north + pad;
    const pos = morphScene.data.attributes.getPosition.value;
    const { kind, people: to, fromPeople: from, society } = morphScene.data.info;
    const year = nearTo ? morphScene.y1 : morphScene.y0;
    const groups: ShelterGroup[] = [];
    const towns: TownInView[] = [];
    for (let i = 0; i < kind.length; i++) {
      const lon = pos[i * 2];
      const lat = pos[i * 2 + 1];
      const count = nearTo ? to[i] : from[i];
      if (count <= 0 || !within(lon, lat)) continue;
      if (kind[i] === UnitKind.Glow) towns.push({ lon, lat, people: count, society: society[i] });
      else {
        const [x, y] = sited(lon, lat, kind[i]);
        groups.push({ lon: x, lat: y, kind: kind[i], people: count, society: society[i] });
      }
    }
    for (const city of nearTo ? morphScene.citiesTo : morphScene.citiesFrom)
      if (city.people > 0 && within(city.position[0], city.position[1])) towns.push({ lon: city.position[0], lat: city.position[1], people: city.people });
    return { year, groups, towns };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dwellings, fields, smoke, peopleOn, morphScene, boundsKey, nearTo, rivers]);
  const shelters = useMemo(
    () => (dwellings && inView
      ? [...sheltersForGroups(inView.groups, inView.year, dwellings), ...inView.towns.flatMap((town) => sheltersForTown(town, inView.year, dwellings))]
      : NO_SHELTERS),
    [dwellings, inView],
  );
  const hearths = useMemo(
    () => (smoke && inView ? hearthsForView(inView.groups, inView.towns, inView.year) : NO_HEARTHS),
    [smoke, inView],
  );
  // Three layers share the people; only their opacity follows the year fraction, so
  // scrubbing changes uniforms and never rebuilds them. A group's people at both
  // years stay put; the ones that leave or arrive fade out or in.
  const groundVer = useSyncExternalStore(subscribeGround, groundVersion, groundVersion);
  const peopleLayers = useMemo(
    () =>
      people
        ? (['steady', 'leaving', 'entering'] as const).map(
            (part) => {
              const routine = routineProps(routineEpoch);
              return new PeopleLayer({
                id: part === 'steady' ? 'people' : `people-${part}`,
                data: footprintData(people[part]),
                ...routine,
                ...(onGround ? { getPosition: (p: unknown) => { const [lon, lat] = (p as Person).position; return [lon, lat, drawnGroundZ(lon, lat)]; } } : {}),
                updateTriggers: { ...routine.updateTriggers, getPosition: onGround ? groundVer : 0 },
              });
            },
          )
        : [],
    [people, routineEpoch, onGround, groundVer],
  );
  const cityLayers = useMemo(() => {
    const cities = (unitsContinuous && morphScene
      ? blendCities(morphScene.citiesFrom, morphScene.citiesTo, morphProgress)
      : grid?.cities ?? []).filter((city) => city.people > 0);
    if (!enabled || style !== 'units' || !cities.length) return [];
    return buildCityLayers(cities, units, view.zoom);
  }, [grid, enabled, style, units, view.zoom, unitsContinuous, morphScene, morphProgress]);
  // The flat households give way to the close-up's 3D dwellings only once those are built (from street zoom, with the people).
  // Keyed on `homes3d` alone, the groups drew nothing but a faint wash from the close-up's start (zoom 8, CLOSE3D_ZOOM) to street zoom.
  const homesIn3d = homes3d && shelters.length > 0;
  const layerList = useMemo(() => {
    if (!enabled) return [];
    if (unitsContinuous) {
      return [
        ...(morphLayer
          ? [
              morphLayer.clone({
                opacity: units * (1 - blend.people),
                progress: morphProgress,
                minPx,
                brightness,
                pickable,
                settle: blend.settle,
                halo: blend.halo,
                homes: homesIn3d ? 0 : 1,
                visible: units > 0 && blend.people < 1,
              }),
            ]
          : []),
        ...peopleLayers.map((layer, part) =>
          layer.clone({
            // Prints are drawn in pixels (7.5 px for an adult): full size from zoom 16, smaller further out, so a village's hundreds of
            // people do not merge into one pale patch at zoom 12-14 (before 2026-11-28 they kept 7.5 px down to zoom 11.5).
            radiusScale: Math.min(1, Math.max(0.35, 2 ** ((view.zoom - 16) * 0.6))),
            // Close in the newest print becomes the person seen from above, with a shadow (people.ts FIGURE_ZOOM).
            topdown: figureBlend(view.zoom),
            opacity: blend.people * (part === 0 ? 1 : part === 1 ? 1 - morphProgress : morphProgress),
            visible: blend.people > 0 && (part === 0 || (part === 1 ? morphProgress < 1 : morphProgress > 0)),
          }),
        ),
      ];
    }
    const markList = layers.map(({ snapshot, layer }) => {
      const frame = frames.find((frame) => frame.snapshot === snapshot);
      // The incoming union already contains the outgoing marks. Draw it alone;
      // persistent bands retain full alpha while only gains/losses fade.
      const modeChanged = second && first?.style !== second.style;
      const superseded =
        (second?.style === 'units' || modeChanged) && snapshot !== second;
      const eased = frame ? Math.pow(frame.opacity, 2.2) : 0;
      return layer.clone(
        snapshot.style === 'units'
          ? {
              opacity: frame ? units : 0,
              progress: modeChanged ? 1 : eased,
              minPx,
              brightness,
              homes: homesIn3d ? 0 : 1,
              pickable: pickable && frame?.opacity === 1,
              visible: !!frame && !superseded && units > 0,
            }
          : {
              opacity: frame ? (modeChanged ? 1 : eased) : 0,
              visible: !!frame && !superseded,
            },
      );
    });
    return markList;
  }, [
    enabled,
    unitsContinuous,
    morphLayer,
    morphProgress,
    peopleLayers,
    blend.people,
    layers,
    frames,
    first,
    second,
    units,
    minPx,
    brightness,
    pickable,
    homesIn3d,
  ]);
  // What the view is waiting on: zoomed in, the unit morph for the visible region.
  const unitsWaiting =
    unitsContinuous &&
    units > 0 &&
    !(
      morphScene &&
      morphScene.y0 === y0 &&
      morphScene.y1 === y1 &&
      morphScene.region === region
    );
  return {
    layers: [...layerList, ...cityLayers],
    grid: enabled && grid?.year === year ? grid.data : null,
    unresolved: enabled && grid?.year === year ? grid.units.unresolved : undefined,
    blend: shownBlend,
    loading: unitsWaiting ? [y0, y1] : null,
    people: people?.steady ?? NO_PEOPLE,
    scenePeople,
    shelters,
    inView,
    hearths,
  };
}

/** `prev` while it still holds `view` and is under ten times its area; else `view` grown by half its width and height each way. */
export function stickyBox(prev: Region | null, view: Region): Region {
  const w = view.east - view.west;
  const h = view.north - view.south;
  if (prev && view.west >= prev.west && view.east <= prev.east && view.south >= prev.south && view.north <= prev.north
    && (prev.east - prev.west) * (prev.north - prev.south) <= 10 * w * h) return prev;
  return { west: view.west - w / 2, east: view.east + w / 2, south: Math.max(-90, view.south - h / 2), north: Math.min(90, view.north + h / 2) };
}
