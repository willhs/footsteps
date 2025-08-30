'use strict';

// Minimal preempting proxy SW for .pmtiles
// - Global MAX_CONCURRENCY
// - Immediate preemption of oldest in-flight when saturated
// - No caching, no block/assembly logic
// - Pass-through responses with minimal debug headers

const MAX_CONCURRENCY = 6; // align with deck.gl maxRequests

// FIFO for preemption (oldest first)
const active = [];

function preemptOldest() {
  const victim = active.shift();
  if (victim) {
    try { victim.ctrl.abort(); } catch {}
  }
}

function acquireSlot() {
  if (active.length >= MAX_CONCURRENCY) preemptOldest();
  const ctrl = new AbortController();
  const entry = { ctrl, t: performance.now() };
  active.push(entry);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const i = active.indexOf(entry);
    if (i >= 0) active.splice(i, 1);
  };
  return { ctrl, release };
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.pathname.endsWith('.pmtiles')) return;
  event.respondWith(proxyPassthrough(req));
});

async function proxyPassthrough(origReq) {
  const { ctrl, release } = acquireSlot();
  const onAbort = () => { try { ctrl.abort(); } catch {} };
  try {
    if (origReq.signal) origReq.signal.addEventListener('abort', onAbort, { once: true });

    // Build a new Request init to ensure we can attach our AbortSignal and keep Range stable
    const init = {
      method: origReq.method,
      headers: new Headers(origReq.headers),
      mode: origReq.mode,
      credentials: origReq.credentials,
      cache: origReq.cache,
      redirect: origReq.redirect,
      referrer: origReq.referrer,
      referrerPolicy: origReq.referrerPolicy,
      integrity: origReq.integrity,
      keepalive: origReq.keepalive,
      signal: ctrl.signal,
    };
    // Ensure no content-coding transforms that might break Range semantics
    try { init.headers.set('Accept-Encoding', 'identity'); } catch {}

    const originResp = await fetch(origReq.url, init);

    // Pass-through response; add minimal debug headers
    const outHeaders = new Headers(originResp.headers);
    outHeaders.set('X-SW-Proxy', 'preempting');
    outHeaders.set('Timing-Allow-Origin', '*');
    outHeaders.set('Access-Control-Expose-Headers', '*');

    return new Response(originResp.body, {
      status: originResp.status,
      statusText: originResp.statusText,
      headers: outHeaders,
    });
  } finally {
    try { if (origReq.signal) origReq.signal.removeEventListener('abort', onAbort); } catch {}
    release();
  }
}
