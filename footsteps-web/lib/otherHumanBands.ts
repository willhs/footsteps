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

export type Band = { position: [number, number]; hinted: boolean };

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
        out.push({ position: [r[0], r[1]], hinted: r[2] === 1 });
        break;
      }
    }
  }
  return out;
}

/** One mark per species, white on transparent so deck.gl can tint it (IconLayer `mask`). */
export const BAND_MARK: Record<OtherHuman['id'], { glyph: string; path: string }> = {
  neanderthals: { glyph: '▲', path: 'M12 3 L22 20 L2 20 Z' },
  denisovans: { glyph: '■', path: 'M4 4 H20 V20 H4 Z' },
  floresiensis: { glyph: '✦', path: 'M12 1 L15 9 L23 12 L15 15 L12 23 L9 15 L1 12 L9 9 Z' },
  luzonensis: {
    glyph: '★',
    path: 'M12 1.5 L14.9 8.6 L22.5 9.2 L16.7 14.2 L18.5 21.6 L12 17.6 L5.5 21.6 L7.3 14.2 L1.5 9.2 L9.1 8.6 Z',
  },
};

export const bandIconUrl = (id: OtherHuman['id']) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24"><path d="${BAND_MARK[id].path}" fill="#fff"/></svg>`,
  )}`;
