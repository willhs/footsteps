import { getCdnHost } from '@/lib/env';

export function getPMTilesUrl(year: number): string {
  const base = getCdnHost();
  return `${base}/humans_${year}.pmtiles`;
}
