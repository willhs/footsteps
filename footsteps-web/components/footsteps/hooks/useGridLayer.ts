import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayersList } from '@deck.gl/core';
import { TARGET_YEARS } from '@/lib/constants';
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
import GridYearLayer from '../layers/GridYearLayer';
import GlowLayer, { glowPair } from '../layers/GlowLayer';

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
 * zoom (see peopleView.ts): a density glow texture far out, unit marks for the
 * cells around the viewport closer in, cross-faded in between. */
export default function useGridLayer({
  year,
  time,
  onTerrain = false,
  enabled,
  mode = 'auto',
  view = { longitude: 0, latitude: 0, zoom: 1 },
  size = { width: 1440, height: 900 },
  globe = false,
  setFeatureCount,
  setTotalPopulation,
  setMetricsLoading,
}: {
  year: number;
  /** Continuous year: when set, the glow mixes the data years either side. */
  time?: number;
  /** Satellite terrain is under the people: raise the glow's minimum brightness. */
  onTerrain?: boolean;
  enabled: boolean;
  mode?: GridMode;
  view?: View;
  size?: { width: number; height: number };
  globe?: boolean;
  setFeatureCount: (v: number) => void;
  setTotalPopulation: (v: number) => void;
  setMetricsLoading: (v: boolean) => void;
}): { layers: LayersList; grid: GridData | null; blend: ViewBlend } {
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
  const continuous = time !== undefined;
  const glowFrames = useYearCrossfade(
    grid?.year === year ? grid : null,
    enabled && mode === 'auto' && !continuous,
  );
  // Continuous time: keep the two data years either side of `time` decoded.
  const { y0, y1, f } = bracket(time ?? year);
  const [pair, setPair] = useState<{ a: YearGrid; b: YearGrid } | null>(null);
  useEffect(() => {
    if (!continuous || !enabled || mode !== 'auto') return;
    let live = true;
    Promise.all([loadGrid(y0), loadGrid(y1)])
      .then(([a, b]) => {
        if (live) setPair({ a, b });
      })
      .catch((error) => console.warn('[grid] failed to load pair', y0, y1, error));
    return () => {
      live = false;
    };
  }, [continuous, enabled, mode, y0, y1]);

  const [morphScene, setMorphScene] = useState<{
    y0: number;
    y1: number;
    region: Region;
    data: MorphPoints;
  } | null>(null);
  useEffect(() => {
    if (!unitsContinuous) {
      setMorphScene(null);
      return;
    }
    let live = true;
    loadUnitMorph(y0, y1, region)
      .then((data) => {
        if (live) setMorphScene({ y0, y1, region, data });
      })
      .catch((error) => console.warn('[grid] failed to morph', y0, y1, error));
    return () => {
      live = false;
    };
  }, [unitsContinuous, y0, y1, region]);
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
        const index = TARGET_YEARS.indexOf(year);
        for (const neighbour of [
          TARGET_YEARS[index - 1],
          TARGET_YEARS[index + 1],
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

  // One glow layer for the (from, to) pair; the texture is rebuilt only when
  // the pair of years changes, not every fade frame.
  const glowFrom = continuous ? pair?.a : glowFrames[0]?.snapshot;
  const glowTo = continuous ? pair?.b : glowFrames[glowFrames.length - 1]?.snapshot;
  // While the next pair decodes, hold the old one at its nearer end.
  const pairCurrent = pair?.a.year === y0 && pair?.b.year === y1;
  const glowProgress = continuous
    ? pairCurrent
      ? f
      : pair && (time ?? year) > pair.b.year
        ? 1
        : 0
    : glowFrames.length > 1
      ? glowFrames[1].opacity
      : 1;
  const glowLayer = useMemo(
    () =>
      glowTo && glowFrom
        ? new GlowLayer({
            id: 'glow',
            image: glowPair(glowFrom.glow, glowTo.glow),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [glowFrom?.year, glowTo?.year],
  );

  const { glow, units, minPx, brightness, pickable } = blend;
  const layerList = useMemo(() => {
    if (!enabled) return [];
    const glowList = glowLayer
      ? [
          glowLayer.clone({
            progress: glowProgress,
            floor: onTerrain ? 0.16 : 0.1,
            opacity: glow,
            visible: glow > 0,
          }),
        ]
      : [];
    if (unitsContinuous) {
      return [
        ...glowList,
        ...(morphLayer
          ? [
              morphLayer.clone({
                opacity: units,
                progress: morphProgress,
                minPx,
                brightness,
                pickable,
                visible: units > 0,
              }),
            ]
          : []),
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
    return [...glowList, ...markList];
  }, [
    enabled,
    glowLayer,
    glowProgress,
    onTerrain,
    unitsContinuous,
    morphLayer,
    morphProgress,
    glow,
    layers,
    frames,
    first,
    second,
    units,
    minPx,
    brightness,
    pickable,
  ]);
  return {
    layers: layerList,
    grid: enabled && grid?.year === year ? grid.data : null,
    blend,
  };
}
