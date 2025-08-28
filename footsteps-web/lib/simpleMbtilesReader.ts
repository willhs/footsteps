/**
 * HTTP Range-based MBTiles reader using sql.js-httpvfs
 *
 * This implementation queries remote MBTiles over HTTP byte-range requests
 * without downloading the entire file.
 */

import fs from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import { createRequire } from 'module';

interface TileData {
  data: Buffer;
  timestamp: number;
}

// Cache tiles for 1 hour
const CACHE_TTL_MS = 60 * 60 * 1000;
const tile_cache = new Map<string, TileData>();

function isExpired(entry: TileData): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS;
}

export class SimpleMBTilesReader {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Query a single tile via sql.js-httpvfs against the remote MBTiles.
   */
  async getTile(z: number, x: number, tmsY: number): Promise<Buffer | null> {
    const tileKey = `${this.url}:${z}:${x}:${tmsY}`;
    const cached = tile_cache.get(tileKey);
    if (cached && !isExpired(cached)) return cached.data;

    try {
      // Lazy import to avoid cold start penalties
      const mod = await import('sql.js-httpvfs');
      const createDbWorker: (...args: any[]) => Promise<any> = (mod as any).createDbWorker || (mod as any).default?.createDbWorker;
      if (!createDbWorker) throw new Error('sql.js-httpvfs createDbWorker not available');

      // Resolve worker/wasm URLs; prefer baked/container paths, then node_modules, else CDN
      const CDN_WORKER = 'https://unpkg.com/sql.js-httpvfs@0.8.12/dist/sqlite.worker.js';
      const CDN_WASM = 'https://unpkg.com/sql.js-httpvfs@0.8.12/dist/sql-wasm.wasm';
      const req = createRequire(import.meta.url);
      const resolvePathToUrl = (specifier: string): string | null => {
        try { return pathToFileURL(req.resolve(specifier)).toString(); } catch { return null; }
      };

      let workerUrl: string;
      let wasmUrl: string;
      const hasDomWorker = typeof (globalThis as unknown as { Worker?: unknown }).Worker !== 'undefined';
      if (!hasDomWorker) {
        try {
          const nodeWorkerMod: any = await import('web-worker');
          (globalThis as any).Worker = nodeWorkerMod.default || nodeWorkerMod;
        } catch (e) {
          // Best-effort; worker creation may still succeed using file URLs
          console.warn('Failed to load web-worker polyfill in Node:', e);
        }
        const bakedWorkerPath = fs.existsSync('/app/sqljs/sqlite.worker.js') ? '/app/sqljs/sqlite.worker.js' : null;
        const resolvedWorkerPath = bakedWorkerPath || (() => { try { return req.resolve('sql.js-httpvfs/dist/sqlite.worker.js'); } catch { return null; } })();
        workerUrl = String(process.env.SQLJS_WORKER_URL || (resolvedWorkerPath ? pathToFileURL(resolvedWorkerPath).toString() : '') || CDN_WORKER);
        wasmUrl = String(process.env.SQLJS_WASM_URL || (fs.existsSync('/app/sqljs/sql-wasm.wasm') ? pathToFileURL('/app/sqljs/sql-wasm.wasm').toString() : '') || resolvePathToUrl('sql.js-httpvfs/dist/sql-wasm.wasm') || CDN_WASM);
      } else {
        const bakedWorker = fs.existsSync('/app/sqljs/sqlite.worker.js') ? pathToFileURL('/app/sqljs/sqlite.worker.js').toString() : null;
        const bakedWasm = fs.existsSync('/app/sqljs/sql-wasm.wasm') ? pathToFileURL('/app/sqljs/sql-wasm.wasm').toString() : null;
        workerUrl = String(process.env.SQLJS_WORKER_URL || bakedWorker || resolvePathToUrl('sql.js-httpvfs/dist/sqlite.worker.js') || CDN_WORKER);
        wasmUrl = String(process.env.SQLJS_WASM_URL || bakedWasm || resolvePathToUrl('sql.js-httpvfs/dist/sql-wasm.wasm') || CDN_WASM);
      }

      const requestChunkSize = Number(process.env.SQLJS_REQUEST_CHUNK_SIZE || 65536);
      const config = {
        from: 'inline',
        config: { serverMode: 'full', requestChunkSize, url: this.url },
      } as const;

      const timeoutMs = Number(process.env.SQLJS_HTTPVFS_TIMEOUT_MS || 5000);
      const worker = await Promise.race([
        createDbWorker([config], String(workerUrl), String(wasmUrl)),
        new Promise((_, reject) => setTimeout(() => reject(new Error('httpvfs-worker-timeout')), timeoutMs)),
      ]);
      try {
        const sql = 'SELECT hex(tile_data) AS h FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1;';
        const res = await Promise.race([
          worker.db.exec(sql, [z, x, tmsY]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('httpvfs-exec-timeout')), timeoutMs)),
        ]);
        const hex: unknown = Array.isArray(res) && res.length > 0 && res[0] && Array.isArray(res[0].values) && res[0].values[0]
          ? res[0].values[0][0]
          : null;
        if (typeof hex === 'string' && hex.length > 0) {
          const buf = Buffer.from(hex, 'hex');
          tile_cache.set(tileKey, { data: buf, timestamp: Date.now() });
          return buf;
        }
        return null;
      } finally {
        try { if (worker && worker.worker && typeof worker.worker.terminate === 'function') worker.worker.terminate(); } catch { /* ignore */ }
      }
    } catch (err) {
      console.warn('sql.js-httpvfs MBTiles reader failed:', err);
      return null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      // Probe first bytes; if range-supported, we should read SQLite header via HTTP
      const head = await fetch(this.url, { method: 'HEAD' });
      if (!head.ok) return false;
      const acceptRanges = (head.headers.get('accept-ranges') || '').toLowerCase();
      if (!acceptRanges.includes('bytes')) {
        // Fallback: small ranged GET probe
        const get = await fetch(this.url, { headers: { Range: 'bytes=0-0', 'Accept-Encoding': 'identity' } });
        if (get.status !== 206 && !(get.headers.get('content-range') || '').startsWith('bytes ')) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    // No persistent resources to close
  }
}

