// Households: the level below a camp or village (`?settlements=1` only). Research 0012 "2. Nested levels":
// Hamilton et al. 2007 (Proc R Soc B 274:2195, Table 1) read Binford's 339 hunter-gatherer societies and
// find a family of 4.48 people (95% CI 4.31-4.67). The sizes below are drawn around that mean. How many
// households a camp has is NOT in the data (research 0012: "would be invented"), so the number is just
// "the group's people, packed into households in order"; the layout is imagined.
//
// Everything here is a pure function of the group's seed, and the household sequence never looks at the
// group's size, so person i of a group keeps their household and place when the group grows or shrinks
// (people.ts relies on this for the year morph's steady/leaving/entering split).

/** Household size and the share of households of that size. Mean 4.51, inside Hamilton's CI. */
export const HOUSEHOLD_SIZES: readonly (readonly [number, number])[] = [
  [2, 0.04],
  [3, 0.18],
  [4, 0.3],
  [5, 0.26],
  [6, 0.15],
  [7, 0.07],
];

/** Where a household stands, in metres east and north of the group's spot. */
export type Household = { index: number; size: number; x: number; y: number };

/** Metres between neighbouring households (imagined): shelters of a camp are close, a village's houses a little apart. */
export const HOUSEHOLD_SPACING_M = { camp: 40, village: 60 } as const;
/** How far from its household centre a member stands, metres. */
export const HOUSEHOLD_RADIUS_M = 4;

const GOLDEN_ANGLE = 2.399963229728653;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function householdSizeFor(u: number): number {
  let rest = u;
  for (const [size, p] of HOUSEHOLD_SIZES) {
    if (rest < p) return size;
    rest -= p;
  }
  return HOUSEHOLD_SIZES[HOUSEHOLD_SIZES.length - 1][0];
}

/** The group's households in order: household 0 at the spot, the rest on a sunflower spiral (equal
 * spacing, no overlap, any number of them) with a small jitter. Sizes and places depend on the
 * group's seed and the household's index only. */
export function* householdsOf(seed: number, spacing: number): Generator<Household> {
  const sizes = rng(seed ^ 0x5bd1e995);
  const phase = rng(seed ^ 0x27d4eb2f)() * Math.PI * 2;
  for (let index = 0; ; index++) {
    const jitter = rng(seed + index * 7919 + 13);
    // A sunflower spiral r = c * sqrt(n) packs neighbours about 1.9 c apart.
    const radius = (spacing / 1.9) * Math.sqrt(index);
    const angle = phase + index * GOLDEN_ANGLE;
    yield {
      index,
      size: householdSizeFor(sizes()),
      x: Math.cos(angle) * radius + (jitter() - 0.5) * spacing * 0.3,
      y: Math.sin(angle) * radius + (jitter() - 0.5) * spacing * 0.3,
    };
  }
}
