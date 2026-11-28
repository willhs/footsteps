// Shelters (`?shelters=1`): what a group's dwellings looked like, and the words that say how we know.
//
// Three layers of honesty, kept apart on purpose (docs/ops/close-up-scene.md):
//   - the TYPE is MODELLED. It is read from the house codes of the analog society the settlement model drew the group from
//     (D-PLACE Ethnographic Atlas: EA079 plan, EA081 walls, EA083 roof; `public/dwellings.json`), or, for two prehistoric
//     types known from digs, from a cited archaeology table. "The ethnographic present is not the past."
//   - the PLACE is IMAGINED: one dwelling per household, standing where `layers/households.ts` puts the household.
//   - the numbers, sizes and colours are drawing choices.
//
// Pure helpers only; the instanced meshes are in layers/shelters.ts and the drawing in layers/Close3DLayer.ts.
import { UnitKind } from '@/components/footsteps/layers/units';

/** Off by default until reviewed on prod: `?shelters=1` draws dwellings in the close-up. */
export function sheltersParam(search: string): boolean {
  return new URLSearchParams(search).get('shelters') === '1';
}

export type DwellingCodes = { plan: number | null; walls: number | null; roof: number | null };
export type DwellingSociety = DwellingCodes & { id: string; name: string; year: number | null };
export type DwellingFile = {
  version: 1;
  caveat: string;
  codes: Record<'plan' | 'walls' | 'roof', Record<string, string>>;
  columns: ['id', 'name', 'year', 'plan', 'walls', 'roof'];
  societies: [string, string, number | null, number | null, number | null, number | null][];
};
/** The societies the settlement catalog names, in `dwellings.json` order: `Units.society` indexes `societies`. */
export type DwellingTable = {
  caveat: string;
  codes: DwellingFile['codes'];
  societies: DwellingSociety[];
  index: Map<string, number>;
};
/** `Units.society` for a group with no analog (the old even-groups model, or a missing society). */
export const NO_SOCIETY = 0xffff;

export function parseDwellings(file: DwellingFile): DwellingTable {
  const societies = file.societies.map(([id, name, year, plan, walls, roof]) => ({ id, name, year, plan, walls, roof }));
  return { caveat: file.caveat, codes: file.codes, societies, index: new Map(societies.map((s, i) => [s.id, i])) };
}

