// Regions whose HYDE total is too low or too high for a span of years, moved toward a published figure. Cells keep HYDE's
// pattern inside the region; only its total changes, and the people added or removed are not taken from anywhere else
// (the world total moves by that much). Applied per cell in `gridDataFrom` (components/footsteps/hooks/gridData.ts).
// Research 0017 (docs/research/0017-australia-philippines) reads the sources.

type Box = readonly [west: number, south: number, east: number, north: number]; // degrees

export type RegionTotal = {
  id: string;
  name: string;
  /** A cell belongs to the region when its centre is inside one of these boxes, which must not overlap. */
  boxes: readonly Box[];
  /** The region's total that the correction moves toward. */
  targetPeople: number;
  /** [calendar year, weight], ascending: 0 is HYDE's total as it is, 1 is `targetPeople`; linear between, 0 outside. */
  weights: readonly (readonly [number, number])[];
  source: string;
};

// Australia at European contact. Williams 2013 (Proc R Soc B 280:20130486, PMC3652441; abstract and Table 1 read
// 2026-11-28) fits a taphonomy-corrected radiocarbon curve to the ethnohistorical contact estimates and gets
// "approximately 770 000-1.1 million at the time of European contact", after a high of ~1.2 million at ~0.5 ka (1450 CE).
// Contact estimates it reviews: Radcliffe-Brown 250-300,000, Mulvaney & White ~750,000, Butlin up to 1.2 million.
// HYDE 3.5 has 0.36-0.44 million there through 1-1800 CE, flat.
const AUSTRALIA_CONTACT_LOW = 770_000;
const AUSTRALIA_CONTACT_HIGH = 1_100_000;
const AUSTRALIA_CONTACT = (AUSTRALIA_CONTACT_LOW + AUSTRALIA_CONTACT_HIGH) / 2;

// Williams 2013 finds growth "in pulses (approx. 8.3-6.6, 4.4-3.7 and 1.6-0.4 ka)", the largest in the last: his Table 1
// (founding population 2,000 at 50 ka) rises ~6-fold from 4 ka to 0.5 ka. HYDE already grows a little before 400 CE, so
// only the last pulse is added: HYDE's total at 1.6 ka (~400 CE), the contact figure by 0.4 ka (~1550 CE, held at 1500 CE,
// the nearest image year), held to 1788. HYDE's 1800 is already after the 1789 smallpox epidemic and is left as it is.
const LAST_PULSE_START = 400; // 1.6 ka BP, rounded to an image year
const LAST_PULSE_END = 1500; // 0.4 ka BP is ~1550 CE; 1500 is the image year before it
const FIRST_FLEET = 1788;
const AFTER_CONTACT = 1800; // HYDE's own figure again (the next image year)

export const REGION_TOTALS: readonly RegionTotal[] = [
  {
    id: 'australia',
    name: 'Australia',
    // Mainland and Tasmania, then the Top End and Cape York north of 11.8° S; New Guinea and Milne Bay stay out.
    boxes: [
      [112, -44, 154, -11.8],
      [129, -11.8, 143.5, -10.6],
    ],
    targetPeople: AUSTRALIA_CONTACT,
    weights: [
      [LAST_PULSE_START, 0],
      [LAST_PULSE_END, 1],
      [FIRST_FLEET, 1],
      [AFTER_CONTACT, 0],
    ],
    source:
      'Williams 2013, Proc R Soc B 280:20130486: ~770,000-1.1 million at European contact, after growth pulses of which the last (1.6-0.4 ka) is the largest. HYDE has ~0.4 million, flat.',
  },
];

/** The weight toward the target at `year` (0 = HYDE's total, 1 = the target). */
export function regionWeightAt(region: RegionTotal, year: number): number {
  const w = region.weights;
  if (year <= w[0][0] || year >= w[w.length - 1][0]) return 0;
  for (let i = 1; i < w.length; i++) {
    if (year <= w[i][0]) {
      const [y0, a] = w[i - 1];
      const [y1, b] = w[i];
      return a + ((b - a) * (year - y0)) / (y1 - y0);
    }
  }
  return 0;
}

export function inRegion(region: RegionTotal, lon: number, lat: number): boolean {
  return region.boxes.some(([west, south, east, north]) => lon >= west && lon < east && lat >= south && lat < north);
}

/** The region's target total at `year`, given HYDE's total there: HYDE's moved toward `targetPeople` by the year's weight. */
export function regionTotalAt(region: RegionTotal, year: number, hydeTotal: number): number {
  return hydeTotal + regionWeightAt(region, year) * (region.targetPeople - hydeTotal);
}

/** A region's multiplier for one image and the populated cells it covers (ascending). */
export type RegionScale = { region: RegionTotal; factor: number; cells: Uint32Array };

/**
 * The multipliers for a whole-world `width` × `height` image of `year` (row 0 = north, column 0 = 180° W). `peopleAt(cell)` is
 * the image's people in a cell. Empty when no region has a weight this year, or when a region holds nobody in the image.
 */
export function regionScales(year: number, width: number, height: number, peopleAt: (cell: number) => number): RegionScale[] {
  const out: RegionScale[] = [];
  const deg = 360 / width;
  for (const region of REGION_TOTALS) {
    if (regionWeightAt(region, year) === 0) continue;
    const cells: number[] = [];
    let total = 0;
    for (const [west, south, east, north] of region.boxes) {
      const rowStart = Math.max(0, Math.floor((90 - north) / deg));
      const rowEnd = Math.min(height, Math.ceil((90 - south) / deg));
      const colStart = Math.max(0, Math.floor((west + 180) / deg));
      const colEnd = Math.min(width, Math.ceil((east + 180) / deg));
      for (let row = rowStart; row < rowEnd; row++) {
        const lat = 90 - (row + 0.5) * deg;
        for (let col = colStart; col < colEnd; col++) {
          const lon = -180 + (col + 0.5) * deg;
          if (lon < west || lon >= east || lat < south || lat >= north) continue; // the edge cells of the range
          const cell = row * width + col;
          const people = peopleAt(cell);
          if (people <= 0) continue;
          cells.push(cell);
          total += people;
        }
      }
    }
    if (total > 0) out.push({ region, factor: regionTotalAt(region, year, total) / total, cells: Uint32Array.from(cells).sort() });
  }
  return out;
}

/** One multiplier per cell index, for walking an image's cells in ascending order (`gridDataFrom`): `cells` ascending, `factors` beside it. */
export function mergedScales(scales: readonly RegionScale[]): { cells: Uint32Array; factors: Float32Array } {
  const pairs = scales.flatMap(({ factor, cells }) => Array.from(cells, (cell) => [cell, factor] as const));
  pairs.sort((a, b) => a[0] - b[0]);
  return { cells: Uint32Array.from(pairs, ([cell]) => cell), factors: Float32Array.from(pairs, ([, factor]) => factor) };
}
