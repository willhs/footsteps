import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTileFilePath, getTilesBucketIfAvailable } from '@/lib/tilesService';
import { gunzipSync } from 'zlib';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { PMTiles } from 'pmtiles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MBTilesCtor = new (
  file: string,
  cb: (err: Error | null, mb: unknown) => void
) => void;
let mbtilesCtorPromise: Promise<MBTilesCtor | null> | null = null;
async function getMBTilesCtor(): Promise<MBTilesCtor | null> {
  if (!mbtilesCtorPromise) {
    mbtilesCtorPromise = (async () => {
      try {
        const mod = (await import('@mapbox/mbtiles')) as unknown as {
          default?: MBTilesCtor;
        } & MBTilesCtor;
        const ctor = (mod as unknown as { default?: MBTilesCtor }).default || (mod as unknown as MBTilesCtor);
        return ctor || null;
      } catch (error) {
        console.warn('Failed to load @mapbox/mbtiles module:', error);
        return null;
      }
    })();
  }
  return mbtilesCtorPromise;
}

// eslint-disable-next-line no-var
declare var global: typeof globalThis & {
  __mbtilesCache?: Map<string, unknown>;
  __httpvfsWorkers?: Map<string, { worker: any; lastUsed: number; url: string; ready: boolean; hasIndex?: boolean; pageSize?: number }>;
};
const mbtilesCache: Map<string, unknown> = global.__mbtilesCache || new Map();
global.__mbtilesCache = mbtilesCache;

// Cache sql.js-httpvfs workers by remote URL to keep page cache warm across requests
const httpvfsWorkers: Map<string, { worker: any; lastUsed: number; url: string; ready: boolean; hasIndex?: boolean; pageSize?: number }> =
  (global.__httpvfsWorkers = global.__httpvfsWorkers || new Map());

async function getOrCreateHttpVfsWorker(httpUrl: string): Promise<{ worker: any; meta: { hasIndex?: boolean; pageSize?: number; requestChunkSize: number } }> {
  const now = Date.now();
  const existing = httpvfsWorkers.get(httpUrl);
  if (existing && existing.ready) {
    existing.lastUsed = now;
    return { worker: existing.worker, meta: { hasIndex: existing.hasIndex, pageSize: existing.pageSize } };
  }

  const mod = await import('sql.js-httpvfs');
  const createDbWorker: (...args: any[]) => Promise<any> = (mod as any).createDbWorker || (mod as any).default?.createDbWorker;
  if (!createDbWorker) throw new Error('sql.js-httpvfs createDbWorker not available');

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
      console.warn('Failed to load web-worker polyfill in Node:', e);
    }
    const bakedWorkerPath = fs.existsSync('/app/sqljs/sqlite.worker.js') ? '/app/sqljs/sqlite.worker.js' : null;
    const resolvedWorkerPath = bakedWorkerPath || (() => { try { return req.resolve('sql.js-httpvfs/dist/sqlite.worker.js'); } catch { return null; } })();
    const resolvedWorkerFileUrl = resolvedWorkerPath ? pathToFileURL(resolvedWorkerPath).toString() : '';
    workerUrl = String(process.env.SQLJS_WORKER_URL || resolvedWorkerFileUrl || CDN_WORKER);
    wasmUrl = String(process.env.SQLJS_WASM_URL || (fs.existsSync('/app/sqljs/sql-wasm.wasm') ? pathToFileURL('/app/sqljs/sql-wasm.wasm').toString() : resolvePathToUrl('sql.js-httpvfs/dist/sql-wasm.wasm')) || CDN_WASM);
  } else {
    const bakedWorker = fs.existsSync('/app/sqljs/sqlite.worker.js') ? pathToFileURL('/app/sqljs/sqlite.worker.js').toString() : null;
    const bakedWasm = fs.existsSync('/app/sqljs/sql-wasm.wasm') ? pathToFileURL('/app/sqljs/sql-wasm.wasm').toString() : null;
    workerUrl = String(process.env.SQLJS_WORKER_URL || bakedWorker || resolvePathToUrl('sql.js-httpvfs/dist/sqlite.worker.js') || CDN_WORKER);
    wasmUrl = String(process.env.SQLJS_WASM_URL || bakedWasm || resolvePathToUrl('sql.js-httpvfs/dist/sql-wasm.wasm') || CDN_WASM);
  }

  const requestChunkSize = Number(process.env.SQLJS_REQUEST_CHUNK_SIZE || 262144);
  const timeoutMs = Number(process.env.SQLJS_HTTPVFS_TIMEOUT_MS || 30000);
  const config = { from: 'inline', config: { serverMode: 'full', requestChunkSize, url: httpUrl } } as const;

  const worker: any = await Promise.race([
    createDbWorker([config], String(workerUrl), String(wasmUrl)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('httpvfs-worker-timeout')), timeoutMs)),
  ]);

  // Optional diagnostics
  let hasIndex: boolean | undefined;
  let pageSize: number | undefined;
  try {
    // Modest page cache to cut range roundtrips
    await worker.db.exec('PRAGMA cache_size=8192;');
    await worker.db.exec('PRAGMA temp_store=MEMORY;');
  } catch {/* ignore */}
  try {
    const res1 = await worker.db.exec('PRAGMA page_size;');
    pageSize = Array.isArray(res1) && res1[0]?.values?.[0]?.[0] ? Number(res1[0].values[0][0]) : undefined;
  } catch {/* ignore */}
  try {
    const res2 = await worker.db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_tiles%';");
    hasIndex = Array.isArray(res2) && (res2[0]?.values?.length || 0) > 0;
  } catch {/* ignore */}
  if (hasIndex === false) {
    console.warn(`[HTTPVFS] No tiles index detected for ${httpUrl}. Remote queries may be slow.`);
  }

  httpvfsWorkers.set(httpUrl, { worker, lastUsed: now, url: httpUrl, ready: true, hasIndex, pageSize });
  return { worker, meta: { hasIndex, pageSize, requestChunkSize } };
}

