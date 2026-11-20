// Who is how old: the age structure a group's people are drawn from (research 0006).
//
// A MODELLED prior, not a measurement: five living-age shares per profile, editorial scenarios compiled from
// footstep-generator/anthropology/demography.yaml into demography.json (demography_asset.py). The profile is
// chosen from the group's way of life and, for farming villages, from regional transition evidence
// (farmingOnset.json): early farmers until a window after crops first reach the region, agrarian after. There
// is no single calendar cut-off. Herding camps have no researched profile and keep the old rough structure,
// labelled as such. An individual's age stays speculative.
import demography from './demography.json';
import farmingOnset from './farmingOnset.json';
import { UnitKind } from '@/components/footsteps/layers/units';

export type ProfileId = 'forager' | 'early_farmer' | 'agrarian' | 'urban';
/** `generic`: no researched profile for this kind of group (herding camps), so the old rough pre-modern structure. */
export type AgeStructureId = ProfileId | 'generic';

type Profile = { shares: number[]; era: string };
const PROFILES = demography.profiles as Record<ProfileId, Profile>;
const ONSET = farmingOnset.cells as Record<string, number>;
const { bins, tail } = demography;
const LIVING_BINS = bins.length; // the open 50+ band follows these

/** The card's words, and what each structure is called in them. */
export const AGE_LABEL = demography.label;
export const AGE_STRUCTURE_NAME: Record<AgeStructureId, string> = {
  forager: 'forager scenario',
  early_farmer: 'early-farmer scenario',
  agrarian: 'agrarian scenario',
  urban: 'urban scenario',
  generic: 'generic pre-modern guess; herders have no profile yet',
};

/** Year crops first reach the 5-degree cell holding this point in the food model; undefined if they never do by 1900. */
export function farmingOnsetYear(lon: number, lat: number): number | undefined {
  const west = Math.floor(((((lon + 180) % 360) + 360) % 360 - 180) / 5) * 5;
  const south = Math.min(85, Math.floor(lat / 5) * 5);
  return ONSET[`${south},${west}`];
}

/** Which age structure a group's people are drawn from. Foragers use the forager profile; farming villages use
 * early farmer within the window after local crop onset and agrarian after it, or where there is no onset evidence
 * (HYDE shows farming but the food model has no crop there, so the established profile is the cautious default). */
export function ageStructureFor(kind: number, lon: number, lat: number, year: number): AgeStructureId {
  if (kind === UnitKind.Band) return 'forager';
  if (kind === UnitKind.Village) {
    const onset = farmingOnsetYear(lon, lat);
    return onset !== undefined && year < onset + demography.early_farmer_window_years ? 'early_farmer' : 'agrarian';
  }
  return 'generic';
}

// The old structure, kept only for herding camps: [lo, hi, share].
const GENERIC: [number, number, number][] = [
  [0, 5, 0.15],
  [5, 15, 0.25],
  [15, 30, 0.27],
  [30, 45, 0.18],
  [45, 60, 0.1],
  [60, 80, 0.05],
];

/** A living age for one person from two uniform draws in [0, 1): `u` picks the age band by the profile's share CDF,
 * `v` places the age within it (an integer, uniform in the band; the 50+ band is the editorial declining tail
 * 50 + floor(-scale * ln(1 - v)), truncated to max_age by scaling v, which is rejection sampling without the loop). */
export function sampleLivingAge(id: AgeStructureId, u: number, v: number): number {
  if (id === 'generic') {
    for (const [lo, hi, p] of GENERIC) {
      if (u < p) return Math.floor(lo + v * (hi - lo));
      u -= p;
    }
    return 30;
  }
  const shares = PROFILES[id].shares;
  for (let b = 0; b < LIVING_BINS; b++) {
    if (u < shares[b]) return Math.floor(bins[b][0] + v * (bins[b][1] - bins[b][0]));
    u -= shares[b];
  }
  const span = tail.max_age + 1 - tail.anchor; // ages anchor..max_age inclusive
  const reach = 1 - Math.exp(-span / tail.scale); // probability mass of the exponential below the cap
  return tail.anchor + Math.floor(-tail.scale * Math.log(1 - v * reach));
}

/** Each person's own random stream for age: a mix of the group's seed, their index and a salt, so the number of
 * draws made for ages (or any other part of the person) can never move anyone, and a person's quantiles persist
 * when the profile or the year changes. Returns the three draws: band, place in band, and the adult anchor's age. */
export function ageDraws(groupSeed: number, index: number): [number, number, number] {
  let h = (groupSeed ^ Math.imul(index + 1, 0x9e3779b1) ^ 0x51ed270b) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    h = (h + 0x9e3779b9) >>> 0;
    return h / 4294967296;
  };
  return [next(), next(), next()];
}