/**
 * Factory function to create MBTiles reader
 */
export function createSimpleMBTilesReader(url: string): SimpleMBTilesReader | null {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return new SimpleMBTilesReader(url);
  }
  return null;
}

/**
 * Test if HTTP range requests are supported for a given URL
 */
export async function supportsRangeRequests(url: string): Promise<boolean> {
  try {
    // First, HEAD without a Range header: many servers (incl. GCS) respond 200 with Accept-Ranges: bytes
    const head = await fetch(url, { method: 'HEAD' });
    const acceptRanges = (head.headers.get('accept-ranges') || '').toLowerCase();
    const hasBytes = acceptRanges.includes('bytes');
    if (head.ok && hasBytes) return true;

    // Fallback probe: small ranged GET (1 byte) expecting 206 or Content-Range
    const get = await fetch(url, { headers: { Range: 'bytes=0-0', 'Accept-Encoding': 'identity' } });
    const contentRange = get.headers.get('content-range');
    if (get.status === 206 || (contentRange && contentRange.startsWith('bytes '))) {
      return true;
    }
    return false;
  } catch (e) {
    // Be conservative on error: signal no range support so callers can fall back
    return false;
  }
}

/**
 * Clear tile cache
 */
export function clearTileCache(): void {
  tile_cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  let validEntries = 0;
  let expiredEntries = 0;
  let totalSize = 0;

  for (const [, entry] of tile_cache) {
    if (isExpired(entry)) {
      expiredEntries++;
    } else {
      validEntries++;
      totalSize += entry.data.length;
    }
  }

  return {
    totalEntries: tile_cache.size,
    validEntries,
    expiredEntries,
    totalSizeBytes: totalSize,
  };
}
