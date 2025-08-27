import type { TileMetrics } from './tileMetrics';
import { aggregateTileMetrics, featuresFromTile } from './tileMetrics';

export interface WorkerRequest {
  id: string;
  serializedTileData: Array<{ count: number; population: number; }>;
}

export interface WorkerResponse {
  id: string;
  metrics: TileMetrics;
  error?: string;
}

type MetricsCallback = (metrics: TileMetrics) => void;

/**
 * Singleton worker manager for tile metrics calculation.
 * Handles request/response tracking to prevent race conditions.
 */
class TileMetricsWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, MetricsCallback>();
  private requestIdCounter = 0;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    if (typeof window === 'undefined') {
      return; // Server-side, no worker available
    }

    try {
      this.worker = new Worker(
        new URL('./tileMetrics.worker.ts', import.meta.url)
      );

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { id, metrics, error } = event.data;
        const callback = this.pendingRequests.get(id);
        
        if (callback) {
          this.pendingRequests.delete(id);
          if (error) {
            console.error('[WORKER-MANAGER] Worker error:', error);
            // Fallback to synchronous calculation on error
            this.calculateSync([], callback);
          } else {
            callback(metrics);
          }
        }
      };

      this.worker.onerror = (error) => {
        console.error('[WORKER-MANAGER] Worker error:', error);
        // Clear all pending requests and fall back to sync
        const callbacks = Array.from(this.pendingRequests.values());
        this.pendingRequests.clear();
        callbacks.forEach(callback => this.calculateSync([], callback));
      };
    } catch (error) {
      console.warn('[WORKER-MANAGER] Failed to initialize worker:', error);
      this.worker = null;
    }
  }

  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`;
  }

  private calculateSync(tiles: unknown[], callback: MetricsCallback) {
    try {
      const metrics = aggregateTileMetrics(tiles);
      callback(metrics);
    } catch (error) {
      console.error('[WORKER-MANAGER] Sync calculation error:', error);
      callback({ count: 0, population: 0 });
    }
  }

  /**
   * Calculate tile metrics, using worker if available, otherwise synchronous fallback.
   */
  calculateMetrics(tiles: unknown[], callback: MetricsCallback): void {
    if (!this.worker) {
      // No worker available, use synchronous calculation
      this.calculateSync(tiles, callback);
      return;
    }

    const requestId = this.generateRequestId();
    this.pendingRequests.set(requestId, callback);

    // Extract serializable data from tiles to avoid cloning issues with AbortController
    const serializedTileData = tiles.map(tile => {
      try {
        const features = featuresFromTile(tile);
        const count = features.length;
        const population = features.reduce((sum, feat) => {
          return sum + (Number(feat?.properties?.population) || 0);
        }, 0);
        return { count, population };
      } catch (error) {
        console.warn('[WORKER-MANAGER] Failed to serialize tile data:', error);
        return { count: 0, population: 0 };
      }
    });

    const request: WorkerRequest = {
      id: requestId,
      serializedTileData,
    };

    try {
      this.worker.postMessage(request);
    } catch (error) {
      console.error('[WORKER-MANAGER] Failed to post message:', error);
      this.pendingRequests.delete(requestId);
      this.calculateSync(tiles, callback);
    }
  }

  /**
   * Cleanup resources when no longer needed.
   */
  destroy(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }

  /**
   * Get number of pending requests (for debugging).
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }
}

// Singleton instance
let workerManagerInstance: TileMetricsWorkerManager | null = null;

/**
 * Get the singleton worker manager instance.
 */
export function getWorkerManager(): TileMetricsWorkerManager {
  if (!workerManagerInstance) {
    workerManagerInstance = new TileMetricsWorkerManager();
  }
  return workerManagerInstance;
}

/**
 * Destroy the worker manager (for cleanup in tests or when no longer needed).
 */
export function destroyWorkerManager(): void {
  if (workerManagerInstance) {
    workerManagerInstance.destroy();
    workerManagerInstance = null;
  }
}