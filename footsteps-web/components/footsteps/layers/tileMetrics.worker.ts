import { aggregateTileMetrics } from './tileMetrics';
import type { TileMetrics } from './tileMetrics';
import type { WorkerRequest, WorkerResponse } from './WorkerManager';

const ctx: DedicatedWorkerGlobalScope =
  self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, tiles } = event.data;
  
  try {
    const metrics: TileMetrics = aggregateTileMetrics(tiles);
    const response: WorkerResponse = {
      id,
      metrics,
    };
    ctx.postMessage(response);
  } catch (error) {
    console.error('[TILE-METRICS-WORKER-ERROR]:', error);
    const response: WorkerResponse = {
      id,
      metrics: { count: 0, population: 0 },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    ctx.postMessage(response);
  }
};

export {};
