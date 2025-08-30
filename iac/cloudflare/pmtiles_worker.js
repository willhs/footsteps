// Cloudflare Worker: PMTiles range-caching proxy to GCS
// - Proxies requests to a GCS bucket path, preserving Range headers
// - Implements block-based caching for byte range requests (1 MiB blocks)
// - Serves 206 to the client by assembling from cached 200 block responses
// - Sets long cache TTL; relies on immutable PMTiles

const BLOCK_SIZE = 1 << 20; // 1 MiB
const EXACT_THRESHOLD = 512 * 1024; // fetch exact requested bytes if <= 512 KiB
// Deduplicate concurrent fetches per block within an isolate
const inflight = new Map(); // key: block URL string -> Promise<Uint8Array>

async function fetchBlockOnce(key, factory) {
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      return await factory();
    } finally {
      // ensure cleanup even if factory throws
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Expect paths like: /humans_-1000.pmtiles
    const objectPath = url.pathname.replace(/^\/+/, '');

    const bucket = env.GCS_BUCKET;
    const prefix = (env.PMTILES_PREFIX || 'pmtiles').replace(/\/+$/, '');
    const origin = new URL(`https://storage.googleapis.com/${bucket}/${prefix}/${objectPath}`);

    const method = (request.method || 'GET').toUpperCase();
    const range = request.headers.get('Range') || request.headers.get('range') || '';
    const headers = new Headers(request.headers);
    if (range) headers.set('Range', range);
    headers.set('Accept-Encoding', 'identity');

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      const reqHeaders = request.headers.get('Access-Control-Request-Headers') || request.headers.get('access-control-request-headers') || '';
      const allowHeaders = reqHeaders || 'Range,Content-Type,Accept,Origin,Referer,User-Agent,If-None-Match,If-Modified-Since';
      const h = new Headers();
      h.set('Access-Control-Allow-Origin', '*');
      h.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
      h.set('Access-Control-Allow-Headers', allowHeaders);
      h.set('Access-Control-Max-Age', '86400');
      h.set('Vary', 'Access-Control-Request-Headers');
      return new Response(null, { status: 204, headers: h });
    }

    // HEAD passthrough
    if (method === 'HEAD') {
      const resp = await fetch(origin.toString(), { method: 'HEAD', headers });
      const out = new Headers(resp.headers);
      out.set('Access-Control-Allow-Origin', '*');
      out.set('Access-Control-Expose-Headers', '*');
      out.set('Accept-Ranges', 'bytes');
      out.set('Cache-Control', out.get('Cache-Control') || 'public, max-age=31536000, immutable');
      return new Response(null, { status: resp.status, statusText: resp.statusText, headers: out });
    }

    // If no Range, just proxy through (respecting long TTL + CORS)
    if (!range) {
      const resp = await fetch(origin.toString(), { method: 'GET', headers });
      const outHeaders = new Headers(resp.headers);
      if (!outHeaders.get('Cache-Control')) {
        outHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
      outHeaders.set('Access-Control-Allow-Origin', '*');
      outHeaders.set('Access-Control-Expose-Headers', '*');
      outHeaders.set('Accept-Ranges', 'bytes');
      outHeaders.set('Content-Encoding', 'identity');
      outHeaders.set('X-Worker-Cache', 'BYPASS');
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
    }

    // Parse explicit byte range: bytes=start-end
    const m = /bytes=([0-9]+)-([0-9]+)/i.exec(range);
    if (!m) {
      // Fallback: unsupported range syntax (e.g., start-). Proxy through without caching.
      const resp = await fetch(origin.toString(), { method: 'GET', headers });
      const outHeaders = new Headers(resp.headers);
      if (!outHeaders.get('Cache-Control')) {
        outHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
      outHeaders.set('Access-Control-Allow-Origin', '*');
      outHeaders.set('Access-Control-Expose-Headers', '*');
      outHeaders.set('X-Worker-Cache', 'BYPASS');
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
    }

    const start = Number(m[1]);
    const end = Number(m[2]);
    if (!(Number.isFinite(start) && Number.isFinite(end) && end >= start)) {
      const resp = await fetch(origin.toString(), { method: 'GET', headers });
      const outHeaders = new Headers(resp.headers);
      outHeaders.set('Access-Control-Allow-Origin', '*');
      outHeaders.set('Access-Control-Expose-Headers', '*');
      outHeaders.set('X-Worker-Cache', 'BYPASS');
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: outHeaders });
    }

    const requestedLen = end - start + 1;

    // Small/medium requests: fetch exact range to reduce cold-miss latency
    if (requestedLen <= EXACT_THRESHOLD) {
      const exactUrl = new URL(request.url);
      exactUrl.searchParams.set('__r', `${start}-${end}`);
      const exactReq = new Request(exactUrl.toString(), { method: 'GET' });

      let totalSize = 0;
      let etag = '';
      let lastModified = '';
      let hits = 0;
      let misses = 0;

      let cached = await caches.default.match(exactReq);
      if (cached) {
        hits++;
        const ab = await cached.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const metaSize = cached.headers.get('X-File-Size');
        if (metaSize && !totalSize) totalSize = Number(metaSize) || 0;
        const h1 = cached.headers.get('ETag');
        if (h1) etag = h1;
        const h2 = cached.headers.get('Last-Modified');
        if (h2) lastModified = h2;

        const outHeaders = new Headers();
        outHeaders.set('Accept-Ranges', 'bytes');
        outHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
        outHeaders.set('Access-Control-Allow-Origin', '*');
        outHeaders.set('Access-Control-Expose-Headers', '*');
        outHeaders.set('Content-Length', String(bytes.byteLength));
        if (totalSize) outHeaders.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        else outHeaders.set('Content-Range', `bytes ${start}-${end}/*`);
        outHeaders.set('Content-Type', 'application/octet-stream');
        outHeaders.set('Content-Encoding', 'identity');
        outHeaders.set('Timing-Allow-Origin', '*');
        outHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
        outHeaders.set('Vary', 'Range');
        if (etag) outHeaders.set('ETag', etag);
        if (lastModified) outHeaders.set('Last-Modified', lastModified);
        outHeaders.set('X-Worker-Cache', 'HIT');
        outHeaders.set('X-Worker-Blocks', `exact_hit=${hits},exact_miss=${misses}`);
        return new Response(bytes, { status: 206, headers: outHeaders });
      }

      misses++;

      const bytes = await fetchBlockOnce(exactUrl.toString(), async () => {
        const originHeaders = new Headers(headers);
        originHeaders.set('Range', `bytes=${start}-${end}`);
        const originResp = await fetch(origin.toString(), { method: 'GET', headers: originHeaders });
        if (!(originResp.status === 206 || originResp.status === 200)) {
          const ab = await originResp.arrayBuffer();
          return new Uint8Array(ab);
        }

        const cr = originResp.headers.get('Content-Range');
        if (cr) {
          const m2 = /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(cr);
          if (m2 && m2[3] && m2[3] !== '*') totalSize = Number(m2[3]) || totalSize;
        }

        if (!etag) {
          const h = originResp.headers.get('ETag');
          if (h) etag = h;
        }
        if (!lastModified) {
          const h2 = originResp.headers.get('Last-Modified');
          if (h2) lastModified = h2;
        }

        const ab = await originResp.arrayBuffer();
        const exactBytes = new Uint8Array(ab);

        const storeHeaders = new Headers();
        storeHeaders.set('Cache-Control', 'public, max-age=31536000, immutable, no-transform');
        storeHeaders.set('Content-Type', originResp.headers.get('Content-Type') || 'application/octet-stream');
        if (totalSize) storeHeaders.set('X-File-Size', String(totalSize));
        if (etag) storeHeaders.set('ETag', etag);
        if (lastModified) storeHeaders.set('Last-Modified', lastModified);
        const storeResp = new Response(exactBytes, { status: 200, headers: storeHeaders });
        try { await caches.default.put(exactReq, storeResp.clone()); } catch {}

        return exactBytes;
      });

      const outHeaders = new Headers();
      outHeaders.set('Accept-Ranges', 'bytes');
      outHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
      outHeaders.set('Access-Control-Allow-Origin', '*');
      outHeaders.set('Access-Control-Expose-Headers', '*');
      outHeaders.set('Content-Length', String(bytes.byteLength));
      if (totalSize) outHeaders.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      else outHeaders.set('Content-Range', `bytes ${start}-${end}/*`);
      outHeaders.set('Content-Type', 'application/octet-stream');
      outHeaders.set('Content-Encoding', 'identity');
      outHeaders.set('Timing-Allow-Origin', '*');
      outHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
      outHeaders.set('Vary', 'Range');
      if (etag) outHeaders.set('ETag', etag);
      if (lastModified) outHeaders.set('Last-Modified', lastModified);
      outHeaders.set('X-Worker-Cache', hits > 0 && misses === 0 ? 'HIT' : (hits > 0 ? 'PARTIAL' : 'MISS'));
      outHeaders.set('X-Worker-Blocks', `exact_hit=${hits},exact_miss=${misses}`);
      return new Response(bytes, { status: 206, headers: outHeaders });
    }

    const firstBlock = Math.floor(start / BLOCK_SIZE);
    const lastBlock = Math.floor(end / BLOCK_SIZE);

    const blocks = [];
    let totalSize = 0;
    let hits = 0;
    let misses = 0;
    let etag = '';
    let lastModified = '';

    for (let b = firstBlock; b <= lastBlock; b++) {
      const blockUrl = new URL(request.url);
      blockUrl.searchParams.set('__block', String(b));
      blockUrl.searchParams.set('__bs', String(BLOCK_SIZE));
      const blockReq = new Request(blockUrl.toString(), { method: 'GET' });

      // Try cache first
      let cachedBlock = await caches.default.match(blockReq);
      if (cachedBlock) {
        hits++;
        const ab = await cachedBlock.arrayBuffer();
        blocks.push(new Uint8Array(ab));
        const metaSize = cachedBlock.headers.get('X-File-Size');
        if (metaSize && !totalSize) totalSize = Number(metaSize) || 0;
        if (!etag) {
          const h = cachedBlock.headers.get('ETag');
          if (h) etag = h;
        }
        if (!lastModified) {
          const h2 = cachedBlock.headers.get('Last-Modified');
          if (h2) lastModified = h2;
        }
        continue;
      }

      misses++;

      const bytes = await fetchBlockOnce(blockUrl.toString(), async () => {
        const blockStart = b * BLOCK_SIZE;
        const blockEndWanted = blockStart + BLOCK_SIZE - 1;
        const originHeaders = new Headers(headers);
        originHeaders.set('Range', `bytes=${blockStart}-${blockEndWanted}`);
        const originResp = await fetch(origin.toString(), { method: 'GET', headers: originHeaders });
        if (!(originResp.status === 206 || originResp.status === 200)) {
          throw new Error(`Unexpected status ${originResp.status}`);
        }

        const cr = originResp.headers.get('Content-Range');
        if (cr) {
          const m2 = /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(cr);
          if (m2 && m2[3] && m2[3] !== '*') totalSize = Number(m2[3]) || totalSize;
        }

        // Capture validators from origin for client/browser cacheability
        if (!etag) {
          const h = originResp.headers.get('ETag');
          if (h) etag = h;
        }
        if (!lastModified) {
          const h2 = originResp.headers.get('Last-Modified');
          if (h2) lastModified = h2;
        }

        const ab = await originResp.arrayBuffer();
        const blockBytes = new Uint8Array(ab);

        // Store block as 200 OK in Worker cache
        const storeHeaders = new Headers();
        storeHeaders.set('Cache-Control', 'public, max-age=31536000, immutable, no-transform');
        storeHeaders.set('Content-Type', originResp.headers.get('Content-Type') || 'application/octet-stream');
        if (totalSize) storeHeaders.set('X-File-Size', String(totalSize));
        if (etag) storeHeaders.set('ETag', etag);
        if (lastModified) storeHeaders.set('Last-Modified', lastModified);
        const storeResp = new Response(blockBytes, { status: 200, headers: storeHeaders });
        try { await caches.default.put(blockReq, storeResp.clone()); } catch {}

        return blockBytes;
      }).catch(async (err) => {
        // On error, fall back to direct passthrough for the original range
        const originResp = await fetch(origin.toString(), { method: 'GET', headers });
        const outHeaders = new Headers(originResp.headers);
        outHeaders.set('Access-Control-Allow-Origin', '*');
        outHeaders.set('Access-Control-Expose-Headers', '*');
        outHeaders.set('X-Worker-Cache', 'BYPASS');
        throw new Response(originResp.body, { status: originResp.status, statusText: originResp.statusText, headers: outHeaders });
      });

      blocks.push(bytes);
    }

    // Assemble requested subrange from cached blocks
    const resultLen = end - start + 1;
    const result = new Uint8Array(resultLen);
    let offset = 0;
    for (let b = firstBlock; b <= lastBlock; b++) {
      const blockBytes = blocks[b - firstBlock];
      const blockStart = b * BLOCK_SIZE;
      const from = Math.max(0, start - blockStart);
      const to = Math.min(BLOCK_SIZE, end - blockStart + 1);
      if (from < to) {
        result.set(blockBytes.subarray(from, to), offset);
        offset += (to - from);
      }
    }

    const outHeaders = new Headers();
    outHeaders.set('Accept-Ranges', 'bytes');
    outHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    outHeaders.set('Access-Control-Allow-Origin', '*');
    outHeaders.set('Access-Control-Expose-Headers', '*');
    outHeaders.set('Content-Length', String(resultLen));
    if (totalSize) outHeaders.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
    else outHeaders.set('Content-Range', `bytes ${start}-${end}/*`);
    outHeaders.set('Content-Type', 'application/octet-stream');
    outHeaders.set('Content-Encoding', 'identity');
    outHeaders.set('Timing-Allow-Origin', '*');
    outHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
    outHeaders.set('Vary', 'Range');
    if (etag) outHeaders.set('ETag', etag);
    if (lastModified) outHeaders.set('Last-Modified', lastModified);
    outHeaders.set('X-Worker-Cache', hits > 0 && misses === 0 ? 'HIT' : (hits > 0 ? 'PARTIAL' : 'MISS'));
    outHeaders.set('X-Worker-Blocks', `hit=${hits},miss=${misses}`);
    return new Response(result, { status: 206, headers: outHeaders });
  },
};
