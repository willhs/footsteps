import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getTileFilePath, downloadTileFile, cleanupTempFile, createHTTPTileAccess } from '@/lib/tilesService';

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
      } catch {
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
  } catch {
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

  // Try HTTP byte-range access first (production mode) ONLY when explicitly enabled.
  // This avoids serving potentially truncated gzip payloads from the simple range reader.
  const enableHttpRange = process.env.ENABLE_HTTP_RANGE === 'true';
  if (enableHttpRange && !tileFile.isLocal && tileFile.httpUrl) {
    try {
      const httpAccess = await createHTTPTileAccess(tileFile);
      if (httpAccess && httpAccess.supportsRanges) {
        const tmsY = yToTms(zz, yy);
        const tile = await httpAccess.reader.getTile(zz, xx, tmsY);
        
        if (!tile) {
          return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=86400', 'X-HTTP-Range': 'enabled' } });
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/x-protobuf',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': String(tile.length),
          'X-Tile-Zoom': String(zz),
          'X-Tile-X': String(xx),
          'X-Tile-Y': String(yy),
          'X-LOD-Source': 'single-http-range',
          'X-GCS-Source': 'true',
          'X-Tile-Cache': 'http-range',
          'X-HTTP-Range': 'enabled',
        };
        
        if (isGzip(tile)) headers['Content-Encoding'] = 'gzip';

        return new Response(new Uint8Array(tile), { headers });
      }
    } catch (error) {
      console.warn(`HTTP range access failed for ${tileFile.httpUrl}, falling back to download:`, error);
    }
  }

  // Fallback to download approach (development or when HTTP ranges fail)
  let filepath: string;
  let isTemp = false;
  let cacheStatus: 'hit' | 'refresh' | undefined;

  try {
    const dl = await downloadTileFile(tileFile);
    filepath = dl.path;
    isTemp = dl.isTemp;
    cacheStatus = dl.cacheStatus;
  } catch {
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
      } catch {
        // fall back
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
      'X-HTTP-Range': 'disabled'
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