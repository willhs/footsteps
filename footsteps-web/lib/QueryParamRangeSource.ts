import { type Source, type RangeResponse, EtagMismatch } from 'pmtiles';

/**
 * QueryParamRangeSource appends a stable, per-range query parameter to the
 * PMTiles URL, e.g. `?rk=123-456`, to defeat Chrome HTTP/1.1 cache-entry
 * locking and request coalescing for concurrent Range requests.
 *
 * WARNING: Only enable this against same-origin or a dev proxy. Appending
 * query params against a CDN will explode cache keys. Guard usage with an
 * environment flag.
 */
export class QueryParamRangeSource implements Source {
  private baseUrl: string;
  private customHeaders: Headers;

  constructor(url: string, headers?: HeadersInit) {
    this.baseUrl = url;
    this.customHeaders = new Headers(headers);
  }

  getKey(): string {
    return this.baseUrl;
  }

  setHeaders(h: Headers) {
    this.customHeaders = h;
  }

  private buildUrl(offset: number, length: number): string {
    try {
      const u = new URL(this.baseUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      u.searchParams.set('rk', `${offset}-${offset + length - 1}`);
      return u.toString();
    } catch {
      // Fallback: naive string append
      const sep = this.baseUrl.includes('?') ? '&' : '?';
      return `${this.baseUrl}${sep}rk=${offset}-${offset + length - 1}`;
    }
  }

  async getBytes(
    offset: number,
    length: number,
    passedSignal?: AbortSignal,
    etag?: string,
  ): Promise<RangeResponse> {
    const signal = passedSignal;
    const headers = new Headers(this.customHeaders);
    headers.set('range', `bytes=${offset}-${offset + length - 1}`);
    // Keep byte ranges stable
    headers.set('accept-encoding', 'identity');

    const url = this.buildUrl(offset, length);
    const cacheMode = (process.env.NEXT_PUBLIC_PM_FETCH_CACHE || 'default') as RequestCache;
    const resp = await fetch(url, { signal, headers, cache: cacheMode });

    // Some well-behaved CDNs return 200 for byte ranges with full file; reject
    const contentLength = resp.headers.get('Content-Length');
    if (resp.status === 200 && (!contentLength || +contentLength > length)) {
      throw new Error('Server returned full body for a Range request; byte serving unsupported');
    }

    let newEtag = resp.headers.get('Etag') || undefined;
    if (newEtag && newEtag.startsWith('W/')) newEtag = undefined;
    if (resp.status === 416 || (etag && newEtag && newEtag !== etag)) {
      throw new EtagMismatch('ETag mismatch on ranged request');
    }

    if (resp.status >= 300) {
      throw new Error(`Bad response code: ${resp.status}`);
    }

    const a = await resp.arrayBuffer();
    return { data: a, etag: newEtag, cacheControl: resp.headers.get('Cache-Control') || undefined, expires: resp.headers.get('Expires') || undefined };
  }
}
