import { NextRequest } from 'next/server';

// Force Node.js runtime to preserve streaming semantics
export const runtime = 'nodejs';

function upstreamBase(): string {
  const raw = (process.env.PMTILES_ORIGIN || '').trim();
  if (!raw) return 'https://pmtiles.willhs.me';
  return raw.replace(/\/$/, '');
}

function buildUpstreamUrl(req: NextRequest, pathParts: string[]): string {
  const base = upstreamBase();
  const url = new URL(req.url);
  const path = pathParts.join('/');
  // Strip client-only cache-busting key used to defeat Chrome HTTP/1.1
  // cache entry locking on Range requests when desired.
  const params = new URLSearchParams(url.search);
  params.delete('rk');
  const qs = params.toString();
  return `${base}/${path}${qs ? `?${qs}` : ''}`;
}

async function proxy(
  method: 'GET' | 'HEAD',
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const target = buildUpstreamUrl(req, path || []);
  const range = req.headers.get('range') || undefined;

  const headers: Record<string, string> = {
    // Disable content-coding to keep byte ranges stable
    'accept-encoding': 'identity',
    // Pass through range if present
    ...(range ? { range } : {}),
    // Hint to intermediaries not to transform payload
    'cache-control': 'no-transform',
    // Identify proxy for debugging (harmless)
    'user-agent': 'footsteps/pmtiles-proxy',
  };

  const upstreamResp = await fetch(target, {
    method,
    headers,
    // Never let Next.js cache this server fetch; rely on browser caching
    cache: 'no-store',
  } as RequestInit);

  // Copy critical headers through; avoid hop-by-hop
  const out = new Headers();
  const pass = [
    'content-type',
    'content-range',
    'accept-ranges',
    'content-length',
    'etag',
    'last-modified',
    'expires',
  ];
  for (const h of pass) {
    const v = upstreamResp.headers.get(h);
    if (v) out.set(h, v);
  }

  // Cache policy: allow disabling cache entirely in dev to avoid Chrome
  // cache-entry locking on 206 responses over HTTP/1.1
  const forceNoStore = (process.env.PMTILES_PROXY_NOSTORE || process.env.NEXT_PUBLIC_PM_NOSTORE || '').toString() === 'true';
  if (forceNoStore) {
    out.set('cache-control', 'no-store, no-cache, must-revalidate');
  } else if (!out.has('cache-control')) {
    // Strong client caching for tiles; vary on Range
    out.set('cache-control', 'public, max-age=31536000, immutable');
  }
  out.set('vary', ['range', upstreamResp.headers.get('vary') || ''].filter(Boolean).join(', '));
  // Help DevTools surface server timing and custom headers
  out.set('timing-allow-origin', '*');
  out.set('access-control-expose-headers', '*');

  return new Response(method === 'HEAD' ? null : upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: out,
  });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy('GET', req, ctx);
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy('HEAD', req, ctx);
}
