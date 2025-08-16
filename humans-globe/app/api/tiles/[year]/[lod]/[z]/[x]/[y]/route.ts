import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getLodTileFilePath, downloadTileFile, cleanupTempFile } from '@/lib/tilesService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lazy-load @mapbox/mbtiles via ESM dynamic import and memoize
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
        // Some builds export as default, others as module itself
        const ctor = (mod as unknown as { default?: MBTilesCtor }).default || (mod as unknown as MBTilesCtor);
        return ctor || null;
      } catch {
        return null;
      }
    })();
  }
  return mbtilesCtorPromise;
}

// Cache opened MBTiles instances across requests (keyed by absolute filepath)
// eslint-disable-next-line no-var
declare var global: typeof globalThis & { __mbtilesCache?: Map<string, unknown> };
const mbtilesCache: Map<string, unknown> = global.__mbtilesCache || new Map();
global.__mbtilesCache = mbtilesCache;

// Moved to tilesService.ts

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
  // Query hex-encoded blob to avoid binary stdout handling issues
  const sql = `SELECT hex(tile_data) FROM tiles WHERE zoom_level=${z} AND tile_column=${x} AND tile_row=${tmsY} LIMIT 1;`;
  try {
    const { stdout } = await execFileAsync('sqlite3', ['-readonly', filepath, sql], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const hex = stdout.trim();
    if (!hex) return null;
    return Buffer.from(hex, 'hex');
  } catch {
    // sqlite3 CLI not available or query failed
    return null;
  }
}

async function openMBTilesByPath(filepath: string): Promise<unknown> {
  const key = path.resolve(filepath);
  if (mbtilesCache.has(key)) {
    return mbtilesCache.get(key) as unknown;
  }
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
  const { params: paramsPromise } = context as { params: Promise<{ year: string; lod: string; z: string; x: string; y: string }> };
  const params = await paramsPromise;
  const { year, lod, z, x } = params;
  // y may come as "<num>.pbf" when requested via tile URL
  const yRaw = params.y;
  const yStr = yRaw.endsWith('.pbf') ? yRaw.slice(0, -4) : yRaw;

  // Basic validation
  const yr = Number.parseInt(year, 10);
  const lodLevel = Number.parseInt(lod, 10);
  const zz = Number.parseInt(z, 10);
  const xx = Number.parseInt(x, 10);
  const yy = Number.parseInt(yStr, 10);
  if (!Number.isInteger(yr) || !Number.isInteger(zz) || !Number.isInteger(xx) || !Number.isInteger(yy)) {
    return NextResponse.json({ error: 'Invalid path parameters' }, { status: 400 });
  }
  if (lodLevel < 0 || lodLevel > 10) {
    return NextResponse.json({ error: 'Invalid LOD' }, { status: 400 });
  }

  // Resolve LOD-specific file path (humans_{year}_lod_{lod}.mbtiles)
  const tileFile = await getLodTileFilePath(yr, lodLevel);
  if (!tileFile.exists) {
    return NextResponse.json({ error: 'Tileset not found for year/LOD' }, { status: 404 });
  }

  // Download file if it's from GCS (for MBTiles access)
  let filepath: string;
  const lodSource = 'lod' as const;
  let isTemp: boolean;
  let cacheStatus: 'hit' | 'refresh' | undefined;
  
  try {
    const dl = await downloadTileFile(tileFile);
    filepath = dl.path;
    isTemp = dl.isTemp;
    cacheStatus = dl.cacheStatus;
  } catch (downloadErr) {
    console.error('Failed to download tile file:', downloadErr);
    return NextResponse.json({ error: 'Failed to access tileset' }, { status: 500 });
  }

  try {
    const stat = await fs.promises.stat(filepath);

    // ETag strategy: use file mtime from metadata or local stat + z/x/y + lod
    const mtime = tileFile.mtime || stat.mtime;
    const etag = `W/"${mtime.getTime()}-${zz}-${xx}-${yy}-lod${lodLevel}"`;
    const ifNoneMatch = (_request.headers as unknown as { get(name: string): string | null }).get?.('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      // Clean up temp file if needed
      if (isTemp) cleanupTempFile(filepath);
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
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
          mb.getTile(zz, xx, tmsY, (err: Error | null, data?: Buffer) => {
            if (err || !data) return resolve(null);
            resolve(data);
          });
        });
      } catch {
        // fall through to CLI
      }
    }

    if (!tile) {
      tile = await getTileViaSqliteCli(filepath, zz, xx, tmsY);
    }

    if (!tile) {
      // Clean up temp file if needed
      if (isTemp) cleanupTempFile(filepath);
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-protobuf',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(tile.length),
      ETag: etag,
      'X-Tile-Zoom': String(zz),
      'X-Tile-X': String(xx),
      'X-Tile-Y': String(yy),
      'X-LOD-Requested': String(lodLevel),
      'X-LOD-Source': lodSource,
      'X-GCS-Source': tileFile.isLocal ? 'false' : 'true',
      'Last-Modified': (tileFile.mtime || stat.mtime).toUTCString()
    };

    if (cacheStatus) {
      headers['X-Tile-Cache'] = cacheStatus;
    }

    if (isGzip(tile)) {
      headers['Content-Encoding'] = 'gzip';
    }

    // Clean up temp file after successful response
    const response = new Response(new Uint8Array(tile), { headers });
    if (isTemp) {
      // Clean up in next tick to allow response to complete
      process.nextTick(() => cleanupTempFile(filepath));
    }
    return response;
  } catch (err) {
    // Clean up temp file if needed
    if (isTemp) cleanupTempFile(filepath);
    
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Tileset not found for year' }, { status: 404 });
    }
    console.error('Tile serve error:', err);
    return NextResponse.json({ error: 'Failed to serve tile' }, { status: 500 });
  }
}
