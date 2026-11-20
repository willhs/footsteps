// Guessed bands of the other kinds of human: one point per band of ~15 people, placed by
// footstep-generator/other_humans_bands.py (habitat model × hand-drawn range, dry land at each era's sea level).
// The number of bands is a guess and every place is imagined; docs/ops/other-humans.md.
import type { OtherHuman } from './otherHumans';

export const BANDS_URL = '/other_humans/bands.json';

/** [lon, lat, hinted 0|1, from_ka, to_ka, from_ka, to_ka, ...]: held from from_ka down to to_ka. */
export type BandRow = number[];
export type BandsFile = {
  band_people: number;
  first_ka: number;
  last_ka: number;
  species: Record<OtherHuman['id'], { people: number; bands: BandRow[] }>;
};

/** `rank` 0..1 is the band's place in the file's stable random order: the zoom shows ranks below a threshold. */
export type Band = { position: [number, number]; hinted: boolean; rank: number };

/** The generator's 1 ka step for `year`, clamped to its span. */
export function bandStepKa(file: Pick<BandsFile, 'first_ka' | 'last_ka'>, year: number): number {
  return Math.min(file.first_ka, Math.max(file.last_ka, Math.round((1950 - year) / 1000)));
}

/** A species' bands at `year`. Rows are in a stable random order, so a fading species (`presence` < 1)
 * keeps only the first share of them: bands drop out one by one rather than all dimming together. */
export function bandsAt(rows: BandRow[], ka: number, presence: number): Band[] {
  const keep = Math.ceil(rows.length * Math.max(0, Math.min(1, presence)));
  const out: Band[] = [];
  for (let i = 0; i < keep; i++) {
    const r = rows[i];
    for (let j = 3; j + 1 < r.length; j += 2) {
      if (r[j] >= ka && ka >= r[j + 1]) {
        out.push({ position: [r[0], r[1]], hinted: r[2] === 1, rank: i / rows.length });
        break;
      }
    }
  }
  return out;
}
