// Environment helpers with memoized values

function toBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

let debugEnabled: boolean | undefined;
export function isDebugEnabled(): boolean {
  if (debugEnabled === undefined) {
    debugEnabled = toBoolean(process.env.NEXT_PUBLIC_DEBUG_LOGS, false);
  }
  return debugEnabled;
}

let plainBasemapEnabled: boolean | undefined;
export function isPlainBasemapEnabled(): boolean {
  if (plainBasemapEnabled === undefined) {
    plainBasemapEnabled = toBoolean(
      process.env.NEXT_PUBLIC_ENABLE_PLAIN_BASEMAP,
      true,
    );
  }
  return plainBasemapEnabled;
}

let serviceWorkerEnabled: boolean | undefined;
export function isServiceWorkerEnabled(): boolean {
  if (serviceWorkerEnabled === undefined) {
    serviceWorkerEnabled = toBoolean(process.env.NEXT_PUBLIC_SW_ENABLE, false);
  }
  return serviceWorkerEnabled;
}

let nodeEnv: string | undefined;
export function isProduction(): boolean {
  if (nodeEnv === undefined) {
    nodeEnv = process.env.NODE_ENV || 'development';
  }
  return nodeEnv === 'production';
}

let cdnHost: string | undefined;
export function getCdnHost(): string {
  if (!cdnHost) {
    const host =
      process.env.NEXT_PUBLIC_CDN_HOST || 'https://pmtiles.willhs.me';
    if (!host) {
      throw new Error('NEXT_PUBLIC_CDN_HOST must be set (no fallbacks)');
    }
    const trimmed = host.replace(/\/+$/, '');
    if (/^\//.test(trimmed)) {
      cdnHost = trimmed;
      return cdnHost;
    }
    const hasScheme = /^https?:\/\//i.test(trimmed);
    const url = hasScheme ? trimmed : `https://${trimmed}`;
    if (isDebugEnabled()) {
      try {
        const u = new URL(url);
        if (
          /localhost|127\.|\[::1\]/.test(u.hostname) ||
          u.pathname.startsWith('/pmtiles')
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            '[PMTILES] Using a local/proxied base (',
            url,
            ') — browser disk cache may be bypassed by the proxy. Prefer a direct CDN host.',
          );
        }
      } catch {
        // ignore URL parsing errors
      }
    }
    cdnHost = url;
  }
  return cdnHost;
}

export { toBoolean };
