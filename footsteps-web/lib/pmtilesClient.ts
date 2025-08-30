function getBase(): string {
  const host = process.env.NEXT_PUBLIC_CDN_HOST || 'https://pmtiles.willhs.me';
  if (!host) {
    throw new Error('NEXT_PUBLIC_CDN_HOST must be set (no fallbacks)');
  }
  const trimmed = host.replace(/\/+$/, '');
  // Support relative base (e.g., '/pmtiles') in dev to avoid CORS via Next rewrites
  if (/^\//.test(trimmed)) {
    return trimmed; // relative path base
  }
  const hasScheme = /^https?:\/\//i.test(trimmed);
  const url = hasScheme ? trimmed : `https://${trimmed}`;
  // Warn when using a local proxy path; this can defeat browser HTTP caching
  try {
    const u = new URL(url);
    if ((/localhost|127\.|\[::1\]/.test(u.hostname) || u.pathname.startsWith('/pmtiles')) &&
        (process.env.NEXT_PUBLIC_DEBUG_LOGS || 'false') === 'true') {
      // eslint-disable-next-line no-console
      console.warn('[PMTILES] Using a local/proxied base (', url, ') — browser disk cache may be bypassed by the proxy. Prefer a direct CDN host.');
    }
  } catch {}
  return url;
}

export function getPMTilesUrl(year: number): string {
  const base = getBase();
  return `${base}/humans_${year}.pmtiles`;
}
