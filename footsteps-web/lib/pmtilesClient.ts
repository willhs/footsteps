import { PMTiles, FetchSource } from 'pmtiles';
import { parse } from '@loaders.gl/core';
import { MVTLoader } from '@loaders.gl/mvt';

const pmtilesCache = new Map<number, PMTiles>();

function getBase(): string {
  const base = process.env.NEXT_PUBLIC_PMTILES_BASE || '';
  if (base) return base.replace(/\/+$/, '');
  // Fallback to Cloudflare hostname if provided via NEXT_PUBLIC_CDN_HOST
  const host = process.env.NEXT_PUBLIC_CDN_HOST || '';
  if (host) return `https://${host.replace(/\/+$/, '')}`;
  // As a last resort, try the API host (will likely be slower)
  // Developer-friendly default to your public CDN domain if unset
  if (typeof window !== 'undefined') {
    return 'https://pmtiles.willhs.me';
  }
  return 'https://pmtiles.willhs.me';
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

export async function getParsedTile(
  year: number,
  z: number,
  x: number,
  y: number,
): Promise<unknown | null> {
  const ab = await getTileArrayBuffer(year, z, x, y);
  if (!ab) return null;
  // Parse vector tile into binary format deck.gl expects
  const parsed = await parse(ab, MVTLoader, {
    mvt: { coordinates: 'wgs84', layers: ['humans'] },
    gis: { format: 'binary' },
  });
  return parsed || null;
}
