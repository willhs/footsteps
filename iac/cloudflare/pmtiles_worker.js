// Cloudflare Worker: PMTiles range-caching proxy to GCS
// - Proxies requests to a GCS bucket path, preserving Range headers
// - Creates a cache key that includes the Range header to cache partial content
// - Sets long cache TTL; relies on immutable PMTiles

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Expect paths like: /humans_-1000.pmtiles
    const objectPath = url.pathname.replace(/^\/+/, '');

    const bucket = env.GCS_BUCKET;
    const prefix = (env.PMTILES_PREFIX || 'pmtiles').replace(/\/+$/, '');
    const origin = new URL(`https://storage.googleapis.com/${bucket}/${prefix}/${objectPath}`);

    const range = request.headers.get('Range') || request.headers.get('range') || '';
    const headers = new Headers(request.headers);
    headers.set('Accept-Encoding', 'identity');

    // Compose a cache key that varies by Range to enable range caching
    const cacheKey = `${url.origin}${url.pathname}|range=${range || 'none'}`;

    const init = {
      method: 'GET',
      headers,
      cf: {
        cacheEverything: true,
        cacheKey,
        cacheTtl: 31536000,
      },
    };

    const resp = await fetch(origin.toString(), init);

    // Allow cross-origin tile access if used directly from the browser
    const outHeaders = new Headers(resp.headers);
    outHeaders.set('Access-Control-Allow-Origin', '*');
    // Ensure downstream caches can keep partial content
    const cc = outHeaders.get('Cache-Control');
    if (!cc) outHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
  },
};

