// Islands HYDE leaves empty although people lived there. The served images have no populated cell on Tahiti, the Marquesas or
// the Azores in any year, 1900 included (research 0015): HYDE's land mask or country table misses them. Here each gets a
// rough head count over a few 5′ cells round its centres, only where the image has none there. The counts are approximate
// literature figures, labelled modelled in docs/ops/grid-images.md; the timing of settlement is the better-known part.

export type MissingIsland = {
  name: string;
  /** Centres [lon, lat] of the island's land; each takes the cells within `radiusDeg`. */
  centres: readonly (readonly [number, number])[];
  radiusDeg: number;
  /** [calendar year, people], ascending; linear between, 0 before the first, held after the last. */
  people: readonly (readonly [number, number])[];
  source: string;
};

export const MISSING_ISLANDS: readonly MissingIsland[] = [
  {
    name: 'Society Islands (Tahiti, Raiatea)',
    centres: [[-149.43, -17.68], [-151.45, -16.83]],
    radiusDeg: 0.12,
    people: [[1050, 0], [1200, 2000], [1400, 20000], [1600, 35000], [1767, 35000], [1800, 16000], [1850, 9000], [1900, 10000]],
    source: 'Settled ~1025-1120 CE (Wilmshurst et al. 2011, PNAS 108:1815); ~35,000 at contact (Oliver 1974, Ancient Tahitian Society), ~16,000 counted by the 1797 missionaries, ~10,000 by 1900.',
  },
  {
    name: 'Marquesas',
    centres: [[-140.1, -8.86], [-139.03, -9.78]],
    radiusDeg: 0.1,
    people: [[1050, 0], [1200, 2000], [1500, 30000], [1700, 45000], [1800, 35000], [1850, 20000], [1900, 4300]],
    source: 'Settled ~1025-1120 CE (Wilmshurst et al. 2011); tens of thousands at contact (estimates 35,000-100,000), ~4,000 by 1900 after epidemics.',
  },
  {
    name: 'Rapa Nui',
    centres: [[-109.35, -27.12]],
    radiusDeg: 0.07,
    people: [[1150, 0], [1250, 500], [1400, 2500], [1600, 4000], [1722, 3000], [1860, 2000], [1877, 111], [1900, 200]],
    source: 'Settled ~1200 CE (Hunt & Lipo 2006, Science 311:1603); ~3,000 at Roggeveen\'s visit in 1722; 111 after the 1862 slave raids and epidemics (1877).',
  },
  {
    name: 'Azores',
    centres: [[-25.7, 37.78], [-25.45, 37.78], [-25.25, 37.8], [-27.2, 38.72], [-28.3, 38.47], [-28.7, 38.58]],
    radiusDeg: 0.06,
    people: [[1430, 0], [1500, 10000], [1600, 60000], [1700, 100000], [1800, 150000], [1900, 256000]],
    source: 'Uninhabited until Portuguese settlement from 1439; 256,291 in the 1900 census; earlier figures rough.',
  },
];

/** People on an island in a year (0 before settlement), linear between the listed years. */
export function islandPeopleAt(island: MissingIsland, year: number): number {
  const p = island.people;
  if (year <= p[0][0]) return 0;
  for (let i = 1; i < p.length; i++) {
    if (year <= p[i][0]) {
      const [y0, n0] = p[i - 1];
      const [y1, n1] = p[i];
      return n0 + ((n1 - n0) * (year - y0)) / (y1 - y0);
    }
  }
  return p[p.length - 1][1];
}

/** Indices (row * width + col) of an island's cells on an equirectangular grid `width` cells wide. */
export function islandCells(island: MissingIsland, width: number): number[] {
  const deg = 360 / width;
  const out = new Set<number>();
  for (const [lon, lat] of island.centres) {
    const r = Math.ceil(island.radiusDeg / deg);
    const col0 = Math.floor((lon + 180) / deg);
    const row0 = Math.floor((90 - lat) / deg);
    for (let dr = -r; dr <= r; dr++)
      for (let dc = -r; dc <= r; dc++) {
        const clon = -180 + (col0 + dc + 0.5) * deg;
        const clat = 90 - (row0 + dr + 0.5) * deg;
        if ((clon - lon) ** 2 + (clat - lat) ** 2 <= island.radiusDeg ** 2) out.add((row0 + dr) * width + col0 + dc);
      }
  }
  return [...out].sort((a, b) => a - b);
}
