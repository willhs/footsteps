import { aggregateTileMetrics } from './tileMetrics';
import type { TileMetrics } from './tileMetrics';

const ctx: DedicatedWorkerGlobalScope =
  self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<unknown[]>) => {
  try {
    const result: TileMetrics = aggregateTileMetrics(event.data);
    ctx.postMessage(result);
  } catch (error) {
    console.error('[TILE-METRICS-WORKER-ERROR]:', error);
    ctx.postMessage({ count: 0, population: 0 });
  }
};

export {};
