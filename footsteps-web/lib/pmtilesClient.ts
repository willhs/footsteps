import { PMTiles, FetchSource } from 'pmtiles';

const pmtilesCache = new Map<number, PMTiles>();

function getBase(): string {
  const base = process.env.NEXT_PUBLIC_PMTILES_BASE || '';
  if (base) return base.replace(/\/+$/, '');
  // Fallback to Cloudflare hostname if provided via NEXT_PUBLIC_CDN_HOST
  const host = process.env.NEXT_PUBLIC_CDN_HOST || '';
  if (host) return `https://${host.replace(/\/+$/, '')}`;
  // As a last resort, try the API host (will likely be slower)
  return '';
}

export function getPMTilesUrl(year: number): string {
  const base = getBase();
  if (!base) throw new Error('NEXT_PUBLIC_PMTILES_BASE is not set');
  return `${base}/humans_${year}.pmtiles`;
}

export function getPMTiles(year: number): PMTiles {
  const existing = pmtilesCache.get(year);
  if (existing) return existing;
  const url = getPMTilesUrl(year);
  const pmt = new PMTiles(new FetchSource(url));
  pmtilesCache.set(year, pmt);
  return pmt;
}

export async function getTileArrayBuffer(
  year: number,
  z: number,
  x: number,
  y: number,
): Promise<ArrayBuffer | null> {
  const pmt = getPMTiles(year);
  const res = await pmt.getZxy(z, x, y);
  if (!res || !res.data) return null;
  return res.data;
}

