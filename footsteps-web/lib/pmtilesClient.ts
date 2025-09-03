function getBase(): string {
  const raw = (process.env.NEXT_PUBLIC_CDN_HOST || '').replace(/\/+$/, '');
  const forceDirect = (process.env.NEXT_PUBLIC_PMTILES_DIRECT || 'false') === 'true';
  // If explicitly configured and absolute, or direct mode is on, prefer absolute CDN
  if (forceDirect) {
    if (/^https?:\/\//i.test(raw)) return raw;
    return 'https://pmtiles.willhs.me';
  }
  if (raw) return raw;
  // Default to same-origin proxy path; upstream origin is configured via PMTILES_ORIGIN
  return '/pmtiles';
}

export function getPMTilesUrl(year: number): string {
  const base = getBase();
  return `${base}/humans_${year}.pmtiles`;
}
