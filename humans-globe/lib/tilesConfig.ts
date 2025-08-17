// Centralized tile URL configuration for frontend
// Use NEXT_PUBLIC_TILES_BASE_URL to point to a static tiles host (e.g., GCS/CDN)
// Falls back to Next.js API route when not set for local development.

function normalizeBase(url: string): string {
  let u = url.trim();
  // Remove any trailing slashes to simplify concatenation
  while (u.endsWith('/')) u = u.slice(0, -1);
  return u;
}

export function getTilesBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_TILES_BASE_URL || '/api/tiles';
  return normalizeBase(base);
}

// Returns a deck.gl URL template for a given year
// Example when NEXT_PUBLIC_TILES_BASE_URL is set to
//   https://storage.googleapis.com/footsteps-earth-tiles/tiles/humans
// Output:
//   https://storage.googleapis.com/footsteps-earth-tiles/tiles/humans/{year}/single/{z}/{x}/{y}.pbf
export function getTileUrlPattern(year: number): string {
  return `${getTilesBaseUrl()}/${year}/single/{z}/{x}/{y}.pbf`;
}
