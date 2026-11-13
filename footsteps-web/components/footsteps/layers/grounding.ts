import type { GridData } from '../hooks/useGridLayer';
import { SETTLED_MIN_CELL, URBAN_MIN_CELL, type WayOfLifeValue } from '@/lib/waysOfLife';
import { evidenceAt, type Evidence } from '@/lib/time';

/** The model's own cell: its images are 0.5° blocks (gridData.ts decodes each as 6 × 6 cells). */
const MODELLED_CELL_DEG = 0.5;

export type GroundingFacts = {
  year: number;
  cellId: number;
  longitude: number;
  latitude: number;
  people: number;
  neighbourhoodPeople: number;
  densityClass: 'band' | 'village' | 'glow';
  /** How the people in this cell lived (HYDE land use); null for an empty cell. */
  way: WayOfLifeValue | null;
  confidence: string;
  /** Measured HYDE cell, or a block of the model. */
  evidence: Evidence;
  /** Side of the cell the counts describe, in degrees. */
  cellDeg: number;
};

/** Read decoded head counts, never the illustrative unit sizes/positions.
 * Empty pixels mean zero in the image, not proof of absence of people.
 * Before HYDE the counts are the model's, read per 0.5° block (the size it was made at).
 */
export function groundingFacts(grid: GridData, year: number, lon: number, lat: number): GroundingFacts | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  const evidence = evidenceAt(year);
  // Cells per side of the unit the counts describe (1 for HYDE).
  const span = evidence === 'modelled' ? Math.round(MODELLED_CELL_DEG / grid.cellDeg) : 1;
  const cellDeg = grid.cellDeg * span;
  const gridWidth = Math.round(360 / grid.cellDeg);
  const width = Math.round(360 / cellDeg);
  const height = Math.round(180 / cellDeg);
  const col = Math.floor((((lon + 180) % 360 + 360) % 360) / cellDeg);
  const row = Math.min(height - 1, Math.floor((90 - lat) / cellDeg));
  const cellId = row * width + col;
  const indexOf = (id: number) => {
    let lo = 0;
    let hi = grid.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (grid.cellIds[mid] < id) lo = mid + 1;
      else hi = mid;
    }
    return grid.cellIds[lo] === id ? lo : -1;
  };
  const lookup = (id: number) => {
    const at = indexOf(id);
    return at < 0 ? 0 : grid.people[at];
  };
  // People in one unit: a cell, or the span × span cells of a modelled block.
  const population = (r: number, c: number) => {
    let sum = 0;
    for (let i = 0; i < span; i++)
      for (let j = 0; j < span; j++) sum += lookup((r * span + i) * gridWidth + c * span + j);
    return sum;
  };
  const people = population(row, col);
  let neighbourhoodPeople = 0;
  for (let r = Math.max(0, row - 1); r <= Math.min(height - 1, row + 1); r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      neighbourhoodPeople += population(r, (c + width) % width);
    }
  }
  const perCell = people / (span * span);
  // A block of the model has no land use of its own: take the way of its fullest cell.
  let way: WayOfLifeValue | null = null;
  let fullest = 0;
  for (let i = 0; i < span; i++)
    for (let j = 0; j < span; j++) {
      const at = indexOf((row * span + i) * gridWidth + col * span + j);
      if (at >= 0 && grid.people[at] > fullest) {
        fullest = grid.people[at];
        way = grid.ways[at] as WayOfLifeValue;
      }
    }
  return {
    year, cellId,
    longitude: -180 + (col + 0.5) * cellDeg,
    latitude: 90 - (row + 0.5) * cellDeg,
    people, neighbourhoodPeople, way,
    // Thresholds are per ~10 km cell: compare a block's share of one.
    densityClass: perCell < SETTLED_MIN_CELL ? 'band' : perCell >= URBAN_MIN_CELL ? 'glow' : 'village',
    evidence, cellDeg,
    confidence: evidence === 'modelled'
      ? 'Modelled, not measured: this count is a model output (plant productivity, climate and when people arrived, scaled to a published world total). No one has seen people here.'
      : year < 1
      ? 'Before 1 CE, HYDE population values are modelled from sparse evidence; local counts are especially uncertain.'
      : year < 1800
        ? 'Historical HYDE population estimates are modelled; local counts are uncertain, not a census of this cell.'
        : 'HYDE estimates use more recent demographic evidence, but local counts remain modelled estimates.',
  };
}
