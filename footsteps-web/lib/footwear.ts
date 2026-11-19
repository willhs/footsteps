// What a person's footprints look like: IMAGINED from era, climate (latitude as a stand-in) and
// way of life, with a per-person roll so a place has a mix. The rules are a rough reading of the
// sources below, not a measured map of footwear.
//
// Sources checked 2026-11-19 against the papers' abstracts/full text (DOIs below); what is and is
// not confirmed is said on each line.
//
// - Habitual footwear by ~40,000 years ago (FOOTWEAR_FROM), from weaker small toe bones:
//   Trinkaus & Shang 2008, J. Archaeol. Sci. 35:1928-1933, doi:10.1016/j.jas.2007.12.002 (Tianyuan 1,
//   China, ~40 ka cal BP; Sunghir 1, Russia, ~27.5 ka). Tianyuan 1 is directly dated 42,000-39,000 cal BP
//   (Shang et al. 2007 PNAS 104:6573, doi:10.1073/pnas.0702169104) and ~40,000 y old by DNA
//   (Fu et al. 2013 PNAS 110:2223, doi:10.1073/pnas.1221359110). One individual, so ~40 ka is the
//   earliest anatomical hint, not a survey. Trinkaus 2005, J. Archaeol. Sci. 32:1515-1526,
//   doi:10.1016/j.jas.2005.04.006 found supportive footwear RARE in the Middle Paleolithic and
//   FREQUENT by the middle Upper Paleolithic (~30-26 ka) in western Eurasia; the 40 ka figure is NOT
//   from that paper. Before FOOTWEAR_FROM we draw everyone barefoot (shoes may be older; nothing survives).
// - Oldest surviving footwear (SANDALS_FROM): twined sagebrush-bark sandals of Fort Rock style,
//   Oregon, directly dated about 10,500-9,300 cal BP at Fort Rock, Catlow and Cougar Mountain caves
//   (Connolly & Cannon 1999, Radiocarbon 41:309-313, doi:10.1017/s0033822200057167; table at
//   https://pages.uoregon.edu/connolly/FRsandals.htm). The commonly quoted 9,053 +/- 350 BP is an
//   average of two 1951 dates; the single oldest 1-sigma ranges reach ~10,900 cal BP.
// - Areni-1 cave, Armenia: a one-piece cowhide shoe wrapped round the foot and laced, grass-stuffed,
//   dated 3627-3377 cal BC (95.4%; ~5,600-5,300 cal BP), "the oldest shoe from Eurasia"
//   (Pinhasi et al. 2010, PLoS ONE 5:e10984, doi:10.1371/journal.pone.0010984). Wraps like these
//   (and later moccasins) are the cold-country default.
// - Otzi (died ~3300 BC, ~5,300 years ago; Rom et al. 1999 Radiocarbon 41:183,
//   doi:10.1017/s0033822200019536) wore shoes of a linden-bast net holding grass padding, a deerskin
//   upper sewn to a leather sole (South Tyrol Museum of Archaeology, https://www.iceman.it/en/oetzi/clothing).
// - Stitched shoes with a separate sole (SHOES_FROM = 1 CE, a rounded modelling choice, not a first
//   date): Roman leather shoes are abundant from the conquest of north-west Europe (van Driel-Murray
//   2001, Britannia 32:185, doi:10.2307/526955; Vindolanda holds thousands). COULD NOT VERIFY from a
//   primary source: Han-era stitched shoes (silk shoes with stitched soles at Mawangdui, ~168 BCE, appear
//   only in secondary web summaries) and a separate heel, so neither is claimed here.
// - Many people in warm places, and most small children, went barefoot well into the 20th century
//   (a general ethnographic reading; not tied to one source).
import { UnitKind } from '@/components/footsteps/layers/units';

export const FOOTWEAR = ['barefoot', 'hide wraps', 'sandals', 'stitched shoes'] as const;
export type Footwear = (typeof FOOTWEAR)[number];

/** Index into FOOTWEAR (what the footprint shader draws). */
export const FOOT = { barefoot: 0, wraps: 1, sandals: 2, shoes: 3 } as const;

export const FOOTWEAR_FROM = 1950 - 40_000; // Tianyuan 1, ~40 ka cal BP (Trinkaus & Shang 2008)
export const SANDALS_FROM = 1950 - 10_500; // oldest Fort Rock sandals, ~10.5 ka cal BP
export const SHOES_FROM = 1; // Roman-era stitched leather shoes; rounded, a modelling choice

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
