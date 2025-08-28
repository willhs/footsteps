#!/usr/bin/env node
// Test fetching a tile via sql.js-httpvfs from a remote MBTiles (e.g., GCS)
// Usage:
//   node scripts/test-httpvfs.mjs --url https://storage.googleapis.com/<bucket>/humans_<year>.mbtiles --z <z> --x <x> --y <y>
// Optional:
//   --page 4096              # SQLite page size (defaults to 4096)
//   --tms                     # Treat provided y as TMS already (no flip)

import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Lightweight arg parser
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      if (typeof next !== 'undefined' && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function isGzip(buf) {
  return buf && buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function yToTms(z, y) {
  return (1 << z) - 1 - y;
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url;
  const z = Number.parseInt(args.z, 10);
  const x = Number.parseInt(args.x, 10);
  const y = Number.parseInt(args.y, 10);
  const pageSize = args.page ? Number.parseInt(args.page, 10) : 4096;
  const noHideProcess = Boolean(args.nohide);
  const treatAsTms = Boolean(args.tms);

  const hasCoords = Number.isInteger(z) && Number.isInteger(x) && Number.isInteger(y);
  if (!url) {
    console.error('Usage: node scripts/test-httpvfs.mjs --url <http_url> [--z <z> --x <x> --y <y>] [--page 4096] [--tms]');
    console.error('       If z/x/y are omitted, the script will probe one tile from the MBTiles.');
    process.exit(2);
  }

  const req = createRequire(import.meta.url);
  const resolvePathToUrl = (specifier) => {
    try {
      const p = req.resolve(specifier);
      return pathToFileURL(p).toString();
    } catch {
      return null;
    }
  };

  const CDN_WORKER = 'https://unpkg.com/sql.js-httpvfs@0.8.12/dist/sqlite.worker.js';
  const CDN_WASM = 'https://unpkg.com/sql.js-httpvfs@0.8.12/dist/sql-wasm.wasm';

  let workerUrl;
  let wasmUrl;
  const hasDomWorker = typeof globalThis.Worker !== 'undefined';
  if (!hasDomWorker) {
    // In Node, polyfill Worker and use local worker file path; prefer CDN for wasm
    try {
      const nodeWorkerMod = await import('web-worker');
      globalThis.Worker = nodeWorkerMod.default || nodeWorkerMod;
      // Install a wrapper to intercept sync XHR bridge messages immediately on worker creation
      const __SYNC_CHANNEL = '__httpvfs_xhr_sync_v1';
      const BaseWorker = globalThis.Worker;
      function __attachSyncHandler(w) {
        try {
          w.addEventListener?.('message', async (e) => {
            const d = e && e.data;
            if (!d || d.__httpvfs_xhr_sync !== 1 || d.ch !== __SYNC_CHANNEL || !d.sab) return;
            try {
              const HEADER_I32S = 3;
              const headerBytes = HEADER_I32S * 4;
              const meta = new Int32Array(d.sab, 0, HEADER_I32S);
              const bodyView = new Uint8Array(d.sab, headerBytes);
              const res = await fetch(d.url, { method: 'GET', headers: d.headers });
              const ab = await res.arrayBuffer();
              let bytes = new Uint8Array(ab);
              if (typeof d.expectedLen === 'number' && d.expectedLen > 0) {
                if (bytes.length !== d.expectedLen) {
                  // Trim to available buffer length to avoid overflow
                  const limit = Math.min(bytes.length, bodyView.byteLength);
                  bytes = bytes.subarray(0, limit);
                }
              } else if (bytes.length > bodyView.byteLength) {
                bytes = bytes.subarray(0, bodyView.byteLength);
              }
              bodyView.set(bytes);
              try { console.log('[httpvfs-test][main] sync GET status', res.status, 'hdr', res.headers?.get && (res.headers.get('content-range') || res.headers.get('content-length') || '')); } catch {}
              Atomics.store(meta, 1, res.status|0);
              Atomics.store(meta, 2, bytes.length|0);
              Atomics.store(meta, 0, 1);
              Atomics.notify(meta, 0, 1);
            } catch (err) {
              try {
                const meta = new Int32Array(d.sab, 0, 3);
                Atomics.store(meta, 1, 0);
                Atomics.store(meta, 2, 0);
                Atomics.store(meta, 0, 1);
                Atomics.notify(meta, 0, 1);
              } catch {}
            }
          });
        } catch {}
        return w;
      }
      globalThis.Worker = class InterceptingWorker extends BaseWorker {
        constructor(url, options) {
          super(url, options);
          __attachSyncHandler(this);
        }
      };
    } catch (e) {
      console.warn('[httpvfs-test] Failed to load web-worker polyfill:', e);
    }
    let workerPath = null;
    try {
      workerPath = req.resolve('sql.js-httpvfs/dist/sqlite.worker.js');
    } catch {}
    if (!process.env.SQLJS_WORKER_URL && workerPath) {
      const fileUrl = pathToFileURL(workerPath).toString();
      const bootstrap = `
console.log('[httpvfs-test/bootstrap] start');
// Messaging primitives
try { console.log('[httpvfs-test/bootstrap] primitives', { hasPostMessage: typeof postMessage, hasAddEvent: typeof addEventListener, hasMessageChannel: typeof MessageChannel }); } catch {}
// Prepare to mask Node detection (process.versions) in sqlite.worker.js (unless disabled by --nohide)
const __realProcess = self.process;
${noHideProcess ? "console.log('[httpvfs-test/bootstrap] NOT masking process (nohide flag)');" : "try { const __p = self.process || globalThis.process; if (__p) { const __proxy = new Proxy(__p, { get: (t, p) => { try { if (p === 'versions') return undefined; } catch {} return Reflect.get(t, p); } }); try { self.process = __proxy; } catch {} try { globalThis.process = __proxy; } catch {} } else { try { self.process = undefined; } catch {} } } catch (e) { console.log('[httpvfs-test/bootstrap] process mask error', e && (e.message||e)); }"}
try { console.log('[httpvfs-test/bootstrap] process pre', typeof process, typeof process?.versions, process?.versions?.node); } catch {}
// Log environment and ensure fetch exists
try {
  console.log('[httpvfs-test/bootstrap] pre env', {
    hasFetch: typeof fetch,
    hasInstantiateStreaming: typeof WebAssembly.instantiateStreaming,
    hasAtob: typeof atob,
    location: (typeof location !== 'undefined' ? location.href : null),
  });
} catch (e) { console.log('[httpvfs-test/bootstrap] env log error', e && (e.message||e)); }
try { console.log('[httpvfs-test/bootstrap] process after env', typeof process, typeof process?.versions, process?.versions?.node); } catch {}
// Provide a minimal location so webpack publicPath uses location instead of Node path
try {
  if (typeof location === 'undefined' || !location || typeof location.href !== 'string') {
    const __loc = { href: '${fileUrl}', toString() { return this.href; } };
    try { self.location = __loc; } catch {}
    try { globalThis.location = __loc; } catch {}
  }
} catch (e) { console.log('[httpvfs-test/bootstrap] set location error', e && (e.message||e)); }
// Pre-head cache for synchronous HEAD checks used by the library
const __preHeadCache = new Map();
const __MBTILES_URL = ${JSON.stringify(String(url || ''))};
const __SYNC_CHANNEL = '__httpvfs_xhr_sync_v1';
const __DEFAULT_SYNC_BUF = ${Math.max(65536, (Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 4096) * 2)}; // conservative default
// Minimal XMLHttpRequest polyfill using fetch (supports GET/HEAD, responseType='arraybuffer', setRequestHeader, onreadystatechange/onload/onerror)
try {
  {
    class XHR {
      constructor() {
        this.readyState = 0; // UNSENT
        this.status = 0;
        this.statusText = '';
        this.response = null;
        this.responseType = '';
        this.onreadystatechange = null;
        this.onload = null;
        this.onerror = null;
        this._headers = {};
        this._respHeaders = new Map();
        this._aborted = false;
      }
      open(method, url, async = true) {
        this._method = method;
        this._url = url;
        const m = (method || '').toUpperCase();
        // Honor caller's async flag for both HEAD and GET (sql.js-httpvfs uses sync XHR for both)
        this._async = async !== false;
        try { console.log('[httpvfs-test/bootstrap][XHR] open', m, url, 'async=', this._async); } catch {}
        this.readyState = 1; // OPENED
        this._callReady();
      }
      setRequestHeader(k, v) { this._headers[k] = v; }
      getAllResponseHeaders() {
        return Array.from(this._respHeaders.entries()).map(([k,v]) => k+': '+v).join('\\r\\n');
      }
      getResponseHeader(k) { return this._respHeaders.get(k.toLowerCase()) || null; }
      abort() { this._aborted = true; }
      _callReady() { try { this.onreadystatechange && this.onreadystatechange(); } catch {} }
      async send(body) {
        try { console.log('[httpvfs-test/bootstrap][XHR] send', this._method, this._url, 'async=', this._async, 'respType=', this.responseType); } catch {}
        // Handle synchronous HEAD by serving from pre-fetched cache
        if (this._async === false) {
          const method = (this._method || '').toUpperCase();
          if (method === 'HEAD') {
            const key = String(this._url);
            const cached = __preHeadCache.get(key);
            if (cached) {
              this.status = cached.status || 0;
              this._respHeaders = new Map(Object.entries(cached.headers || {}));
              this.readyState = 2; this._callReady();
              this.readyState = 4; this._callReady();
              try { this.onload && this.onload(); } catch {}
              return;
            }
            // If no cache, treat as error
            try { console.log('[httpvfs-test/bootstrap][XHR] sync HEAD cache miss for', this._url); } catch {}
            this.status = 0;
            this.readyState = 4; this._callReady();
            try { this.onerror && this.onerror(new Error('Sync HEAD cache miss')); } catch {}
            return;
          }
          if (method === 'GET') {
            // Bridge to main thread via SharedArrayBuffer to implement sync GET
            try {
              const range = this._headers['Range'] || this._headers['range'] || '';
              let expectedLen = 0;
              // Case 1: bytes=a-b
              let m = /bytes\s*=\s*(\d+)\s*-\s*(\d+)/i.exec(range);
              if (m) {
                const from = parseInt(m[1], 10);
                const to = parseInt(m[2], 10);
                if (Number.isFinite(from) && Number.isFinite(to) && to >= from) expectedLen = (to - from + 1) | 0;
              } else {
                // Case 2: open-ended bytes=a-
                m = /bytes\s*=\s*(\d+)\s*-\s*$/i.exec(range);
                if (m) {
                  const from = parseInt(m[1], 10);
                  // Try to compute from HEAD content-length cache
                  let total = 0;
                  try {
                    const cached = __preHeadCache.get(this._url);
                    const cl = cached && cached.headers && (cached.headers['content-length'] || cached.headers['Content-Length']);
                    const n = cl ? parseInt(cl, 10) : NaN;
                    if (Number.isFinite(n) && n > 0) total = n;
                  } catch {}
                  if (Number.isFinite(from) && total > 0 && total > from) {
                    expectedLen = (total - from) | 0;
                  }
                }
              }
              try { console.log('[httpvfs-test/bootstrap][XHR] sync GET range', range, 'expectedLen=', expectedLen); } catch {}
              const HEADER_I32S = 3; // [flag, status, length]
              const headerBytes = HEADER_I32S * 4;
              const bodySize = expectedLen > 0 ? expectedLen : __DEFAULT_SYNC_BUF;
              const sab = new SharedArrayBuffer(headerBytes + bodySize);
              const meta = new Int32Array(sab, 0, HEADER_I32S);
              // flag=0 initially, main thread sets to 1 when done
              const msg = { __httpvfs_xhr_sync: 1, ch: __SYNC_CHANNEL, url: this._url, method: 'GET', headers: this._headers, expectedLen, sab };
              try { postMessage(msg); } catch (e) { console.log('[httpvfs-test/bootstrap][XHR] postMessage sync failed', e && (e.message||e)); }
              const w = Atomics.wait(meta, 0, 0, 20000);
              if (w === 'timed-out') {
                this.status = 0;
                this.readyState = 4; this._callReady();
                try { this.onerror && this.onerror(new Error('Sync GET timed out')); } catch {}
                return;
              }
              const status = Atomics.load(meta, 1) | 0;
              const len = Atomics.load(meta, 2) | 0;
              this.status = status;
              this.readyState = 2; this._callReady();
              if (len > 0) {
                const view = new Uint8Array(sab, headerBytes, len);
                const out = new Uint8Array(len);
                out.set(view);
                this.response = out.buffer;
              } else {
                this.response = new ArrayBuffer(0);
              }
              this.readyState = 4; this._callReady();
              try { this.onload && this.onload(); } catch {}
              return;
            } catch (e) {
              try { console.log('[httpvfs-test/bootstrap][XHR] sync GET bridge error', e && (e.message||e)); } catch {}
              this.status = 0;
              this.readyState = 4; this._callReady();
              try { this.onerror && this.onerror(e); } catch {}
              return;
            }
          }
          // Unsupported sync method
          try { console.log('[httpvfs-test/bootstrap][XHR] unsupported sync method', this._method); } catch {}
          this.status = 0;
          this.readyState = 4; this._callReady();
          try { this.onerror && this.onerror(new Error('Unsupported sync method')); } catch {}
          return;
        }
        try {
          const res = await fetch(this._url, { method: this._method, headers: this._headers, body });
          if (this._aborted) return;
          this.status = res.status;
          this.statusText = res.statusText || '';
          this._respHeaders = new Map();
          try { res.headers && res.headers.forEach((v,k)=>{ this._respHeaders.set(String(k).toLowerCase(), v); }); } catch {}
          this.readyState = 2; // HEADERS_RECEIVED
          this._callReady();
          if (this.responseType === 'arraybuffer') {
            this.response = await res.arrayBuffer();
          } else if (this.responseType === 'json') {
            this.response = await res.json();
          } else {
            this.response = await res.text();
          }
          if (this._aborted) return;
          this.readyState = 4; // DONE
          this._callReady();
          try { console.log('[httpvfs-test/bootstrap][XHR] response', this._url, this.status, this._respHeaders.get('content-range') || this._respHeaders.get('content-length') || ''); } catch {}
          try { this.onload && this.onload(); } catch {}
        } catch (err) {
          if (this._aborted) return;
          this.readyState = 4;
          this._callReady();
          try { this.onerror && this.onerror(err); } catch {}
        }
      }
    }
    self.XMLHttpRequest = XHR;
  }
} catch (e) { console.log('[httpvfs-test/bootstrap] XHR polyfill error', e && (e.message||e)); }
// Wrap fetch to log URL and response metadata
try {
  const _origFetch = fetch;
  self.fetch = async function() {
    const url = arguments[0];
    try { console.log('[httpvfs-test/bootstrap] fetch ->', url); } catch {}
    const res = await _origFetch.apply(this, arguments);
    try { console.log('[httpvfs-test/bootstrap] fetch <-', url, res.status, res.headers?.get && res.headers.get('content-type')); } catch {}
    return res;
  }
} catch (e) { console.log('[httpvfs-test/bootstrap] wrap fetch error', e && (e.message||e)); }
try {
  if (typeof fetch !== 'function' && typeof globalThis.fetch === 'function') {
    self.fetch = globalThis.fetch.bind(globalThis);
  }
  console.log('[httpvfs-test/bootstrap] post env', {
    hasFetch: typeof fetch,
    hasInstantiateStreaming: typeof WebAssembly.instantiateStreaming,
    hasAtob: typeof atob,
  });
} catch (e) { console.log('[httpvfs-test/bootstrap] set fetch error', e && (e.message||e)); }
// Preserve original importScripts reference
const __importScripts = typeof importScripts === 'function' ? importScripts : undefined;
// Buffer inbound messages until the real worker script is loaded, then re-dispatch
let __bufferingMessages = true;
const __msgQueue = [];
try {
  self.addEventListener('message', (e) => {
    try {
      if (__bufferingMessages) {
        __msgQueue.push(e.data);
        return;
      }
    } catch {}
    try {
      const t = typeof e?.data;
      const s = e && e.data && (e.data.type || (''+e.data).slice(0,120));
      console.log('[httpvfs-test/bootstrap] onmessage', t, s);
    } catch {}
  });
} catch {}
// Prefetch HEAD for the MBTiles URL to support sync HEAD XHR in the library, then load the real worker
(async () => {
  try {
    if (__MBTILES_URL) {
      const res = await fetch(__MBTILES_URL, { method: 'HEAD' });
      const headers = {};
      try { res.headers && res.headers.forEach((v,k)=>{ headers[String(k).toLowerCase()] = v; }); } catch {}
      __preHeadCache.set(__MBTILES_URL, { status: res.status, headers });
      try { console.log('[httpvfs-test/bootstrap] prehead', __MBTILES_URL, res.status, headers['content-length'], headers['accept-ranges']); } catch {}
    }
  } catch (e) { console.log('[httpvfs-test/bootstrap] prehead error', e && (e.message||e)); }
  try { __importScripts && __importScripts('${fileUrl}'); } catch (e) { console.error('[httpvfs-test/bootstrap] importScripts error', e && (e.message||e)); }
  // Restore importScripts reference (keep process masking)
  try { if (__importScripts) self.importScripts = __importScripts; } catch (e) {}
  // Flush queued messages now that sqlite.worker.js has installed handlers
  try {
    __bufferingMessages = false;
    for (const d of __msgQueue) {
      try { self.dispatchEvent({ type: 'message', data: d }); } catch {}
    }
    __msgQueue.length = 0;
  } catch {}
  try { console.log('[httpvfs-test/bootstrap] process post (masked)', typeof process, typeof process?.versions, process?.versions?.node); } catch {}
  console.log('[httpvfs-test/bootstrap] done importScripts');
})();`;
      const tmpFile = path.join(os.tmpdir(), `sqljs-httpvfs-bootstrap-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
      fs.writeFileSync(tmpFile, bootstrap, 'utf8');
      // Pass file:// URL so the web-worker polyfill resolves it correctly
      workerUrl = pathToFileURL(tmpFile).toString();
      // Ensure cleanup on exit
      process.on('exit', () => { try { fs.unlinkSync(tmpFile); } catch {} });
      process.on('SIGINT', () => { try { fs.unlinkSync(tmpFile); } catch {}; process.exit(130); });
    } else {
      workerUrl = String(process.env.SQLJS_WORKER_URL || CDN_WORKER);
    }
    wasmUrl = String(process.env.SQLJS_WASM_URL || CDN_WASM);
  } else {
    // Browser-like environment (unlikely in this script), allow file URLs
    workerUrl = String(
      process.env.SQLJS_WORKER_URL ||
        resolvePathToUrl('sql.js-httpvfs/dist/sqlite.worker.js') ||
        CDN_WORKER,
    );
    wasmUrl = String(
      process.env.SQLJS_WASM_URL ||
        resolvePathToUrl('sql.js-httpvfs/dist/sql-wasm.wasm') ||
        CDN_WASM,
    );
  }

  // Preflight: ensure we can message the worker
  try {
    const pingW = new Worker(workerUrl);
    let gotPing = false;
    pingW.addEventListener?.('message', (e) => {
      try { console.log('[httpvfs-test] preflight message from worker:', typeof e?.data, (e && e.data && (e.data.type || (''+e.data).slice(0,120)))); } catch {}
      gotPing = true;
    });
    pingW.addEventListener?.('error', (e) => {
      console.error('[httpvfs-test] preflight worker error:', e?.message || e);
    });
    try { pingW.postMessage?.({ type: 'ping', t: Date.now() }); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try { pingW.terminate?.(); } catch {}
    if (!gotPing) console.warn('[httpvfs-test] preflight: no message observed from worker within 1s');
  } catch (e) {
    console.warn('[httpvfs-test] preflight: creating worker failed:', e?.message || String(e));
  }

  const mod = await import('sql.js-httpvfs');
  const createDbWorker = mod.createDbWorker || mod.default?.createDbWorker;
  if (typeof createDbWorker !== 'function') {
    console.error('[httpvfs-test] createDbWorker not available from sql.js-httpvfs');
    process.exit(1);
  }

  process.on('unhandledRejection', (err) => { console.error('[httpvfs-test] UNHANDLED REJECTION', err); process.exit(1); });
  console.log('[httpvfs-test] init worker...', { workerUrl, wasmUrl, pageSize });
  let worker;
  try {
    const createPromise = createDbWorker([
    {
      from: 'inline',
      config: {
        serverMode: 'full',
        requestChunkSize: pageSize,
        url,
      },
    },
    ], workerUrl, wasmUrl);
    const created = await Promise.race([
      createPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('createDbWorker timeout after 20s')), 20000)),
    ]);
    worker = created;
  } catch (e) {
    console.error('[httpvfs-test] createDbWorker failed:', e);
    process.exit(1);
  }
  console.log('[httpvfs-test] worker ready');
  const watchdog = setTimeout(() => {
    console.error('[httpvfs-test] watchdog: timeout waiting for worker/DB response');
    try { worker?.worker?.terminate?.(); } catch {}
    process.exit(1);
  }, 20000);

  try {
    let buf;
    let zUsed, xUsed, tmsYUsed;

    if (hasCoords) {
      const tmsY = treatAsTms ? y : yToTms(z, y);
      const sql = 'SELECT hex(tile_data) AS h FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=? LIMIT 1;';
      console.log('[httpvfs-test] running exact query...');
      const res = await worker.db.exec(sql, [z, x, tmsY]);
      console.log('[httpvfs-test] exact query result rows:', Array.isArray(res)? res[0]?.values?.length : typeof res);
      clearTimeout(watchdog);
      const hex = Array.isArray(res) && res.length > 0 && res[0] && Array.isArray(res[0].values) && res[0].values[0]
        ? res[0].values[0][0]
        : null;
      if (!hex || typeof hex !== 'string' || hex.length === 0) {
        console.error('[httpvfs-test] tile not found');
        process.exit(1);
      }
      buf = Buffer.from(hex, 'hex');
      zUsed = z; xUsed = x; tmsYUsed = tmsY;
    } else {
      // Probe one tile directly from DB (highest zoom first)
      console.log('[httpvfs-test] probing for any tile...');
      const res = await worker.db.exec('SELECT zoom_level, tile_column, tile_row, hex(tile_data) AS h FROM tiles ORDER BY zoom_level DESC LIMIT 1;');
      clearTimeout(watchdog);
      console.log('[httpvfs-test] probe result rows:', Array.isArray(res)? res[0]?.values?.length : typeof res);
      const row = Array.isArray(res) && res.length > 0 && res[0] && Array.isArray(res[0].values) && res[0].values[0] ? res[0].values[0] : null;
      if (!row) {
        console.error('[httpvfs-test] no tiles found in MBTiles');
        process.exit(1);
      }
      zUsed = row[0]; xUsed = row[1]; tmsYUsed = row[2];
      const hex = row[3];
      buf = Buffer.from(hex, 'hex');
      const xyzY = (1 << zUsed) - 1 - tmsYUsed;
      console.log(`[httpvfs-test] probed tile -> z=${zUsed} x=${xUsed} y(XYZ)=${xyzY} y(TMS)=${tmsYUsed}`);
    }

    console.log('[httpvfs-test] tile bytes:', buf.length);

    if (isGzip(buf)) {
      try {
        gunzipSync(buf);
        console.log('[httpvfs-test] gzip integrity: OK');
      } catch (e) {
        console.error('[httpvfs-test] gzip integrity: FAILED', e);
        process.exit(1);
      }
    } else {
      console.log('[httpvfs-test] tile not gzip, skipping integrity inflate');
    }

    if (worker && worker.worker && typeof worker.worker.bytesRead?.then === 'function') {
      try {
        const bytes = await worker.worker.bytesRead;
        console.log('[httpvfs-test] bytesRead:', bytes);
      } catch {}
    }

    console.log('[httpvfs-test] success:', { z: zUsed ?? z, x: xUsed ?? x, y, tmsY: tmsYUsed });
  } finally {
    try {
      if (worker && worker.worker && typeof worker.worker.terminate === 'function') {
        worker.worker.terminate();
      }
    } catch {}
  }
}

main().catch((err) => {
  console.error('[httpvfs-test] error:', err);
  process.exit(1);
});
