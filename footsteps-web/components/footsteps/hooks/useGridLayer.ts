import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayersList } from '@deck.gl/core';
import { TARGET_YEARS } from '@/lib/constants';
import { type GridData, type PointBuffers, type YearGrid } from './gridData';
import { loadGrid, loadUnitMorph } from './gridLoader';
import type { MorphPoints } from './unitMorph';
import useYearCrossfade from './useYearCrossfade';
import GridYearLayer from '../layers/GridYearLayer';

export { gridUrl, type GridData, type YearGrid } from './gridData';
export { loadGrid } from './gridLoader';
export type GridStyle = 'grid' | 'units';
type Scene = {
  year: number;
  fromYear: number;
  data: PointBuffers | MorphPoints;
  style: GridStyle;
  zoomBucket: number;
};

export default function useGridLayer({
  year,
  enabled,
  style = 'grid',
  zoom = 1,
  setFeatureCount,
  setTotalPopulation,
  setMetricsLoading,
}: {
  year: number;
  enabled: boolean;
  style?: GridStyle;
  zoom?: number;
  setFeatureCount: (v: number) => void;
  setTotalPopulation: (v: number) => void;
  setMetricsLoading: (v: boolean) => void;
}): { layers: LayersList; grid: GridData | null } {
  const [grid, setGrid] = useState<YearGrid | null>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [ready, setReady] = useState<Scene | null>(null);
  const frames = useYearCrossfade(ready, enabled);
  const zoomBucket = style === 'grid' ? 0 : zoom < 3 ? 0 : zoom < 5 ? 1 : 2;
  const target = useRef(scene);
  target.current =
    scene?.year === year &&
    scene.style === style &&
    scene.zoomBucket === zoomBucket
      ? scene
      : null;
  useEffect(() => {
    if (!enabled) {
      setReady(null);
      setScene(null);
    }
  }, [enabled]);

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
    if (!enabled || !grid || grid.year !== year || frames.length === 2) return;
    if (
      grid.year === ready?.year &&
      style === ready.style &&
      zoomBucket === ready.zoomBucket
    )
      return;
    let live = true;
    const fromYear = ready?.year ?? grid.year;
    const data =
      style === 'units'
        ? loadUnitMorph(fromYear, grid.year, zoomBucket)
        : Promise.resolve(grid.gridPoints);
    data
      .then((data) => {
        if (live)
          setScene({ year: grid.year, fromYear, data, style, zoomBucket });
      })
      .catch((error) => {
        if (live) console.warn('[grid] failed to prepare transition', error);
      });
    return () => {
      live = false;
    };
  }, [
    enabled,
    year,
    grid,
    ready?.year,
    ready?.style,
    ready?.zoomBucket,
    frames.length,
    style,
    zoomBucket,
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
                    id: `${snapshot.style}-${snapshot.year}${snapshot.zoomBucket ? `/zoom-${snapshot.zoomBucket}` : ''}`,
                    data: snapshot.data,
                    units: snapshot.style === 'units',
                    morph: snapshot.style === 'units',
                    year: snapshot.year,
                    fromYear: snapshot.fromYear,
                    zoomBucket: snapshot.zoomBucket,
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

  const layerList = useMemo(
    () =>
      enabled
        ? layers.map(({ snapshot, layer }) => {
            const frame = frames.find((frame) => frame.snapshot === snapshot);
            // The incoming union already contains the outgoing marks. Draw it alone;
            // persistent bands retain full alpha while only gains/losses fade.
            const modeChanged = second && first?.style !== second.style;
            const superseded =
              (second?.style === 'units' || modeChanged) && snapshot !== second;
            return layer.clone({
              opacity: frame
                ? modeChanged
                  ? 1
                  : Math.pow(frame.opacity, 2.2)
                : 0,
              visible: !!frame && !superseded,
            });
          })
        : [],
    [enabled, layers, frames, first, second],
  );
  return {
    layers: layerList,
    grid: enabled && grid?.year === year ? grid.data : null,
  };
}