let request: Promise<DwellingTable> | undefined;
/** `/dwellings.json` (about 15 KB), fetched once per page and thread. A failed fetch is retried by the next caller. */
export function loadDwellings(): Promise<DwellingTable> {
  if (!request)
    request = fetch('/dwellings.json')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Dwellings: HTTP ${response.status}`);
        const file: DwellingFile = await response.json();
        if (file.version !== 1) throw new Error('Unsupported dwellings table');
        return parseDwellings(file);
      })
      .catch((error) => {
        request = undefined;
        throw error;
      });
  return request;
}

// --- What is drawn -------------------------------------------------------------------------------------------------

/** The handful of low-poly shapes (layers/shelters.ts builds them): a windbreak or lean-to, a low dome (brush or
 * grass hut, igloo), a tall cone (hide or mat tent, tipi), a drum with a shallow conical roof (round house, yurt),
 * a gabled box (rectangular house, ridge tent) and a flat-roofed block (mud-brick or stone house). */
export const SHAPES = ['lean', 'dome', 'cone', 'drum', 'gable', 'block'] as const;
export type ShapeId = (typeof SHAPES)[number];
export const SHAPE_NAME: Record<ShapeId, string> = {
  lean: 'windbreak or lean-to',
  dome: 'low dome hut',
  cone: 'conical tent or hut',
  drum: 'round house or yurt',
  gable: 'gabled house',
  block: 'flat-roofed house',
};

/** What it is covered with, seen from above (the roof's material, else the walls'). Colours are a drawing table. */
export const MATERIALS = {
  thatch: { name: 'grass or thatch', rgb: [186, 156, 88] },
  wood: { name: 'wood or bamboo', rgb: [138, 100, 62] },
  bark: { name: 'bark', rgb: [118, 84, 56] },
  hides: { name: 'hides or skins', rgb: [152, 108, 74] },
  felt: { name: 'felt or cloth', rgb: [226, 218, 198] },
  mats: { name: 'mats', rgb: [168, 142, 96] },
  mud: { name: 'mud or clay', rgb: [188, 150, 112] },
  stone: { name: 'stone', rgb: [150, 146, 138] },
  slate: { name: 'slate', rgb: [112, 114, 122] },
  turf: { name: 'turf or earth', rgb: [112, 102, 66] },
  snow: { name: 'snow or ice', rgb: [236, 241, 246] },
  tile: { name: 'tile', rgb: [176, 98, 72] },
  greytile: { name: 'grey tile', rgb: [104, 108, 114] },
  bone: { name: 'mammoth bone and hide', rgb: [224, 215, 192] },
  hair: { name: 'black goat- or yak-hair cloth', rgb: [58, 50, 44] },
} as const satisfies Record<string, { name: string; rgb: readonly [number, number, number] }>;
export type MaterialId = keyof typeof MATERIALS;

/** How a dwelling's type was settled, for the label. `kind` is the fallback when an analog recorded no house at all. */
export type ShelterSpec =
  | { how: 'analog'; shape: ShapeId; material: MaterialId }
  | { how: 'archaeology'; shape: ShapeId; material: MaterialId; type: ArchaeologicalType }
  | { how: 'kind'; shape: ShapeId; material: MaterialId }
  | { how: 'town'; shape: ShapeId; material: MaterialId };

/** Dwelling types known from digs, used where they cover the place, era and kind of group (otherwise the analogs rule).
 * Each is a rule over a box and a date range: modelled from the archaeology, never from an analog. */
export type ArchaeologicalType = {
  id: string;
  /** What it was, and the best-known dug example. */
  text: string;
  source: string;
  box: { west: number; east: number; south: number; north: number };
  /** Calendar years, inclusive. */
  years: [number, number];
  kinds: number[];
  shape: ShapeId;
  material: MaterialId;
};
export const ARCHAEOLOGICAL_TYPES: readonly ArchaeologicalType[] = [
  {
    id: 'mammoth-bone',
    text: 'a hut of mammoth bones and hide, as dug at Mezhyrich (Ukraine), Mezin and Kostenki on the Russian Plain',
    source: 'Pidoplichko 1998; Soffer 1985',
    // The mammoth steppe of the Russian Plain and southern Siberia, Last Glacial.
    box: { west: 15, east: 140, south: 44, north: 62 },
    years: [-45000, -10000],
    kinds: [UnitKind.Band],
    shape: 'dome',
    material: 'bone',
  },
  {
    id: 'natufian',
    text: 'round, half-sunken houses with stone footings and brush roofs, as dug at Ain Mallaha (Eynan, Israel) and other Natufian hamlets',
    source: 'Bar-Yosef 1998, Evol Anthropol 6:159; Valla 1995',
    // The Natufian of the southern and northern Levant, about 12,500-9,500 BCE; foragers who began to stay put.
    box: { west: 33.5, east: 40, south: 29, north: 37.5 },
    years: [-12500, -9600],
    kinds: [UnitKind.Band, UnitKind.Village],
    shape: 'drum',
    material: 'thatch',
  },
  {
    id: 'ppna-round',
    text: 'round houses of mud brick and stone, as dug at Jericho and other Pre-Pottery Neolithic A villages',
    source: 'Kuijt & Goring-Morris 2002, J World Prehist 16:361',
    box: { west: 33.5, east: 45, south: 29, north: 38.5 },
    years: [-9600, -8600],
    kinds: [UnitKind.Band, UnitKind.Village],
    shape: 'drum',
    material: 'mud',
  },
  {
    id: 'jomon-pit',
    text: 'pit houses with thatched roofs down to the ground, as dug at Sannai-Maruyama (Aomori) and many Jōmon sites',
    source: 'Habu 2004, Ancient Jomon of Japan',
    // Japan from the Ryukyus' north to Hokkaido, until rice farming spread (Yayoi, from about 900 BCE in Kyushu).
    box: { west: 129.5, east: 146, south: 30, north: 46 },
    years: [-14000, -400],
    kinds: [UnitKind.Band, UnitKind.Village],
    shape: 'cone',
    material: 'thatch',
  },
  {
    id: 'mesolithic-hut',
    text: 'small round huts of poles covered with reeds, bark or hides, as dug at Mount Sandel (Ireland), Howick (England) and Star Carr',
    source: 'Woodman 1985; Waddington 2007; Conneller et al. 2012, Antiquity 86:1004',
    // Mesolithic Europe west of the Russian Plain, after the ice age and before (or beside) the first farmers.
    box: { west: -11, east: 30, south: 36, north: 71 },
    years: [-9600, -3500],
    kinds: [UnitKind.Band],
    shape: 'dome',
    material: 'thatch',
  },
  {
    id: 'lbk-longhouse',
    text: 'timber longhouses with thatched gable roofs, 20-40 m long, as dug at Bylany (Czechia), Elsloo (Netherlands) and across the Linear Pottery world',
    source: 'Bickle & Whittle 2013, The First Farmers of Central Europe',
    box: { west: 3, east: 26, south: 46, north: 54 },
    years: [-5500, -4800],
    kinds: [UnitKind.Village],
    shape: 'gable',
    material: 'thatch',
  },
  {
    id: 'yangshao',
    text: 'round and square half-sunken houses with thatched conical roofs, as dug at Banpo (Xi\'an) and other Yangshao villages',
    source: 'Liu 2004, The Chinese Neolithic',
    box: { west: 104, east: 116, south: 32, north: 38 },
    years: [-5000, -3000],
    kinds: [UnitKind.Village],
    shape: 'cone',
    material: 'thatch',
  },
  {
    id: 'puna-herders',
    text: 'small stone-walled houses with grass (ichu) roofs at the herding stations of the high puna, as recorded among llama and alpaca herders of Ayacucho (Peru)',
    source: 'Flannery, Marcus & Reynolds 1989, The Flocks of the Wamani',
    // The central Andes above the valleys, from when llamas and alpacas were herded (Wheeler 1995, J Biogeogr 22:111).
    box: { west: -80, east: -63, south: -28, north: -5 },
    years: [-3500, 1900],
    kinds: [UnitKind.Camp],
    shape: 'drum',
    material: 'thatch',
  },
  {
    id: 'shielings',
    text: 'small stone-and-turf summer huts on the hill pastures (shielings), as recorded across upland Scotland, Ireland, Wales and Norway',
    source: 'Bil 1990, The Shieling 1600-1840',
    // Western and central Europe below Sámi country, once flocks were driven to summer pastures.
    box: { west: -11, east: 30, south: 36, north: 64 },
    years: [-4000, 1900],
    kinds: [UnitKind.Camp],
    shape: 'drum',
    material: 'turf',
  },
  {
    id: 'mudbrick-neolithic',
    text: 'rectangular mud-brick houses packed together with flat roofs, as dug at Çatalhöyük (Turkey, 7100–5950 BCE)',
    source: 'Hodder 2006',
    box: { west: 25, east: 50, south: 30, north: 42 },
    years: [-8500, -5000],
    kinds: [UnitKind.Village],
    shape: 'block',
    material: 'mud',
  },
];

export type Place = { lon: number; lat: number; year: number; kind: number };

export function archaeologyAt(place: Place): ArchaeologicalType | null {
  return (
    ARCHAEOLOGICAL_TYPES.find(
      (t) =>
        t.kinds.includes(place.kind) &&
        place.year >= t.years[0] &&
        place.year <= t.years[1] &&
        place.lon >= t.box.west &&
        place.lon <= t.box.east &&
        place.lat >= t.box.south &&
        place.lat <= t.box.north,
    ) ?? null
  );
}

/** Where and when a snow house can stand. Living in snow houses through the winter was an Inuit way, in Arctic Canada and
 * Greenland; snow knives suggest the Dorset built them from about 500 BCE (Maxwell 1985, Prehistory of the Eastern Arctic).
 * Climate-matched analogs give Inuit to any cold place, so elsewhere (Ice Age Europe, Siberia, Alaska) the analog's snow
 * house is drawn as a hide tent, the commonest cold-country dwelling of the analogs. */
export const SNOW_HOUSES = { box: { west: -141, east: -10, south: 55, north: 84 }, from: -500 } as const;
export function snowHousesAt(place: Place): boolean {
  const { box, from } = SNOW_HOUSES;
  return place.year >= from && place.lon >= box.west && place.lon <= box.east && place.lat >= box.south && place.lat <= box.north;
}

/** Which cloth tent a herding analog's fabric tent becomes where the group stands (Faegre 1979, Tents: Architecture of the Nomads):
 * the round felt yurt of Inner Asia (Kazakh, Kyrgyz, Mongol country), the conical cloth lavvu of the Sámi, and from the Sahara to
 * Tibet the low black tent of woven goat or yak hair. Climate- and distance-matched analogs mix these up (Bedouin-country camps drew
 * white yurts, Tibetan camps Mongol yurts). */
export const YURT_BOX = { west: 46, east: 125, south: 38, north: 56 } as const;
export const LAVVU_BOX = { west: 5, east: 45, south: 62, north: 72 } as const;
/** The black-tent belt, Morocco and the Sahara to Arabia, Iran and Tibet. */
/** A herding camp with no house record outside the cloth-tent belts: a low hut of mats or grass, as the Nama, Maasai and other
 * herders of Africa built. */
const CAMP_HUT = { shape: 'dome', material: 'mats' } as const;
export const BLACK_TENT_BOX = { west: -18, east: 105, south: 12, north: 42 } as const;
const inBox = (b: { west: number; east: number; south: number; north: number }, p: Place) =>
  p.lon >= b.west && p.lon <= b.east && p.lat >= b.south && p.lat <= b.north;
export function clothTent(place: Place): { shape: ShapeId; material: MaterialId } | null {
  if (inBox(YURT_BOX, place)) return { shape: 'drum', material: 'felt' };
  if (inBox(LAVVU_BOX, place)) return { shape: 'cone', material: 'felt' };
  if (inBox(BLACK_TENT_BOX, place)) return { shape: 'gable', material: 'hair' };
  return null;
}

/** EA081 wall and EA083 roof codes to what covers the dwelling seen from above. */
const ROOF_MATERIAL: Record<number, MaterialId> = {
  1: 'slate', 2: 'mud', 3: 'wood', 4: 'bark', 5: 'hides', 6: 'felt', 7: 'mats', 8: 'thatch', 9: 'turf', 10: 'snow', 11: 'tile',
};
const WALL_MATERIAL: Record<number, MaterialId> = {
  1: 'stone', 2: 'mud', 3: 'wood', 4: 'bark', 5: 'hides', 6: 'felt', 7: 'mats', 8: 'thatch', 9: 'mud',
};
/** Walls that stand up by themselves: stone, plaster or clay, timber, adobe. The others are coverings or no walls. */
const SOLID_WALLS = new Set([1, 2, 3, 9]);
/** Roofs that are flat or nearly: clay or plaster, turf or earth. */
const FLAT_ROOFS = new Set([2, 9]);

const FALLBACK: Record<number, { shape: ShapeId; material: MaterialId }> = {
  [UnitKind.Band]: { shape: 'dome', material: 'thatch' },
  [UnitKind.Camp]: { shape: 'drum', material: 'felt' },
  [UnitKind.Village]: { shape: 'gable', material: 'thatch' },
  [UnitKind.Glow]: { shape: 'block', material: 'mud' },
};

/** The dwelling a group most plausibly lived in: where an archaeological type covers the place, era and kind of group,
 * that; else the house codes of the analog society the settlement model drew it from; else a plain default for the
 * kind of group (band: brush hut, camp: felt tent, village: thatched house). Pure and deterministic. */
export function shelterSpec(codes: DwellingCodes | null, place: Place): ShelterSpec {
  const type = archaeologyAt(place);
  if (type) return { how: 'archaeology', shape: type.shape, material: type.material, type };
  const fallback = place.kind === UnitKind.Camp ? clothTent(place) ?? CAMP_HUT : FALLBACK[place.kind] ?? FALLBACK[UnitKind.Village];
  if (!codes || (codes.plan === null && codes.walls === null && codes.roof === null)) return { how: 'kind', ...fallback };
  const { plan, walls, roof } = codes;
  const material: MaterialId =
    (roof !== null && ROOF_MATERIAL[roof]) || (walls !== null && WALL_MATERIAL[walls]) || fallback.material;
  const tent = walls === 5 || walls === 6 || roof === 5 || roof === 6;
  const cloth = tent && (walls === 6 || roof === 6) && walls !== 5 && roof !== 5 ? clothTent(place) : null;
  if (cloth) return { how: 'analog', ...cloth };
  const roundPlan = plan === 2 || plan === 3 || plan === 4;
  const boxPlan = plan === 5 || plan === 6;
  const solid = walls !== null && SOLID_WALLS.has(walls);
  if (roof === 10 && !snowHousesAt(place)) return { how: 'analog', shape: 'cone', material: 'hides' };
  let shape: ShapeId;
  if (roof === 10) shape = 'dome'; // snow or ice: an igloo
  else if (plan === 1) shape = 'lean'; // semicircular: a windbreak
  else if (tent) shape = boxPlan ? 'gable' : place.kind === UnitKind.Camp || material === 'felt' ? 'drum' : 'cone';
  else if (roundPlan) {
    if (solid) shape = roof !== null && FLAT_ROOFS.has(roof) ? 'dome' : 'drum';
    else shape = roof === 5 || roof === 7 ? 'cone' : 'dome';
  } else if (boxPlan) {
    const flat = (roof !== null && FLAT_ROOFS.has(roof)) || (roof === null && (walls === 1 || walls === 2 || walls === 9));
    shape = flat ? 'block' : 'gable';
  } else if (walls !== null && solid && (roof === null || FLAT_ROOFS.has(roof))) shape = 'block';
  else shape = fallback.shape;
  return { how: 'analog', shape, material };
}

/** A town's roofs, guessed from where and when it stood rather than from an analog: no society was recorded for a
 * named historical city. A table over rough regions, each a mix of [shape, material, share]. */
type TownRow = {
  box: { west: number; east: number; south: number; north: number };
  years?: [number, number];
  mix: readonly (readonly [ShapeId, MaterialId, number])[];
};
const TOWN_ROWS: readonly TownRow[] = [
  // The Roman world: tiled gabled houses among stone and plaster blocks.
  { box: { west: -10, east: 40, south: 30, north: 47 }, years: [-600, 700], mix: [['gable', 'tile', 0.65], ['block', 'stone', 0.35]] },
  // Mesopotamia, the Levant, Egypt, Iran, the Indus: flat-roofed mud-brick.
  { box: { west: -20, east: 80, south: 10, north: 42 }, mix: [['block', 'mud', 0.7], ['block', 'stone', 0.15], ['gable', 'tile', 0.15]] },
  // China, Korea, Japan: grey-tiled gables.
  { box: { west: 100, east: 146, south: 20, north: 46 }, mix: [['gable', 'greytile', 1]] },
  // Mesoamerica and the Andes.
  { box: { west: -110, east: -65, south: -22, north: 25 }, mix: [['block', 'stone', 0.5], ['block', 'mud', 0.3], ['gable', 'thatch', 0.2]] },
];
const TOWN_DEFAULT: TownRow['mix'] = [['gable', 'thatch', 0.6], ['gable', 'wood', 0.4]];

/** The mix of roof types for a named city at a place and year. */
export function townMix(lon: number, lat: number, year: number): TownRow['mix'] {
  const row = TOWN_ROWS.find(
    (r) =>
      lon >= r.box.west && lon <= r.box.east && lat >= r.box.south && lat <= r.box.north &&
      (!r.years || (year >= r.years[0] && year <= r.years[1])),
  );
  return row ? row.mix : TOWN_DEFAULT;
}

// --- Words ---------------------------------------------------------------------------------------------------------

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "circular house, walls and roof of grass, leaves or thatch": what the analog recorded, in the Atlas's words. */
export function recordedHouse(codes: DwellingCodes, table: DwellingTable): string | null {
  const plan = codes.plan !== null ? lower(table.codes.plan[codes.plan] ?? '') : '';
  const roof = codes.roof !== null ? lower(table.codes.roof[codes.roof] ?? '') : '';
  const walls = codes.walls !== null ? lower(table.codes.walls[codes.walls] ?? '') : '';
  const parts: string[] = [];
  if (codes.walls === 11 && roof) parts.push(`walls and roof one, of ${roof}`);
  else {
    if (walls) parts.push(`walls: ${walls}`);
    if (roof) parts.push(`roof: ${roof}`);
  }
  const noun = plan ? `${plan} plan` : 'plan not recorded';
  return parts.length || plan ? [noun, ...parts].join('; ') : null;
}

export type ShelterWords = {
  /** The one-line answer: what is drawn. */
  title: string;
  /** How the type is known (modelled), with the analog or the dig. */
  evidence: string;
  /** What is invented. */
  placement: string;
  caveat: string;
};

/** The hover line for a dwelling: type modelled (analog or dig), placement imagined. `homes` is how many households one
 * drawn roof stands for (1 for a camp or village, more in a town). */
export function describeShelter(spec: ShelterSpec, society: DwellingSociety | null, table: DwellingTable | null, homes = 1): ShelterWords {
  const what = `${MATERIALS[spec.material].name} ${SHAPE_NAME[spec.shape]}`;
  const caveat = 'The ethnographic present is not the past.';
  const placement =
    homes > 1
      ? `Imagined: each roof stands for about ${Math.round(homes)} households, and where they stand is a guess.`
      : 'Imagined: one dwelling per household of about 4–5 people, where the household stands is a guess.';
  if (spec.how === 'archaeology')
    return {
      title: `Modelled: ${what}`,
      evidence: `A type known from digs, used for this place and time: ${spec.type.text} (${spec.type.source}).`,
      placement,
      caveat: 'One dug site stands for a whole region and era.',
    };
  if (spec.how === 'town')
    return {
      title: `Modelled: ${what}`,
      evidence: 'Guessed from the region and era; no analog society was recorded for this city.',
      placement,
      caveat: 'Rough regional types, not a known street plan.',
    };
  if (spec.how === 'analog' && society) {
    const recorded = table ? recordedHouse(society, table) : null;
    return {
      title: `Modelled: ${what}`,
      evidence: `Like the ${society.name}${society.year ? `, recorded ${society.year}` : ''}${recorded ? `: ${recorded}` : ''}.`,
      placement,
      caveat,
    };
  }
  return {
    title: `Modelled: ${what}`,
    evidence: society
      ? `The ${society.name} (an analog, recorded ${society.year ?? 'unknown'}) kept no house record, so this is a plain default for the kind of group.`
      : 'No analog society here: a plain default for the kind of group.',
    placement,
    caveat,
  };
}
