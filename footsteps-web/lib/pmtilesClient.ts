function getBase(): string {
  const host = process.env.NEXT_PUBLIC_CDN_HOST || 'https://pmtiles.willhs.me';
  if (!host) {
    throw new Error('NEXT_PUBLIC_CDN_HOST must be set (no fallbacks)');
  }
  const trimmed = host.replace(/\/+$/, '');
  const hasScheme = /^https?:\/\//i.test(trimmed);
  return hasScheme ? trimmed : `https://${trimmed}`;
}

export function getPMTilesUrl(year: number): string {
  const base = getBase();
  return `${base}/humans_${year}.pmtiles`;
}
