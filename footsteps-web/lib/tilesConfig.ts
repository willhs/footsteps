// Centralized tile URL configuration for frontend
// Priority:
// 1) NEXT_PUBLIC_TILES_BASE_URL (explicit full base URL)
// 2) NEXT_PUBLIC_GCS_TILES_BUCKET => https://storage.googleapis.com/{bucket}/tiles/humans
// 3) In production: default to prod bucket (footsteps-earth-tiles)
// 4) Fallback: Next.js API route (/api/tiles) for local development.

function normalizeBase(url: string): string {
  let u = url.trim();
  // Remove any trailing slashes to simplify concatenation
  while (u.endsWith('/')) u = u.slice(0, -1);
  return u;
}

export function getTilesBaseUrl(): string {
  // 1) Explicit base URL takes precedence
  const explicit = process.env.NEXT_PUBLIC_TILES_BASE_URL;
  if (explicit) return normalizeBase(explicit);

  // 2) Compute from public GCS bucket env if provided
  const bucket = process.env.NEXT_PUBLIC_GCS_TILES_BUCKET;
  if (bucket) {
    return normalizeBase(`https://storage.googleapis.com/${bucket}/tiles/humans`);
  }

  // 3) Use API route by default for both production and development
  // This enables HTTP byte-range requests to GCS in production
  // and local filesystem access in development
  return '/api/tiles';
}

// Returns a deck.gl URL template for a given year
// Example when NEXT_PUBLIC_TILES_BASE_URL is set to
//   https://storage.googleapis.com/footsteps-earth-tiles/tiles/humans
// Output:
//   https://storage.googleapis.com/footsteps-earth-tiles/tiles/humans/{year}/single/{z}/{x}/{y}.pbf
export function getTileUrlPattern(year: number): string {
  return `${getTilesBaseUrl()}/${year}/single/{z}/{x}/{y}.pbf`;
}