// Cleanup stale workers periodically
setInterval(() => {
  const ttl = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  for (const [url, entry] of httpvfsWorkers) {
    if (now - entry.lastUsed > ttl) {
      try { entry.worker?.worker?.terminate?.(); } catch {/* ignore */}
      httpvfsWorkers.delete(url);
    }
  }
}, 120000).unref?.();

function yToTms(z: number, y: number): number {
  return (1 << z) - 1 - y;
}

// Legacy stub (MBTiles fallback removed). Kept to avoid top-level imports.
const execFileAsync = null as unknown as (
  cmd: string,
  args: string[],
  opts: unknown
) => Promise<{ stdout: string }>;

async function getTileViaSqliteCli(
  filepath: string,
  z: number,
  x: number,
  tmsY: number
): Promise<Buffer | null> {
  const sql = `SELECT hex(tile_data) FROM tiles WHERE zoom_level=${z} AND tile_column=${x} AND tile_row=${tmsY} LIMIT 1;`;
  try {
    const { stdout } = await execFileAsync('sqlite3', ['-readonly', filepath, sql], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const hex = stdout.trim();
    if (!hex) return null;
    return Buffer.from(hex, 'hex');
  } catch (error) {
    console.error(`SQLite CLI failed for tile z${z}/${x}/${tmsY}:`, error);
    return null;
  }
}

async function openMBTilesByPath(filepath: string): Promise<unknown> {
  const key = path.resolve(filepath);
  if (mbtilesCache.has(key)) return mbtilesCache.get(key) as unknown;
  await fs.promises.access(key, fs.constants.R_OK);
  const instance: unknown = await new Promise((resolve, reject) => {
    getMBTilesCtor().then((MBTilesCtor) => {
      if (!MBTilesCtor) return reject(new Error('MBTiles module unavailable'));
      new MBTilesCtor(key + '?mode=ro', (err, mb) => {
        if (err) return reject(err);
        resolve(mb);
      });
    });
  });
  mbtilesCache.set(key, instance);
  return instance;
}

function isGzip(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

class LocalFsRangeSource {
  filePath: string;
  constructor(filePath: string) { this.filePath = filePath; }
  getKey(): string { return this.filePath; }
  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
    const fh = await fs.promises.open(this.filePath, 'r');
    try {
      const buf = Buffer.allocUnsafe(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      const out = new ArrayBuffer(bytesRead);
      new Uint8Array(out).set(buf.subarray(0, bytesRead));
      return { data: out };
    } finally {
      await fh.close();
    }
  }
}

async function getTileViaLocalPMTiles(
  filepath: string,
  z: number,
  x: number,
  yXyz: number,
): Promise<Buffer | null> {
  try {
    const src = new LocalFsRangeSource(filepath);
    const pmt = new PMTiles(src as unknown as any);
    const res = await pmt.getZxy(z, x, yXyz);
    if (!res || !res.data) return null;
    return Buffer.from(res.data);
  } catch (e) {
    console.warn('Local PMTiles read failed:', e);
    return null;
  }
}

// Minimal HTTP Range source for PMTiles over GCS/HTTP
class HttpRangeSource {
  url: string;
  constructor(url: string) { this.url = url; }
  getKey(): string { return this.url; }
  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer; etag?: string; lastModified?: string; cacheControl?: string; expires?: string }> {
    const end = offset + length - 1;
    const res = await fetch(this.url, { headers: { Range: `bytes=${offset}-${end}`, 'Accept-Encoding': 'identity' } });
    if (!(res.status === 206 || res.ok)) throw new Error(`HTTP ${res.status} range ${offset}-${end}`);
    const ab = await res.arrayBuffer();
    return {
      data: ab,
      etag: res.headers.get('etag') || undefined,
      lastModified: res.headers.get('last-modified') || undefined,
      cacheControl: res.headers.get('cache-control') || undefined,
      expires: res.headers.get('expires') || undefined,
    };
  }
}

async function getTileViaHttpPMTiles(httpUrl: string, z: number, x: number, yXyz: number): Promise<Buffer | null> {
  try {
    const src = new HttpRangeSource(httpUrl);
    const pmt = new PMTiles(src as unknown as any);
    const res = await pmt.getZxy(z, x, yXyz);
    if (!res || !res.data) return null;
    return Buffer.from(res.data);
  } catch (e) {
    console.warn('HTTP PMTiles read failed:', e);
    return null;
  }
}

// Fetch a tile via HTTP Range-backed SQLite using sql.js-httpvfs
// This avoids downloading the entire MBTiles by issuing page-sized range requests.
async function getTileViaHttpVfs(
  httpUrl: string,
  z: number,
  x: number,
  tmsY: number,
): Promise<Buffer | null> {
  try {
    const { worker, meta } = await getOrCreateHttpVfsWorker(httpUrl);

    try {
      const sql = 'SELECT hex(tile_data) AS h FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1;';
      const timeoutMs = Number(process.env.SQLJS_HTTPVFS_TIMEOUT_MS || 30000);
      const res = await Promise.race([
        worker.db.exec(sql, [z, x, tmsY]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('httpvfs-exec-timeout')), timeoutMs)),
      ]);

      // sql.js-style result: [{ columns: ['h'], values: [[hex]] }]
      const hex: unknown = Array.isArray(res) && res.length > 0 && res[0] && Array.isArray(res[0].values) && res[0].values[0]
        ? res[0].values[0][0]
        : null;
      if (typeof hex === 'string' && hex.length > 0) {
        // Attach lightweight diagnostics for headers via symbol on buffer
        const out = Buffer.from(hex, 'hex');
        try {
          const bytesRead = await Promise.race([
            worker?.worker?.bytesRead,
            new Promise((resolve) => setTimeout(() => resolve(undefined), 50)),
          ]);
          (out as any).__httpvfs = {
            bytesRead: typeof bytesRead === 'number' ? bytesRead : undefined,
            hasIndex: meta?.hasIndex,
            pageSize: meta?.pageSize,
            requestChunkSize: meta?.requestChunkSize,
          };
        } catch {/* ignore */}
        return out;
      }
      return null;
    } finally {
      const entry = httpvfsWorkers.get(httpUrl);
      if (entry) entry.lastUsed = Date.now();
    }
  } catch (err) {
    console.warn('sql.js-httpvfs path failed, will fall back to download+sqlite:', err);
    return null;
  }
}

