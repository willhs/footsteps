function getBase(): string {
  const raw = (process.env.NEXT_PUBLIC_CDN_HOST || '').replace(/\/+$/, '');
  // If explicitly configured, honor either absolute CDN or relative same-origin path
  if (raw) return raw;
  // Default to same-origin proxy path; upstream origin is configured via PMTILES_ORIGIN
  return '/pmtiles';
}

export function getPMTilesUrl(year: number): string {
  const base = getBase();
  return `${base}/humans_${year}.pmtiles`;
}
