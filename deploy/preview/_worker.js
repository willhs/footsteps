// Footsteps PR previews on Cloudflare Pages (.github/workflows/preview.yml, docs/ops/previews.md).
//
// A preview is the PR's static export, but the data it reads (population, terrain, habitat and fauna
// images, PMTiles, the day and anthropology API) is not in git: it lives on budgie. This worker serves
// the PR's own files first and fetches anything the build does not have from production, on the
// same origin, so the app's relative URLs (/grid/..., /api/...) work unchanged and need no CORS.

/** Where the data lives: budgie, through its Cloudflare Tunnel. */
const PRODUCTION_ORIGIN = 'https://footsteps.willhs.me';

/** Always answered by production: the API has no static files and takes POSTs. */
const ALWAYS_PRODUCTION_PREFIXES = ['/api/'];

/** The status Pages returns when the PR's build has no such file. */
const NOT_FOUND = 404;

/** Methods a static file can answer. Anything else goes straight to production. */
const STATIC_METHODS = new Set(['GET', 'HEAD']);

function fromProduction(request) {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, PRODUCTION_ORIGIN);

  // Same method, headers (Range, for PMTiles) and body; the Host follows the target URL.
  return fetch(new Request(target, request));
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    const alwaysProduction = ALWAYS_PRODUCTION_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    if (alwaysProduction || !STATIC_METHODS.has(request.method)) return fromProduction(request);

    const own = await env.ASSETS.fetch(request);
    if (own.status !== NOT_FOUND) return own;

    return fromProduction(request);
  },
};
