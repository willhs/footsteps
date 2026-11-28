// Slider years: every year in the raw HYDE data. Units and Grid modes draw
// each from a ~1 MB WebP (footstep-generator/grid_image.py).
export const TARGET_YEARS = [
  -10000, -9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000,
  0, 100, 200, 300, 400, 500, 600, 700, 800, 900,
  1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900,
];

// Modelled population images (footstep-generator/prehistory_population.py): every
// 1,000 years from 100,000 BCE to 11,000 BCE, 0.5° cells. Same encoding and
// URL scheme as the HYDE years; the decoder upsamples them to HYDE's cell size.
// These are a MODEL, not data: every screen that shows them says "modelled".
export const MODELLED_YEARS: readonly number[] = Array.from({ length: 90 }, (_, i) => -100000 + i * 1000);

// Method, sources and limits of the modelled years (docs/research/0002).
export const MODEL_NOTES_URL =
  'https://github.com/willhs/footsteps/blob/main/docs/research/0002-pre-hyde-population-model/research.md';

// Rough people images after HYDE's last year (footstep-generator/modern_population.py): the 1900 grid
// scaled per UN region to UN WPP 2024 totals. An approximation that carries the timeline to today; no
// terrain or land-use change of their own (land use is 1900's).
export const MODERN_YEARS: readonly number[] = [1950, 2000, 2025];

// Every year that has a population image: modelled, measured (HYDE), then the rough modern years.
export const PEOPLE_YEARS: readonly number[] = [...MODELLED_YEARS, ...TARGET_YEARS, ...MODERN_YEARS];

// Years with pre-built dot tiles (Dots mode; ~10-40 min and ~0.7 GB each).
// Dots mode shows the nearest of these for any slider year.
export const DOT_TILE_YEARS = [
  -10000, -5000, -1000, 0, 500, 1000, 1500, 1800, 1900,
];

export function nearestDotTileYear(year: number): number {
  return DOT_TILE_YEARS.reduce((best, y) =>
    Math.abs(y - year) < Math.abs(best - year) ? y : best,
  );
}

// Terrain images (footstep-generator/terrain_image.py): every 1,000 years from
// 100,000 BCE, then every HYDE year from 0 CE so each carries its farmland.
// Every TARGET_YEAR is a terrain year.
export const TERRAIN_YEARS: readonly number[] = [
  ...Array.from({ length: 100 }, (_, i) => -100000 + i * 1000),
  ...Array.from({ length: 20 }, (_, i) => i * 100),
];

/** Terrain images' cache buster. Bump when the images are regenerated: Cloudflare caches /terrain for a day.
 * v3: farmland calibrated to the Blue Marble photo (2026-11-11). */
export const TERRAIN_VERSION = 3;

/** The year a visit opens at without `?year=`. */
export const DEFAULT_TIME = -1000;
