import type { TileMetrics } from './tileMetrics';
import type { WorkerRequest, WorkerResponse } from './WorkerManager';

const ctx: DedicatedWorkerGlobalScope =
  self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, serializedTileData } = event.data;
  
  try {
    // Aggregate the pre-computed metrics from serialized tile data
    const metrics: TileMetrics = serializedTileData.reduce(
      (acc, tileMetrics) => ({
        count: acc.count + tileMetrics.count,
        population: acc.population + tileMetrics.population,
      }),
      { count: 0, population: 0 }
    );
    
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
