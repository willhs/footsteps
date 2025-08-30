import { NextResponse } from 'next/server';
import { PMTiles, FetchSource, SharedPromiseCache } from 'pmtiles';

type Params = { params: { year: string; z: string; x: string; y: string } };

// Share PMTiles header/dir promises across requests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g: any = globalThis as any;
const sharedPMCache: SharedPromiseCache = g.__pmtilesApiCache || new SharedPromiseCache(2000);
g.__pmtilesApiCache = sharedPMCache;

function getCDNOrigin(): string {
  // Prefer explicit server-side origin for PMTiles; fall back to public var if absolute.
  const raw = process.env.PMTILES_ORIGIN || process.env.NEXT_PUBLIC_CDN_HOST || 'https://pmtiles.willhs.me';
  const hasScheme = /^https?:\/\//i.test(raw);
  if (!hasScheme) return 'https://pmtiles.willhs.me';
  return raw.replace(/\/$/, '');
}

function getPMTilesUrl(year: number): string {
  const origin = getCDNOrigin();
  return `${origin}/humans_${year}.pmtiles`;
}

function parseParamInt(v: string, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return Math.floor(n);
}

export async function GET(_req: Request, ctx: Params) {
  try {
    const year = Number(ctx.params.year);
    const z = parseParamInt(ctx.params.z, 0, 22);
    const x = parseParamInt(ctx.params.x, 0, 1 << 28);
    const y = parseParamInt(ctx.params.y, 0, 1 << 28);
    if (!Number.isFinite(year) || z === null || x === null || y === null) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const url = getPMTilesUrl(year);
    const pmt = new PMTiles(new FetchSource(url, { cache: 'force-cache' } as RequestInit), sharedPMCache);

    const tile = await pmt.getZxy(z, x, y);
    if (!tile || !tile.data) {
      return NextResponse.json({ error: 'Tile not found' }, { status: 404 });
    }

    const bytes = tile.data instanceof ArrayBuffer ? new Uint8Array(tile.data) : new Uint8Array(await tile.data.arrayBuffer?.() || tile.data);

    const headers = new Headers();
    headers.set('Content-Type', 'application/x-protobuf');
    // Enable strong caching for stable yearly tiles
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Content-Length', String(bytes.byteLength));
    headers.set('Access-Control-Expose-Headers', '*');

    return new NextResponse(bytes, { status: 200, headers });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[API TILE ERROR]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

