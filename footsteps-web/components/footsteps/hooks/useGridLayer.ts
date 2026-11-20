import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayersList } from '@deck.gl/core';
import { blendCities, type AllocatedCity } from '@/lib/settlements';
import type { DwellingTable } from '@/lib/dwellings';
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
  type PeopleMode,
  type ViewBlend,
} from './peopleView';
import useYearCrossfade from './useYearCrossfade';
import { bracket } from '@/lib/time';
import type { Season } from '@/lib/seasons';
import GridYearLayer from '../layers/GridYearLayer';
import {
  PeopleLayer,
  footprintData,
  peopleForMorph,
  routineProps,
  type MorphGroupInView,
  type Person,
} from '../layers/people';

const NO_PEOPLE: readonly Person[] = [];
const NO_SHELTERS: readonly Shelter[] = [];

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
  figures = false,
  dwellings = null,
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
  figures?: boolean;
  /** `?shelters=1`: the dwelling table; the dwellings in view are returned as `shelters` (layers/shelters.ts). Null: none. */
  dwellings?: DwellingTable | null;
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
} {
  const blend = viewBlend(view.zoom, mode);
  const style: GridStyle = mode === 'grid' ? 'grid' : 'units';
  const marksOn = enabled && (mode === 'grid' || blend.units > 0);
  // Keep the region while it covers the screen; mutate-in-render is idempotent.
  const regionRef = useRef<Region | null>(null);
  regionRef.current =
    !marksOn || mode === 'grid'
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
    if (!unitsContinuous) {
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
  }, [unitsContinuous, y0, y1, region, season]);
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

  const { units, minPx, brightness, pickable } = blend;

  // Street-level zoom: the bands and villages in view become individual people.
  const peopleOn = unitsContinuous && blend.people > 0 && !!morphScene;
  const snap = (v: number) => Math.round(v / 0.02) * 0.02;
  const bounds = peopleOn ? viewBounds(view, size.width, size.height) : null;
  const boundsKey = bounds
    ? [bounds.west, bounds.south, bounds.east, bounds.north].map(snap).join()
    : '';
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
      if (from[i] > 0 || to[i] > 0) groups.push({ lon, lat, kind: kind[i], from: from[i], to: to[i] });
    }
    return peopleForMorph(groups, morphScene.y1, households ? 'households' : 'hearths');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleOn, morphScene, boundsKey, households]);
  const nearerPart = morphProgress < 0.5 ? 'leaving' : 'entering';
  const scenePeople = useMemo(() => people ? [...people.steady, ...people[nearerPart]] : NO_PEOPLE, [people, nearerPart]);
  // Dwellings (`?shelters=1`): the same groups in view, read at the nearer data year, so a roof never stands without its people.
  const nearTo = morphProgress >= 0.5;
  const shelters = useMemo(() => {
    if (!dwellings || !peopleOn || !morphScene || !bounds) return NO_SHELTERS;
    const pad = 0.05;
    const { west, south, east, north } = bounds;
    const inView = (lon: number, lat: number) => lon >= west - pad && lon <= east + pad && lat >= south - pad && lat <= north + pad;
    const pos = morphScene.data.attributes.getPosition.value;
    const { kind, people: to, fromPeople: from, society } = morphScene.data.info;
    const year = nearTo ? morphScene.y1 : morphScene.y0;
    const groups: ShelterGroup[] = [];
    const towns: TownInView[] = [];
    for (let i = 0; i < kind.length; i++) {
      const lon = pos[i * 2];
      const lat = pos[i * 2 + 1];
      const count = nearTo ? to[i] : from[i];
      if (count <= 0 || !inView(lon, lat)) continue;
      if (kind[i] === UnitKind.Glow) towns.push({ lon, lat, people: count, society: society[i] });
      else groups.push({ lon, lat, kind: kind[i], people: count, society: society[i] });
    }
    for (const city of nearTo ? morphScene.citiesTo : morphScene.citiesFrom)
      if (city.people > 0 && inView(city.position[0], city.position[1])) towns.push({ lon: city.position[0], lat: city.position[1], people: city.people });
    return [...sheltersForGroups(groups, year, dwellings), ...towns.flatMap((town) => sheltersForTown(town, year, dwellings))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dwellings, peopleOn, morphScene, boundsKey, nearTo]);
  // Three layers share the people; only their opacity follows the year fraction, so
  // scrubbing changes uniforms and never rebuilds them. A group's people at both
  // years stay put; the ones that leave or arrive fade out or in.
  const peopleLayers = useMemo(
    () =>
      people
        ? (['steady', 'leaving', 'entering'] as const).map(
            (part) => new PeopleLayer({ id: part === 'steady' ? 'people' : `people-${part}`, data: footprintData(people[part]), ...routineProps(routineEpoch), figures }),
          )
        : [],
    [people, routineEpoch, figures],
  );
  const cityLayers = useMemo(() => {
    const cities = (unitsContinuous && morphScene
      ? blendCities(morphScene.citiesFrom, morphScene.citiesTo, morphProgress)
      : grid?.cities ?? []).filter((city) => city.people > 0);
    if (!enabled || style !== 'units' || !cities.length) return [];
    return buildCityLayers(cities, blend.units, view.zoom);
  }, [grid, enabled, style, blend.units, view.zoom, unitsContinuous, morphScene, morphProgress]);
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
                visible: units > 0 && blend.people < 1,
              }),
            ]
          : []),
        ...peopleLayers.map((layer, part) =>
          layer.clone({
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
    blend,
    loading: unitsWaiting ? [y0, y1] : null,
    people: people?.steady ?? NO_PEOPLE,
    scenePeople,
    shelters,
  };
}
