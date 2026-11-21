// Is anyone in view? A blurry, empty close-up reads as "still loading", so when the model or HYDE puts no one on screen
// the left column says so (FootstepsViz.tsx). Counts cells whose centre is inside the view box, plus half a cell, so a
// group just past the edge still counts.
import type { Region } from '@/components/footsteps/hooks/unitRegion';

type Cells = { length: number; positions: Float32Array; people: Float32Array; cellDeg: number };

const inLon = (lon: number, west: number, east: number) => {
  if (east - west >= 360) return true;
  const d = (((lon - west) % 360) + 360) % 360; // handles boxes that cross the dateline
  return d <= east - west;
};

/** People in cells inside `box` (stops counting once it passes `enough`). */
export function peopleInView(grid: Cells, box: Region, enough = 1): number {
  const pad = grid.cellDeg / 2;
  const west = box.west - pad;
  const east = box.east + pad;
  const south = box.south - pad;
  const north = box.north + pad;
  let sum = 0;
  for (let i = 0; i < grid.length; i++) {
    const lat = grid.positions[i * 2 + 1];
    if (lat < south || lat > north) continue;
    if (!inLon(grid.positions[i * 2], west, east)) continue;
    sum += grid.people[i];
    if (sum >= enough) return sum;
  }
  return sum;
}

/** Other-human bands inside `box`. */
export function bandsInView(bands: readonly { position: [number, number] }[], box: Region): number {
  let n = 0;
  for (const b of bands) {
    const [lon, lat] = b.position;
    if (lat >= box.south && lat <= box.north && inLon(lon, box.west, box.east)) n++;
  }
  return n;
}

/** Whose people are on screen: the pre-HYDE model, HYDE's, or HYDE's climate-adjusted spread (`?spread=1`, lib/adjustedSpread.ts). */
export type PeopleSource = 'model' | 'hyde' | 'adjusted';

const NOBODY: Record<PeopleSource, { here: string; inView: string }> = {
  model: { here: 'None of our species here at this date in the model.', inView: 'the model puts no people in view' },
  hyde: { here: 'HYDE has no people here at this date.', inView: 'HYDE has no people in view' },
  adjusted: { here: 'The adjusted spread has no people here at this date.', inView: 'the adjusted spread (modelled on HYDE) has no people in view' },
};

/** The note for an empty view, or null when someone is there. */
export function emptyViewNote(people: number, otherBands: number, source: PeopleSource): string | null {
  if (people >= 1) return null;
  if (otherBands > 0) return `${NOBODY[source].here} The lavender sparks are another kind of human (guessed).`;
  return `No one here at this date: ${NOBODY[source].inView}. Zoom out or move the slider to find them.`;
}
