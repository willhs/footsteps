import type { GridData } from '../hooks/useGridLayer';
import { BAND_MAX_CELL, GLOW_MIN_CELL } from './units';

export type GroundingFacts = {
  year: number;
  cellId: number;
  longitude: number;
  latitude: number;
  people: number;
  neighbourhoodPeople: number;
  densityClass: 'band' | 'village' | 'glow';
  confidence: string;
};

/** Read decoded HYDE head counts, never the illustrative unit sizes/positions.
 * Empty pixels mean zero in the image, not proof of absence of people.
 */
export function groundingFacts(grid: GridData, year: number, lon: number, lat: number): GroundingFacts | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  const width = Math.round(360 / grid.cellDeg);
  const height = Math.round(180 / grid.cellDeg);
  const col = Math.floor((((lon + 180) % 360 + 360) % 360) / grid.cellDeg);
  const row = Math.min(height - 1, Math.floor((90 - lat) / grid.cellDeg));
  const cellId = row * width + col;
  // Nine lookups in the row-major, sorted sparse grid; no full-grid allocation.
  const population = (id: number) => {
    let lo = 0;
    let hi = grid.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (grid.cellIds[mid] < id) lo = mid + 1;
      else hi = mid;
    }
    return grid.cellIds[lo] === id ? grid.people[lo] : 0;
  };
  const people = population(cellId);
  let neighbourhoodPeople = 0;
  for (let r = Math.max(0, row - 1); r <= Math.min(height - 1, row + 1); r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      neighbourhoodPeople += population(r * width + (c + width) % width);
    }
  }
  return {
    year, cellId,
    longitude: -180 + (col + 0.5) * grid.cellDeg,
    latitude: 90 - (row + 0.5) * grid.cellDeg,
    people, neighbourhoodPeople,
    densityClass: people < BAND_MAX_CELL ? 'band' : people >= GLOW_MIN_CELL ? 'glow' : 'village',
    confidence: year < 1
      ? 'Before 1 CE, HYDE population values are modelled from sparse evidence; local counts are especially uncertain.'
      : year < 1800
        ? 'Historical HYDE population estimates are modelled; local counts are uncertain, not a census of this cell.'
        : 'HYDE estimates use more recent demographic evidence, but local counts remain modelled estimates.',
  };
}
