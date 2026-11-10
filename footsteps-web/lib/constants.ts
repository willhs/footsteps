// Slider years: every year in the raw HYDE data. Units and Grid modes draw
// each from a ~1 MB WebP (footstep-generator/grid_image.py).
export const TARGET_YEARS = [
  -10000, -9000, -8000, -7000, -6000, -5000, -4000, -3000, -2000, -1000,
  0, 100, 200, 300, 400, 500, 600, 700, 800, 900,
  1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900,
];

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
