import { type YearGrid } from './gridData';
import { type GridReply } from './gridWorker';
import { createGridWorker } from './gridWorkerClient';
import type { MorphPoints } from './unitMorph';

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

export async function loadUnitMorph(
  fromYear: number,
  toYear: number,
  zoomBucket: number,
): Promise<MorphPoints> {
  // Establish the worker and its endpoint data through the ordinary loader.
  await loadGrid(toYear);
  const id = `morph-${++morphId}`;
  return new Promise((resolve, reject) => {
    morphs.set(id, { resolve, reject });
    worker!.postMessage({ id, fromYear, toYear, zoomBucket });
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
      const request = pending.get(data.year);
      if (!request) return;
      pending.delete(data.year);
      if ('error' in data) {
        request.reject(new Error(data.error));
        return;
      }
      cache.set(data.year, data.snapshot);
      if (cache.size > CACHE_YEARS) cache.delete(cache.keys().next().value!);
      request.resolve(data.snapshot);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message);
      for (const request of pending.values()) request.reject(error);
      pending.clear();
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
