// How people lived: the one place that decides a populated cell's way of life
// and what each way looks like. Units (layers/units.ts), the far-out firelight
// (layers/FireLayer.ts) and the legend all read this, so a place keeps its
// colour from the whole-world view down to a single camp.
//
// A class is a display reading of HYDE land use, not evidence of what any one
// group did. Land use is HYDE's, per 5′ cell (~10 km), encoded by
// footstep-generator/grid_image.py (docs/ops/grid-images.md): crop and grazing
// are shares of the cell, 0–1.

export const WayOfLife = { Forager: 0, Farmer: 1, Herder: 2, Urban: 3 } as const;
export type WayOfLifeValue = (typeof WayOfLife)[keyof typeof WayOfLife];

/** Cropland share of a cell at which its people count as farmers (~1.7 km² of ~85). */
export const FARMER_CROP_SHARE = 0.02;
/** Grazing share at which people on uncropped land count as herders. */
export const HERDER_GRAZING_SHARE = 0.1;
/** Above this many people in one ~10 km cell nobody lives by foraging alone
 * (~7 per km²; foragers sit well under 1): such a cell is settled, so Farmer,
 * even where HYDE records little cropland. */
export const SETTLED_MIN_CELL = 600;
/** A cell this full is a town or city: drawn as one glow, not as groups. */
export const URBAN_MIN_CELL = 40_000;

/** Above this many people in one ~10 km cell (~1.8 per km²) a herding cell is mixed farming, not pastoralists: herders live
 * at well under 2 per km² (Mongolia ~1, East African pastoralists 1-2). On the served images the steppe's grazing cells hold a
 * median of 13 (Mongolia) to 44 (Sahel) people, Germany's and France's at 1000 CE 350-400 (research 0015). */
export const PASTORAL_MAX_CELL = 150;
/** Grazing share from which a lightly used cell counts as herding rather than foraging. */
export const LIGHT_GRAZING_SHARE = 0.02;
/** Cropland share from which a lightly used cell counts as farming rather than foraging (~0.4 km² of ~85). */
export const LIGHT_CROP_SHARE = 0.005;

/** Class a populated cell. Order matters: a city is a city whatever grows round
 * it, crops outrank pasture (HYDE grazes the farmland too), and a dense cell
 * with no herding is settled rather than foraging. `crop` and `grazing` are
 * shares of the cell, 0–1.
 *
 * `canFarm` / `canHerd`: whether any crop / herd animal had reached the place by
 * then (lib/domesticatesGate.ts). HYDE allocates land use from population by
 * per-capita rules, so it puts cropland and pasture where nothing domesticated had
 * arrived (cropland in the Americas at 10,000 BCE); there its land use is not read
 * as farming or herding, and a dense cell stays foragers (the Calusa, the Northwest
 * Coast, Jōmon villages were dense foragers).
 *
 * Grazing is herding only where people are as sparse as pastoralists; a crowded
 * grazing cell where crops are known is mixed farming (medieval Germany's pastures
 * read as herder camps before). A little land use is still farming or herding:
 * foragers are drawn only where HYDE records none worth the name. */
export function classifyCell(people: number, crop: number, grazing: number, canFarm = true, canHerd = true): WayOfLifeValue {
  // A town needs farmed food: HYDE crowds 40,000 into a cell on the Levant coast at 10,000 BCE, before any crop.
  if (people >= URBAN_MIN_CELL && canFarm) return WayOfLife.Urban;
  const c = canFarm ? crop : 0;
  const g = canHerd ? grazing : 0;
  const herdOrMixed = canFarm && people >= PASTORAL_MAX_CELL ? WayOfLife.Farmer : WayOfLife.Herder;
  if (c >= FARMER_CROP_SHARE) return WayOfLife.Farmer;
  if (g >= HERDER_GRAZING_SHARE) return herdOrMixed;
  if (people >= SETTLED_MIN_CELL) return canFarm ? WayOfLife.Farmer : g > 0 ? WayOfLife.Herder : WayOfLife.Forager;
  if (g >= LIGHT_GRAZING_SHARE) return herdOrMixed;
  if (c >= LIGHT_CROP_SHARE) return WayOfLife.Farmer;
  return WayOfLife.Forager;
}

type Look = {
  /** What the legend and the details panel call these people. */
  name: string;
  /** How the group is drawn at street level. */
  mark: string;
  rgb: readonly [number, number, number];
};

/** One warm firelight family on purpose: way of life is told mostly by the kind of
 * mark (band, village, camp, city glow) and the details panel, not loud hues.
 * unitMorphVertex.ts reads a mark's kind from its colour, so the palette must
 * keep: Urban red < 0.5 (city), Forager and Herder green < 0.8 (they roam),
 * Farmer green ≥ 0.8 (settled). waysOfLife.test.ts pins this. */
export const LOOKS: Record<WayOfLifeValue, Look> = {
  [WayOfLife.Forager]: { name: 'Foragers', mark: 'band', rgb: [255, 190, 110] },
  [WayOfLife.Farmer]: { name: 'Farmers', mark: 'village', rgb: [255, 225, 160] },
  [WayOfLife.Herder]: { name: 'Herders', mark: 'camp', rgb: [255, 176, 120] },
  [WayOfLife.Urban]: { name: 'Towns and cities', mark: 'glow', rgb: [60, 230, 255] },
};

export const cssRgb = (way: WayOfLifeValue) => `rgb(${LOOKS[way].rgb.join(',')})`;