export async function GET(
  _request: Request,
  context: unknown
) {
  const { params: paramsPromise } = context as { params: Promise<{ year: string; z: string; x: string; y: string }> };
  const params = await paramsPromise;
  const { year, z, x } = params;
  const yRaw = params.y;
  const yStr = yRaw.endsWith('.pbf') ? yRaw.slice(0, -4) : yRaw;

  const yr = Number.parseInt(year, 10);
  const zz = Number.parseInt(z, 10);
  const xx = Number.parseInt(x, 10);
  const yy = Number.parseInt(yStr, 10);
  if (!Number.isInteger(yr) || !Number.isInteger(zz) || !Number.isInteger(xx) || !Number.isInteger(yy)) {
    return NextResponse.json({ error: 'Invalid path parameters' }, { status: 400 });
  }

  // If configured, redirect to static PBF tiles (legacy mode)
  const baseUrl = process.env.TILES_BASE_URL;
  if (baseUrl) {
    const dest = `${baseUrl}/${yr}/single/${zz}/${xx}/${yy}.pbf`;
    const res = NextResponse.redirect(dest, 302);
    res.headers.set('Cache-Control', 'public, max-age=3600');
    return res;
  }

  // Single-layer yearly tileset
  const tileFile = await getTileFilePath(yr, 0);
  if (!tileFile.exists) {
    return NextResponse.json({ error: 'Tileset not found for year' }, { status: 404 });
  }

  // Local development: prefer .pmtiles if present for fast access
  if (tileFile.isLocal) {
    const pmtilesPath = tileFile.path.replace(/\.mbtiles$/i, '.pmtiles');
    try {
      await fs.promises.access(pmtilesPath, fs.constants.R_OK);
      const tile = await getTileViaLocalPMTiles(pmtilesPath, zz, xx, yy);
      if (tile) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/x-protobuf',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': String(tile.length),
          'X-Tile-Zoom': String(zz),
          'X-Tile-X': String(xx),
          'X-Tile-Y': String(yy),
          'X-LOD-Source': 'single-pmtiles',
          'X-GCS-Source': 'false',
        };
        if (isGzip(tile)) headers['Content-Encoding'] = 'gzip';
        return new Response(new Uint8Array(tile), { headers });
      }
    } catch {
      // .pmtiles not present or unreadable; fall through to MBTiles
    }
  }

  // Production: PMTiles via HTTP range (no MBTiles fallback)
  if (!tileFile.isLocal) {
    // Build PMTiles URL under optional prefix
    const bucket = getTilesBucketIfAvailable();
    const prefix = process.env.PMTILES_PREFIX || 'pmtiles';
    const pmUrl = bucket
      ? `https://storage.googleapis.com/${bucket}/${prefix}/humans_${yr}.pmtiles`
      : (tileFile.httpUrl || '').replace(/\.mbtiles$/i, '.pmtiles');
    const tile = await getTileViaHttpPMTiles(pmUrl, zz, xx, yy);
    if (!tile) {
      return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=86400' } });
    }
    // Validate gzip integrity if applicable
    if (isGzip(tile)) {
      try { gunzipSync(tile); } catch { /* ignore inflate issues */ }
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-protobuf',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(tile.length),
      'X-Tile-Zoom': String(zz),
      'X-Tile-X': String(xx),
      'X-Tile-Y': String(yy),
      'X-LOD-Source': 'single-pmtiles',
      'X-GCS-Source': 'true',
    };
    if (isGzip(tile)) headers['Content-Encoding'] = 'gzip';
    return new Response(new Uint8Array(tile), { headers });
  }

  // If we reach here in local mode, local PMTiles was not available
  return NextResponse.json({ error: 'Local PMTiles not found' }, { status: 404 });
}
