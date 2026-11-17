// What a person's footprints look like: IMAGINED from era, climate (latitude as a stand-in) and
// way of life, with a per-person roll so a place has a mix. The rules are a rough reading of the
// sources below, not a measured map of footwear. Dates and sites are recalled, not yet checked.
//
// - Habitual footwear by ~40,000 years ago in western Eurasia and China: weaker small toe bones in
//   early modern humans (Trinkaus 2005, J. Archaeol. Sci. 32:1515; Trinkaus & Shang 2008, Tianyuan).
//   Before that we draw everyone barefoot (shoes may be older; nothing survives to show it).
// - Oldest surviving footwear: plant-fibre sandals at Fort Rock Cave, Oregon, ~10,500-9,300 years ago.
// - Oldest leather shoe: Areni-1 cave, Armenia, ~5,500 years ago (Pinhasi et al. 2010, PLoS ONE
//   5:e10984), a one-piece hide wrap laced over the foot; Otzi (~5,300 years ago) wore hide and grass
//   shoes. Wraps like these (and later moccasins) are the cold-country default.
// - Stitched shoes with a separate sole and heel: Roman and Han-era shoes; common for village and
//   town people in Eurasia's temperate belt from about 1 CE.
// - Many people in warm places, and most small children, went barefoot well into the 20th century.
import { UnitKind } from '@/components/footsteps/layers/units';

export const FOOTWEAR = ['barefoot', 'hide wraps', 'sandals', 'stitched shoes'] as const;
export type Footwear = (typeof FOOTWEAR)[number];

/** Index into FOOTWEAR (what the footprint shader draws). */
export const FOOT = { barefoot: 0, wraps: 1, sandals: 2, shoes: 3 } as const;

const FOOTWEAR_FROM = 1950 - 40_000; // ~40 ka BP
const SANDALS_FROM = 1950 - 10_500; // Fort Rock
const SHOES_FROM = 1;

/** A person's footwear. `roll` is a stable per-person number in [0, 1). */
export function footwearFor({
  year,
  lat,
  lon,
  kind,
  age,
  roll,
}: {
  year: number;
  lat: number;
  lon: number;
  kind: number;
  age: number;
  roll: number;
}): number {
  if (year < FOOTWEAR_FROM || age < 4) return FOOT.barefoot;
  const cold = Math.abs(lat) >= 40;
  const forager = kind === UnitKind.Band;
  if (cold) {
    // Cold country: feet covered nearly always; stitched shoes for settled Eurasians later on.
    const eurasia = lon > -15 && lon < 150;
    if (!forager && eurasia && year >= SHOES_FROM && roll < 0.6) return FOOT.shoes;
    return roll < 0.92 ? FOOT.wraps : FOOT.barefoot;
  }
  // Warm country: mostly barefoot, especially children and tropical foragers.
  if (age < 13) return roll < 0.85 ? FOOT.barefoot : FOOT.sandals;
  const tropics = Math.abs(lat) < 15;
  if (forager) return !tropics && year >= SANDALS_FROM && roll < 0.3 ? FOOT.sandals : FOOT.barefoot;
  if (year < SANDALS_FROM) return FOOT.barefoot;
  const shod = tropics ? 0.3 : 0.65;
  if (roll >= shod) return FOOT.barefoot;
  return year >= SHOES_FROM && !tropics && roll < shod * 0.3 ? FOOT.shoes : FOOT.sandals;
}
