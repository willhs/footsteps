import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getTileFilePath, downloadTileFile, cleanupTempFile } from '@/lib/tilesService';
import { gunzipSync } from 'zlib';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';

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
declare var global: typeof globalThis & { __mbtilesCache?: Map<string, unknown> };
const mbtilesCache: Map<string, unknown> = global.__mbtilesCache || new Map();
global.__mbtilesCache = mbtilesCache;

function yToTms(z: number, y: number): number {
  return (1 << z) - 1 - y;
}

const execFileAsync = promisify(execFile);

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

// Fetch a tile via HTTP Range-backed SQLite using sql.js-httpvfs
// This avoids downloading the entire MBTiles by issuing page-sized range requests.
async function getTileViaHttpVfs(
  httpUrl: string,
  z: number,
  x: number,
  tmsY: number,
): Promise<Buffer | null> {
  try {
    // Lazy import to avoid impacting cold start when unused
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = await import('sql.js-httpvfs');
    const createDbWorker: (...args: any[]) => Promise<any> = (mod as any).createDbWorker || (mod as any).default?.createDbWorker;
    if (!createDbWorker) {
      throw new Error('sql.js-httpvfs createDbWorker not available');
    }

    // Resolve worker/wasm URLs in Node first via local node_modules, then env, then CDN.
    const CDN_WORKER = 'https://unpkg.com/sql.js-httpvfs@0.8.12/dist/sqlite.worker.js';
    const CDN_WASM = 'https://unpkg.com/sql.js-httpvfs@0.8.12/dist/sql-wasm.wasm';
    const req = createRequire(import.meta.url);
    const resolvePathToUrl = (specifier: string): string | null => {
      try {
        const p = req.resolve(specifier);
        return pathToFileURL(p).toString();
      } catch {
        return null;
      }
    };
    let workerUrl: string;
    let wasmUrl: string;
    const hasDomWorker = typeof (globalThis as unknown as { Worker?: unknown }).Worker !== 'undefined';
    if (!hasDomWorker) {
      // Node runtime: use web-worker polyfill and point it at a filesystem path.
      try {
        const nodeWorkerMod: any = await import('web-worker');
        (globalThis as any).Worker = nodeWorkerMod.default || nodeWorkerMod;
      } catch (e) {
        console.warn('Failed to load web-worker polyfill in Node:', e);
      }
      const bakedWorkerPath = fs.existsSync('/app/sqljs/sqlite.worker.js') ? '/app/sqljs/sqlite.worker.js' : null;
      const resolvedWorkerPath = bakedWorkerPath || (() => { try { return req.resolve('sql.js-httpvfs/dist/sqlite.worker.js'); } catch { return null; }})();
      const resolvedWorkerFileUrl = resolvedWorkerPath ? pathToFileURL(resolvedWorkerPath).toString() : '';
      workerUrl = String(process.env.SQLJS_WORKER_URL || resolvedWorkerFileUrl || '');
      if (!workerUrl) workerUrl = CDN_WORKER; // last resort (likely to fail in Node)
      // For wasm, prefer baked path or CDN; the worker will fetch it
      wasmUrl = String(process.env.SQLJS_WASM_URL || (fs.existsSync('/app/sqljs/sql-wasm.wasm') ? pathToFileURL('/app/sqljs/sql-wasm.wasm').toString() : CDN_WASM));
    } else {
      // Browser-like environment: use file URLs if available, fallback to CDN
      // Prefer baked-in worker/wasm paths in the container, fall back to node_modules, then CDN
      const bakedWorker = fs.existsSync('/app/sqljs/sqlite.worker.js') ? pathToFileURL('/app/sqljs/sqlite.worker.js').toString() : null;
      const bakedWasm = fs.existsSync('/app/sqljs/sql-wasm.wasm') ? pathToFileURL('/app/sqljs/sql-wasm.wasm').toString() : null;
      workerUrl = String(
        process.env.SQLJS_WORKER_URL ||
          bakedWorker ||
          resolvePathToUrl('sql.js-httpvfs/dist/sqlite.worker.js') ||
          CDN_WORKER,
      );
      wasmUrl = String(
        process.env.SQLJS_WASM_URL ||
          bakedWasm ||
          resolvePathToUrl('sql.js-httpvfs/dist/sql-wasm.wasm') ||
          CDN_WASM,
      );
    }

    const requestChunkSize = Number(process.env.SQLJS_REQUEST_CHUNK_SIZE || 65536);
    const config = {
      from: 'inline',
      config: {
        serverMode: 'full',
        // Larger chunk size reduces number of HTTP roundtrips
        requestChunkSize,
        url: httpUrl,
      },
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

      // sql.js-style result: [{ columns: ['h'], values: [[hex]] }]
      const hex: unknown = Array.isArray(res) && res.length > 0 && res[0] && Array.isArray(res[0].values) && res[0].values[0]
        ? res[0].values[0][0]
        : null;
      if (typeof hex === 'string' && hex.length > 0) {
        return Buffer.from(hex, 'hex');
      }
      return null;
    } finally {
      try {
        // Terminate worker if available to free resources in serverless envs
        if (worker && worker.worker && typeof worker.worker.terminate === 'function') {
          worker.worker.terminate();
        }
      } catch {
        /* ignore */
      }
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

  // Try HTTP byte-range access first when the tileset is remote (GCS).
  // Uses sql.js-httpvfs to query the remote MBTiles over HTTP range requests.
  let httpRangeFallback = false;
  if (!tileFile.isLocal && tileFile.httpUrl) {
    try {
      const tmsY = yToTms(zz, yy);
      let tile = await getTileViaHttpVfs(tileFile.httpUrl, zz, xx, tmsY);
      // Gzip integrity check: if compressed, ensure we can inflate fully.
      if (tile && isGzip(tile)) {
        try {
          // We don't use the result; this is purely a validation.
          gunzipSync(tile);
        } catch (e) {
          console.warn('Gzip integrity check failed on HTTP-VFS tile; falling back to download', e);
          tile = null;
          httpRangeFallback = true;
        }
      }

      if (tile) {
        const headers: Record<string, string> = {
          'Content-Type': 'application/x-protobuf',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': String(tile.length),
          'X-Tile-Zoom': String(zz),
          'X-Tile-X': String(xx),
          'X-Tile-Y': String(yy),
          'X-LOD-Source': 'single-httpvfs',
          'X-GCS-Source': 'true',
          'X-Tile-Cache': 'httpvfs',
          'X-HTTP-Range': 'httpvfs',
        };
        if (isGzip(tile)) headers['Content-Encoding'] = 'gzip';
        return new Response(new Uint8Array(tile), { headers });
      }
      // If sql.js-httpvfs couldn't find the tile, fall through to download path
      httpRangeFallback = true;
    } catch (error) {
      console.warn(`HTTP range (sql.js-httpvfs) failed for ${tileFile.httpUrl}, falling back to download:`, error);
      httpRangeFallback = true;
    }
  }

  // If tileset is remote (GCS) and HTTP-range failed, do not download entire MBTiles.
  // This enforces range-only access in production.
  if (!tileFile.isLocal && tileFile.httpUrl) {
    return NextResponse.json(
      { error: 'Remote MBTiles range access failed' },
      { status: 503, headers: { 'X-HTTP-Range': httpRangeFallback ? 'failed' : 'skipped' } }
    );
  }

  // Fallback to download approach (local development only)
  let filepath: string;
  let isTemp = false;
  let cacheStatus: 'hit' | 'refresh' | undefined;

  try {
    const dl = await downloadTileFile(tileFile);
    filepath = dl.path;
    isTemp = dl.isTemp;
    cacheStatus = dl.cacheStatus;
  } catch (error) {
    console.error(`Failed to download/access tileset for year ${yr}:`, error);
    return NextResponse.json({ error: 'Failed to access tileset' }, { status: 500 });
  }

  try {
    const stat = await fs.promises.stat(filepath);
    const mtime = tileFile.mtime || stat.mtime;
    const etag = `W/"${mtime.getTime()}-${zz}-${xx}-${yy}-single"`;
    const ifNoneMatch = (_request.headers as unknown as { get(name: string): string | null }).get?.('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      if (isTemp) cleanupTempFile(filepath);
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'public, max-age=31536000, immutable' }
      });
    }

    const tmsY = yToTms(zz, yy);
    let tile: Buffer | null = null;

    const hasMBTiles = (await getMBTilesCtor()) !== null;
    if (hasMBTiles) {
      try {
        const mb = (await openMBTilesByPath(filepath)) as {
          getTile: (
            z: number,
            x: number,
            y: number,
            cb: (err: Error | null, data?: Buffer) => void
          ) => void;
        };
        tile = await new Promise((resolve) => {
          mb.getTile(zz, xx, tmsY, (err: Error | null, data?: Buffer) => resolve(err ? null : (data || null)));
        });
      } catch (error) {
        console.error('MBTiles getTile failed, falling back to SQLite CLI:', error);
      }
    }
    if (!tile) {
      tile = await getTileViaSqliteCli(filepath, zz, xx, tmsY);
    }
    if (!tile) {
      if (isTemp) cleanupTempFile(filepath);
      return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=86400' } });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-protobuf',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(tile.length),
      ETag: etag,
      'X-Tile-Zoom': String(zz),
      'X-Tile-X': String(xx),
      'X-Tile-Y': String(yy),
      'X-LOD-Source': 'single',
      'X-GCS-Source': tileFile.isLocal ? 'false' : 'true',
      'Last-Modified': (tileFile.mtime || stat.mtime).toUTCString(),
      'X-HTTP-Range': httpRangeFallback ? 'fallback' : 'disabled'
    };
    if (cacheStatus) headers['X-Tile-Cache'] = cacheStatus;
    if (isGzip(tile)) headers['Content-Encoding'] = 'gzip';

    const response = new Response(new Uint8Array(tile), { headers });
    if (isTemp) process.nextTick(() => cleanupTempFile(filepath));
    return response;
  } catch (err) {
    if (isTemp) cleanupTempFile(filepath);
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Tileset not found for year' }, { status: 404 });
    }
    console.error('Single-layer tile error:', err);
    return NextResponse.json({ error: 'Failed to serve tile' }, { status: 500 });
  }
}
