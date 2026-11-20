// A static file server for the exported site (`out/`), shared by the terrain benchmark and the visual regression run.
// Production cache headers (public/_headers, Caddy) and gzip for text, so loads here behave like the deployed app.
//
//   const { server, base } = await serveStatic(root);                  // one directory
//   const { server, base } = await serveStatic([out, { prefix: '/grid', dir: '/data/tiles/grid' }, publicDir]);
//
// Roots are tried in order; the first that has the file answers. A `{ prefix, dir }` root maps a URL folder onto a directory
// elsewhere (the data that is not in git: `data/tiles/grid` is served as `/grid`). A plain directory maps the URL path as is.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.geojson': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.pmtiles': 'application/octet-stream',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.geojson', '.svg', '.txt']);

/** Cache headers like production (public/_headers, Caddy): the shell revalidates, hashed assets are immutable, data lasts a day. */
function cacheControl(urlPath, ext) {
  if (ext === '.html' || urlPath === '/' || urlPath === '/sw.js') return 'public, max-age=0, must-revalidate';
  if (urlPath.startsWith('/_next/') || ext === '.js' || ext === '.css') return 'public, max-age=31536000, immutable';
  return 'public, max-age=86400';
}

/** The file a URL path names under one root, or null. `.html` is tried for a bare path, as a static host does. */
export function resolveIn(root, urlPath) {
  const entry = typeof root === 'string' ? { prefix: '', dir: root } : root;
  if (entry.prefix && urlPath !== entry.prefix && !urlPath.startsWith(`${entry.prefix}/`)) return null;
  const dir = path.resolve(entry.dir);
  let file = path.join(dir, path.normalize(urlPath.slice(entry.prefix.length)));
  if (file !== dir && !file.startsWith(dir + path.sep)) return null;
  if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file += '.html';
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

export function serveStatic(roots) {
  const list = Array.isArray(roots) ? roots : [roots];
  const gz = new Map();
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let file = null;
    for (const root of list) if ((file = resolveIn(root, urlPath))) break;
    if (!file) return void res.writeHead(404).end('not found');
    const ext = path.extname(file);
    const headers = { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': cacheControl(urlPath === '/index.html' ? '/' : urlPath, ext) };
    const stat = fs.statSync(file);
    headers.ETag = `"${stat.size}-${stat.mtimeMs}"`;
    if (req.headers['if-none-match'] === headers.ETag) return void res.writeHead(304, headers).end();
    headers['Accept-Ranges'] = 'bytes';
    // Dots reads PMTiles with HTTP Range requests: answer 206 with just those bytes, like Caddy does.
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2]) && !COMPRESSIBLE.has(ext)) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) return void res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers);
      return void fs.createReadStream(file, { start, end }).pipe(res);
    }
    let body = fs.readFileSync(file);
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      if (!gz.has(file)) gz.set(file, zlib.gzipSync(body));
      body = gz.get(file);
      headers['Content-Encoding'] = 'gzip';
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers).end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}
