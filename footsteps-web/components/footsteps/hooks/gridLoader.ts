import { type GridData, type YearGrid } from './gridData';
import { type GridReply } from './gridWorker';
import { createGridWorker } from './gridWorkerClient';
import type { MorphPoints } from './unitMorph';
import type { Region } from './unitRegion';
import type { Season } from '@/lib/seasons';

// Only settled snapshots count against the LRU. In-flight requests are always
// deduplicated, including during a fast sweep beyond the five cached years.
const cache = new Map<number, YearGrid>();
const pending = new Map<
  number,
  {
    promise: Promise<YearGrid>;
    resolve: (snapshot: YearGrid) => void;
    reject: (error: Error) => void;
  }
>();
const CACHE_YEARS = 5;
let worker: Worker | null = null;
const morphs = new Map<
  string,
  { resolve: (data: MorphPoints) => void; reject: (error: Error) => void }
>();
let morphId = 0;
// A year's decoded grid arrives before its units (the settlement model, which waits on the site and water images):
// the far-out firelight needs only the grid, so it draws as soon as it is in. Held until the year's full snapshot lands.
const early = new Map<number, GridData>();
const dataWaiters = new Map<number, ((data: GridData) => void)[]>();
function settleData(year: number, data: GridData) {
  const waiters = dataWaiters.get(year);
  dataWaiters.delete(year);
  waiters?.forEach((resolve) => resolve(data));
}

/** The year's decoded grid (people per cell, way of life), without waiting for its units. */
export function loadGridData(year: number): Promise<GridData> {
  const ready = cache.get(year)?.data ?? early.get(year);
  if (ready) return Promise.resolve(ready);
  const full = loadGrid(year); // starts (or joins) the year's request
  return new Promise((resolve, reject) => {
    dataWaiters.set(year, [...(dataWaiters.get(year) ?? []), resolve]);
    full.then((snapshot) => settleData(year, snapshot.data), reject);
  });
}

export async function loadUnitMorph(
  fromYear: number,
  toYear: number,
  region: Region,
  season: Season = 'off',
): Promise<MorphPoints> {
  // Establish the worker and its endpoint data through the ordinary loader.
  await loadGrid(toYear);
  const id = `morph-${++morphId}`;
  return new Promise((resolve, reject) => {
    morphs.set(id, { resolve, reject });
    worker!.postMessage({ id, fromYear, toYear, region, season });
  });
}

export function loadGrid(year: number): Promise<YearGrid> {
  const inFlight = pending.get(year);
  if (inFlight) return inFlight.promise;
  if (!worker) {
    worker = createGridWorker();
    worker.onmessage = ({ data }: MessageEvent<GridReply>) => {
      if ('id' in data) {
        const request = morphs.get(data.id);
        morphs.delete(data.id);
        if ('error' in data) request?.reject(new Error(data.error));
        else request?.resolve(data.morph);
        return;
      }
      if ('data' in data) {
        if (!pending.has(data.year)) return;
        early.set(data.year, data.data);
        settleData(data.year, data.data);
        return;
      }
      early.delete(data.year);
      const request = pending.get(data.year);
      if (!request) return;
      pending.delete(data.year);
      if ('error' in data) {
        dataWaiters.delete(data.year);
        request.reject(new Error(data.error));
        return;
      }
      settleData(data.year, data.snapshot.data);
      cache.set(data.year, data.snapshot);
      if (cache.size > CACHE_YEARS) cache.delete(cache.keys().next().value!);
      request.resolve(data.snapshot);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message);
      for (const request of pending.values()) request.reject(error);
      pending.clear();
      early.clear();
      dataWaiters.clear();
      for (const request of morphs.values()) request.reject(error);
      morphs.clear();
      worker?.terminate();
      worker = null;
    };
  }
  const cached = cache.get(year);
  if (cached) {
    cache.delete(year);
    cache.set(year, cached);
    return Promise.resolve(cached);
  }
  let resolve!: (snapshot: YearGrid) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<YearGrid>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  pending.set(year, { promise, resolve, reject });
  worker.postMessage({ year });
  return promise;
}
