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
  const qs = url.search || '';
  return `${base}/${path}${qs}`;
}

async function proxy(method: 'GET' | 'HEAD', req: NextRequest, ctx: { params: { path: string[] } }) {
  const target = buildUpstreamUrl(req, ctx.params.path || []);
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

  // Strong client caching for tiles; vary on Range
  if (!out.has('cache-control')) {
    out.set('cache-control', 'public, max-age=31536000, immutable');
  }
  out.set('vary', ['range', upstreamResp.headers.get('vary') || ''].filter(Boolean).join(', '));

  return new Response(method === 'HEAD' ? null : upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: out,
  });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy('GET', req, ctx);
}

export async function HEAD(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy('HEAD', req, ctx);
}

