// What the 3D person wears (`?avatar=3d`, docs/ops/avatar.md): IMAGINED from era, region, climate (latitude as a
// stand-in, as lib/footwear.ts does), way of life and sex, from the cited table below, with the anthropology atlas record
// for the place and era over it where the atlas has a real source. An illustration of the kind of clothing, not a record
// of what one person wore. Deterministic per person.
//
// An outfit is pieces by slot (top, bottom, over, head) in one material. Each piece is a mesh the build makes once
// (footstep-generator/avatar/build.mjs `PIECES`), so a dozen pieces dress every row; a new culture is a new row, not a
// new mesh.
//
// SOURCES (`SRC` below). "checked" means on 2026-11-24 the work was found on Crossref (DOI, title, year, authors as
// cited) and its title or abstract states the claim the row rests on. "unverified" means the source exists but the
// specific claim comes from a general reading not re-read for this table; the row says so.
import type { AtlasRecord } from '@/components/footsteps/hooks/useAnthropology';

export type Top = 'none' | 'vest' | 'short' | 'long';
export type Bottom = 'none' | 'loin' | 'short' | 'knee' | 'long' | 'strings' | 'trousers';
export type Over = 'none' | 'cape' | 'cloak' | 'drape';
export type Head = 'none' | 'hood' | 'cap' | 'headcloth';
export const MATERIALS = ['fur', 'hide', 'bark', 'fibre', 'linen', 'wool', 'cotton', 'silk', 'felt'] as const;
export type Material = (typeof MATERIALS)[number];
/** How the hair is worn; the viewer maps each onto a hair mesh plus, for braids and topknots, a small extra shape. */
export type HairDo = 'loose' | 'tied' | 'braids' | 'cropped' | 'topknot' | 'covered';
export type Ornament = 'shell-beads' | 'beads' | 'headband' | 'pin' | 'torc' | 'earrings';

export type Outfit = {
  top: Top;
  bottom: Bottom;
  over: Over;
  head: Head;
  material: Material;
  /** The caption: what it is, in plain words. */
  label: string;
};

type Piece = Partial<Omit<Outfit, 'label' | 'material'>> & { material: Material; label: string; sex?: 'f' | 'm' };

export type Region =
  | 'arctic'
  | 'nile'
  | 'near-east'
  | 'mediterranean'
  | 'steppe'
  | 'europe'
  | 'south-asia'
  | 'east-asia'
  | 'mesoamerica'
  | 'andes'
  | 'americas'
  | 'africa'
  | 'oceania'
  | 'other';
export type Climate = 'cold' | 'mild' | 'hot';
export type Way = 'forager' | 'farmer' | 'herder';

export type Status = 'checked' | 'unverified';
export type Source = { cite: string; doi?: string; status: Status; note?: string };

export type WardrobeRow = {
  id: string;
  /** Years (negative BCE), from inclusive to exclusive. */
  from: number;
  to: number;
  region?: Region[];
  climate?: Climate[];
  way?: Way[];
  /** Only for other kinds of human (Neanderthals and others). */
  otherHuman?: true;
  outfits: Piece[];
  hair?: { f?: HairDo[]; m?: HairDo[] };
  ornaments?: Ornament[];
  /** Chance of ochre paint on the face when the atlas says nothing. */
  paint?: number;
  /** Cloth colours for this row ([garment, garment…, trim]); otherwise the era's (lib/avatar.ts). */
  palette?: string[];
  sources: Source[];
};

// ---- sources -------------------------------------------------------------------------------------------------------
export const SRC = {
  toups: { cite: 'Toups et al. 2011, Mol. Biol. Evol. 28:29 (clothing lice split from head lice by ~83 ka, likely ~170 ka: clothing use in Africa)', doi: '10.1093/molbev/msq234', status: 'checked' },
  gilligan: { cite: 'Gilligan 2010, J. Archaeol. Method Theory 17:15 (simple draped vs complex fitted clothing; fitted, sewn clothing with the Upper Palaeolithic in cold Eurasia)', doi: '10.1007/s10816-009-9076-x', status: 'checked' },
  collard: { cite: 'Collard et al. 2016, J. Anthropol. Archaeol. 44:235 (Neanderthals likely wore capes, not close-fitting clothing; moderns used fur-bearers for tailored clothes)', doi: '10.1016/j.jaa.2016.07.010', status: 'checked' },
  wales: { cite: 'Wales 2012, J. Hum. Evol. 63:781 (Neanderthal clothing modelled from ethnographic analogues: covering up to 80% of the body in winter)', doi: '10.1016/j.jhevol.2012.08.006', status: 'checked' },
  henshilwood: { cite: 'Henshilwood et al. 2004, Science 304:404 (perforated Nassarius shell beads, Blombos Cave, ~75 ka)', doi: '10.1126/science.1095905', status: 'checked' },
  bouzouggar: { cite: 'Bouzouggar et al. 2007, PNAS 104:9964 (82,000-year-old shell beads, Morocco)', doi: '10.1073/pnas.0703877104', status: 'checked' },
  hoffmann: { cite: 'Hoffmann et al. 2018, Sci. Adv. 4:eaar5255 (Iberian Neanderthals: perforated shells and mineral pigments, ~115 ka)', doi: '10.1126/sciadv.aar5255', status: 'checked' },
  sikora: { cite: 'Sikora et al. 2017, Science 358:659 (Sunghir, ~34 ka: burials sewn with thousands of ivory beads)', doi: '10.1126/science.aao1807', status: 'unverified', note: 'paper found; the bead detail is from the site literature, not re-read' },
  soffer: { cite: 'Soffer, Adovasio & Hyland 2000, Curr. Anthropol. 41:511 ("Venus" figurines: string skirts, woven caps and bandeaux ~25 ka)', doi: '10.1086/317381', status: 'checked' },
  kvavadze: { cite: 'Kvavadze et al. 2009, Science 325:1359 (30,000-year-old wild flax fibres, some dyed, Dzudzuana Cave)', doi: '10.1126/science.1175404', status: 'checked' },
  barYosef: { cite: 'Bar-Yosef 1998, Evol. Anthropol. 6:159 (the Natufian; burials with dentalium-shell headgear and necklaces)', doi: '10.1002/(SICI)1520-6505(1998)6:5<159::AID-EVAN4>3.0.CO;2-7', status: 'unverified', note: 'paper found; the shell headgear is from its burial section, not re-read' },
  tarkhan: { cite: 'Stevenson & Dee 2016, Antiquity project gallery (the Tarkhan Dress, linen, 3482-3102 BC: oldest woven garment)', doi: '10.15184/s2978855200900271', status: 'checked' },
  vogelsang: { cite: 'Vogelsang-Eastwood 1993, Pharaonic Egyptian Clothing (Brill): linen kilts, loincloths, sheath dresses, aprons', doi: '10.1163/9789004645202', status: 'unverified', note: 'book found; garments from a general reading of it' },
  otzi: { cite: "O'Sullivan et al. 2016, Sci. Rep. 6:31279 (the Iceman's leather and fur clothing: hide coat and leggings, fur cap, ~3300 BC)", doi: '10.1038/srep31279', status: 'checked' },
  egtved: { cite: 'Frei et al. 2015, Sci. Rep. 5:10431 (the Egtved girl, ~1370 BC, Denmark: wool corded skirt and short-sleeved top)', doi: '10.1038/srep10431', status: 'checked' },
  hallstatt: { cite: 'Bichler et al. (eds) 2005, Hallstatt Textiles (BAR S1351): Iron Age woollen twills, patterned bands', status: 'unverified', note: 'book found via its review (doi:10.5334/pia.236); not read' },
  toga: { cite: 'Olson 2017, Masculinity and Dress in Roman Antiquity, ch. "Tunic and toga: clothing and rank"', doi: '10.4324/9781315678887-2', status: 'checked' },
  croom: { cite: "Croom 2002, Roman Clothing and Fashion (Tempus): women's tunic, stola and palla", status: 'unverified', note: 'general reading' },
  beck: { cite: 'Beck et al. 2014, Quat. Int. 348:224 (trousers from Turfan, ~1200-900 BC, tied to horseback riding)', doi: '10.1016/j.quaint.2014.04.056', status: 'checked' },
  rudenko: { cite: 'Rudenko 1970, Frozen Tombs of Siberia: the Pazyryk Burials of Iron Age Horsemen (felt, fur and leather clothing, felt caps)', status: 'unverified', note: 'book found via its reviews (doi:10.2307/2798447); not read' },
  mehrgarh: { cite: 'Moulherat et al. 2002, J. Archaeol. Sci. 29:1393 (first evidence of cotton, Neolithic Mehrgarh)', doi: '10.1006/jasc.2001.0779', status: 'checked' },
  silk: { cite: 'Gong et al. 2016, PLoS ONE 11:e0168042 (biomolecular evidence of silk 8,500 years ago, Jiahu)', doi: '10.1371/journal.pone.0168042', status: 'checked' },
  han: { cite: 'Archaeological observation on the basic forms of clothing in the Han dynasty, Museum 2019', doi: '10.3724/2096-1715.2019.003.001.021', status: 'unverified', note: 'article found (Chinese); cuts from a general reading: long robes with wide sleeves, topknot under a cap for men' },
  indigo: { cite: 'Splitstoser et al. 2016, Sci. Adv. 2:e1501623 (indigo-dyed cotton fabrics, Huaca Prieta, ~6,000 years ago)', doi: '10.1126/sciadv.1501623', status: 'checked' },
  murra: { cite: 'Murra 1962, Am. Anthropol. 64:710 (cloth and its functions in the Inca state)', doi: '10.1525/aa.1962.64.4.02a00020', status: 'checked', note: 'the unku tunic, acsu dress, mantles and tupu pins from a general reading' },
  anawalt: { cite: 'Anawalt 1981, Indian Clothing Before Cortés: Mesoamerican Costumes from the Codices (loincloth and cloak; huipil and wrap skirt)', status: 'unverified', note: 'book found via its reviews (doi:10.2307/3336053); not read' },
  inuit: { cite: 'Copper and Caribou Inuit skin clothing production (caribou-skin parkas, trousers, hoods)', doi: '10.2307/j.ctv16nz8.3', status: 'unverified', note: 'book found; not read' },
  barkcloth: { cite: 'Bark cloth beaters in South China and Southeast Asia (The Archaeology of Asia-Pacific Navigation, 2019)', doi: '10.1007/978-981-32-9256-7_15', status: 'unverified', note: 'chapter found; bark cloth in the tropics is a general reading' },
  general: { cite: 'General ethnographic reading (not tied to one source)', status: 'unverified' },
} satisfies Record<string, Source>;

// ---- the table -----------------------------------------------------------------------------------------------------
const P = (material: Material, label: string, s: Partial<Omit<Piece, 'material' | 'label'>> = {}): Piece => ({ material, label, ...s });
const ANY_YEAR = { from: -200_000, to: 3000 };

export const WARDROBE: WardrobeRow[] = [
  // Other kinds of human: draped, not tailored.
  {
    id: 'other-human',
    ...ANY_YEAR,
    otherHuman: true,
    outfits: [P('hide', 'Hide cape, not fitted', { over: 'cape', bottom: 'loin' }), P('fur', 'Fur cape, not fitted', { over: 'cape', bottom: 'loin' })],
    hair: { f: ['loose'], m: ['loose'] },
    ornaments: ['shell-beads'],
    paint: 0.25,
    sources: [SRC.collard, SRC.wales, SRC.hoffmann],
  },
  // Before ~40 ka: clothing existed (lice) but simple: hides worn draped, little or none in the warmth.
  {
    id: 'mp-warm',
    from: -200_000,
    to: -40_000,
    climate: ['hot', 'mild'],
    outfits: [P('hide', 'Hide loin cover', { bottom: 'loin' }), P('hide', 'Hide skirt', { bottom: 'short' }), P('hide', 'Hide cape and loin cover', { over: 'cape', bottom: 'loin' })],
    hair: { f: ['loose', 'braids'], m: ['loose', 'cropped'] },
    ornaments: ['shell-beads'],
    paint: 0.5,
    sources: [SRC.toups, SRC.gilligan, SRC.henshilwood, SRC.bouzouggar],
  },
  {
    id: 'mp-cold',
    from: -200_000,
    to: -40_000,
    climate: ['cold'],
    outfits: [P('fur', 'Fur cape and hide wrap', { over: 'cloak', bottom: 'short' })],
    hair: { f: ['loose'], m: ['loose'] },
    sources: [SRC.gilligan, SRC.toups],
  },
  // Upper Palaeolithic: fitted, sewn clothing in the cold; string skirts and caps on the figurines.
  {
    id: 'up-cold',
    from: -40_000,
    to: 3000,
    climate: ['cold'],
    way: ['forager'],
    outfits: [P('fur', 'Sewn fur parka, trousers and hood', { top: 'long', bottom: 'trousers', head: 'hood' }), P('fur', 'Sewn fur parka and trousers', { top: 'long', bottom: 'trousers' })],
    hair: { f: ['braids', 'loose'], m: ['loose', 'tied'] },
    ornaments: ['beads'],
    sources: [SRC.gilligan, SRC.sikora],
  },
  {
    id: 'up-mild',
    from: -40_000,
    to: -6000,
    climate: ['mild'],
    way: ['forager'],
    outfits: [
      P('hide', 'Sewn hide tunic and leggings', { top: 'short', bottom: 'trousers' }),
      P('hide', 'Hide tunic', { top: 'short', bottom: 'short' }),
      P('fibre', 'String skirt', { bottom: 'strings', sex: 'f' }),
      P('fur', 'Fur cloak over a hide skirt', { over: 'cloak', bottom: 'short' }),
    ],
    hair: { f: ['braids', 'covered', 'tied'], m: ['loose', 'tied'] },
    ornaments: ['beads', 'shell-beads'],
    paint: 0.2,
    sources: [SRC.gilligan, SRC.soffer, SRC.kvavadze],
  },
  {
    id: 'up-hot',
    from: -40_000,
    to: 3000,
    climate: ['hot'],
    way: ['forager'],
    outfits: [P('hide', 'Hide loin cover', { bottom: 'loin' }), P('fibre', 'Fibre string skirt', { bottom: 'strings' }), P('hide', 'Hide apron skirt', { bottom: 'short' })],
    hair: { f: ['loose', 'braids', 'cropped'], m: ['cropped', 'loose'] },
    ornaments: ['shell-beads'],
    paint: 0.5,
    sources: [SRC.general, SRC.henshilwood],
  },
  {
    id: 'forager-mild-late',
    from: -6000,
    to: 3000,
    climate: ['mild'],
    way: ['forager'],
    outfits: [P('hide', 'Hide tunic and leggings', { top: 'short', bottom: 'trousers' }), P('hide', 'Hide tunic', { top: 'short', bottom: 'knee' }), P('fur', 'Fur robe over a hide skirt', { over: 'cloak', bottom: 'short' })],
    hair: { f: ['braids', 'loose'], m: ['loose', 'tied'] },
    ornaments: ['beads'],
    sources: [SRC.general],
  },
  // First farmers and herders, anywhere without a closer row: plant fibre and wool, then dyed wool.
  {
    id: 'neolithic',
    from: -10_000,
    to: -2000,
    way: ['farmer', 'herder'],
    outfits: [
      P('linen', 'Linen tunic', { top: 'short', bottom: 'knee', sex: 'm' }),
      P('wool', 'Wool tunic and cloak', { top: 'short', bottom: 'knee', over: 'cloak', sex: 'm' }),
      P('linen', 'Long linen dress', { top: 'short', bottom: 'long', sex: 'f' }),
      P('hide', 'Hide tunic', { top: 'short', bottom: 'knee' }),
    ],
    hair: { f: ['braids', 'tied', 'covered'], m: ['loose', 'tied', 'cropped'] },
    ornaments: ['beads'],
    sources: [SRC.kvavadze, SRC.tarkhan],
  },
  {
    id: 'farmer-later',
    from: -2000,
    to: 3000,
    way: ['farmer', 'herder'],
    outfits: [
      P('wool', 'Wool tunic', { top: 'short', bottom: 'knee', sex: 'm' }),
      P('wool', 'Wool tunic and cloak', { top: 'long', bottom: 'knee', over: 'cloak', sex: 'm' }),
      P('wool', 'Long wool dress', { top: 'long', bottom: 'long', sex: 'f' }),
      P('wool', 'Long dress and head cloth', { top: 'short', bottom: 'long', head: 'headcloth', sex: 'f' }),
    ],
    hair: { f: ['braids', 'tied', 'covered'], m: ['cropped', 'loose'] },
    ornaments: ['pin', 'beads'],
    sources: [SRC.general],
  },
  // Hot farmers without a closer row: little and light.
  {
    id: 'farmer-hot',
    from: -10_000,
    to: 3000,
    climate: ['hot'],
    way: ['farmer', 'herder'],
    outfits: [P('fibre', 'Woven loincloth', { bottom: 'loin', sex: 'm' }), P('fibre', 'Wrap skirt', { bottom: 'knee' }), P('hide', 'Leather apron skirt', { bottom: 'short' })],
    hair: { f: ['cropped', 'braids', 'covered'], m: ['cropped'] },
    ornaments: ['beads'],
    paint: 0.15,
    sources: [SRC.general],
  },
  // --- regions ---
  {
    id: 'arctic',
    ...ANY_YEAR,
    region: ['arctic'],
    outfits: [P('fur', 'Caribou-skin parka, trousers and hood', { top: 'long', bottom: 'trousers', head: 'hood' })],
    hair: { f: ['braids', 'tied'], m: ['loose'] },
    sources: [SRC.inuit, SRC.gilligan],
  },
  {
    id: 'natufian',
    from: -13_000,
    to: -9500,
    region: ['near-east'],
    outfits: [P('hide', 'Hide skirt', { bottom: 'short' }), P('hide', 'Hide tunic', { top: 'short', bottom: 'short' }), P('hide', 'Hide cape and skirt', { over: 'cape', bottom: 'short' })],
    hair: { f: ['braids', 'loose'], m: ['loose', 'tied'] },
    ornaments: ['headband', 'shell-beads'],
    sources: [SRC.barYosef],
  },
  {
    id: 'nile',
    from: -5000,
    to: -30,
    region: ['nile'],
    way: ['farmer', 'herder', 'forager'],
    outfits: [
      P('linen', 'Linen kilt', { bottom: 'knee', sex: 'm' }),
      P('linen', 'Linen loincloth', { bottom: 'loin', sex: 'm' }),
      P('linen', 'Linen sheath dress', { top: 'vest', bottom: 'long', sex: 'f' }),
      P('linen', 'Linen dress with sleeves', { top: 'short', bottom: 'long', sex: 'f' }),
    ],
    palette: ['#ece4d0', '#e2d6b8', '#f1ece0', '#c9b48a'],
    hair: { f: ['loose', 'braids'], m: ['cropped'] },
    ornaments: ['beads'],
    sources: [SRC.tarkhan, SRC.vogelsang],
  },
  {
    id: 'near-east-farmers',
    from: -9500,
    to: -330,
    region: ['near-east'],
    way: ['farmer', 'herder'],
    outfits: [
      P('wool', 'Fringed wool tunic', { top: 'short', bottom: 'knee', sex: 'm' }),
      P('wool', 'Wool wrap over one shoulder', { top: 'short', bottom: 'long', over: 'drape' }),
      P('linen', 'Long linen dress', { top: 'short', bottom: 'long', sex: 'f' }),
    ],
    hair: { f: ['tied', 'covered', 'braids'], m: ['loose', 'tied'] },
    ornaments: ['beads', 'pin'],
    sources: [SRC.kvavadze, SRC.general],
  },
  {
    id: 'alps-copper',
    from: -3800,
    to: -2200,
    region: ['europe'],
    outfits: [P('hide', 'Hide coat, leggings and fur cap', { top: 'long', bottom: 'trousers', head: 'cap' }), P('hide', 'Hide coat and grass cloak', { top: 'long', bottom: 'knee', over: 'cape' })],
    hair: { f: ['braids', 'tied'], m: ['loose', 'tied'] },
    ornaments: ['beads'],
    sources: [SRC.otzi],
  },
  {
    id: 'bronze-europe',
    from: -2200,
    to: -800,
    region: ['europe', 'mediterranean'],
    outfits: [
      P('wool', 'Wool tunic and cloak', { top: 'short', bottom: 'knee', over: 'cloak', sex: 'm' }),
      P('wool', 'Wool tunic and cap', { top: 'short', bottom: 'knee', head: 'cap', sex: 'm' }),
      P('wool', 'Corded string skirt and short top', { top: 'short', bottom: 'strings', sex: 'f' }),
      P('wool', 'Long wool skirt and top', { top: 'short', bottom: 'long', sex: 'f' }),
    ],
    hair: { f: ['tied', 'loose', 'braids'], m: ['loose', 'cropped'] },
    ornaments: ['pin', 'beads'],
    sources: [SRC.egtved],
  },
  {
    id: 'iron-europe',
    from: -800,
    to: 500,
    region: ['europe'],
    outfits: [
      P('wool', 'Wool tunic, trousers and cloak', { top: 'long', bottom: 'trousers', over: 'cloak', sex: 'm' }),
      P('wool', 'Wool tunic and trousers', { top: 'short', bottom: 'trousers', sex: 'm' }),
      P('wool', 'Long wool dress and cloak', { top: 'short', bottom: 'long', over: 'cloak', sex: 'f' }),
    ],
    hair: { f: ['braids', 'tied'], m: ['loose', 'cropped'] },
    ornaments: ['torc', 'pin'],
    sources: [SRC.hallstatt],
  },
  {
    id: 'rome',
    from: -300,
    to: 400,
    region: ['mediterranean'],
    outfits: [
      P('wool', 'Tunic and toga', { top: 'short', bottom: 'knee', over: 'drape', sex: 'm' }),
      P('wool', 'Belted wool tunic', { top: 'short', bottom: 'knee', sex: 'm' }),
      P('wool', 'Stola and palla', { top: 'short', bottom: 'long', over: 'drape', sex: 'f' }),
    ],
    palette: ['#e8e0cc', '#d8c7a2', '#c9b48a', '#8f3b2b'],
    hair: { f: ['tied'], m: ['cropped'] },
    ornaments: ['pin', 'earrings'],
    sources: [SRC.toga, SRC.croom],
  },
  {
    id: 'europe-later',
    from: 500,
    to: 1900,
    region: ['europe', 'mediterranean'],
    outfits: [
      P('wool', 'Wool tunic and cloak', { top: 'long', bottom: 'knee', over: 'cloak', sex: 'm' }),
      P('wool', 'Wool tunic and hose', { top: 'long', bottom: 'trousers', sex: 'm' }),
      P('wool', 'Long wool dress and head cloth', { top: 'long', bottom: 'long', head: 'headcloth', sex: 'f' }),
      P('wool', 'Long dress and cape', { top: 'long', bottom: 'long', over: 'cape', sex: 'f' }),
    ],
    hair: { f: ['covered', 'tied', 'braids'], m: ['cropped'] },
    ornaments: ['pin'],
    sources: [SRC.general],
  },
  {
    id: 'steppe-early',
    from: -4000,
    to: -1200,
    region: ['steppe'],
    outfits: [P('hide', 'Hide coat and leggings', { top: 'long', bottom: 'trousers' }), P('wool', 'Wool tunic and fur cloak', { top: 'short', bottom: 'knee', over: 'cloak' })],
    hair: { f: ['braids'], m: ['loose', 'tied'] },
    ornaments: ['beads'],
    sources: [SRC.general],
  },
  {
    id: 'steppe-riders',
    from: -1200,
    to: 1900,
    region: ['steppe'],
    outfits: [
      P('felt', 'Felt cap, coat and trousers', { top: 'long', bottom: 'trousers', head: 'cap' }),
      P('wool', 'Wool coat and trousers', { top: 'long', bottom: 'trousers' }),
      P('felt', 'Felt coat over trousers', { top: 'long', bottom: 'trousers', over: 'cape' }),
    ],
    palette: ['#8f3b2b', '#3a3230', '#c9b48a', '#b88a3e'],
    hair: { f: ['braids'], m: ['tied', 'braids'] },
    ornaments: ['torc', 'earrings'],
    sources: [SRC.beck, SRC.rudenko],
  },
  {
    id: 'south-asia',
    from: -5000,
    to: 1900,
    region: ['south-asia'],
    way: ['farmer', 'herder'],
    outfits: [
      P('cotton', 'Cotton wrap and shawl', { bottom: 'knee', over: 'drape', sex: 'm' }),
      P('cotton', 'Cotton loin wrap', { bottom: 'loin', sex: 'm' }),
      P('cotton', 'Long cotton wrap and shawl', { top: 'vest', bottom: 'long', over: 'drape', sex: 'f' }),
    ],
    palette: ['#ece4d0', '#e2d6b8', '#3e4f6b', '#b88a3e', '#8f3b2b'],
    hair: { f: ['braids', 'tied'], m: ['tied', 'topknot'] },
    ornaments: ['beads', 'earrings'],
    sources: [SRC.mehrgarh],
  },
  {
    id: 'east-asia',
    from: -2000,
    to: 1900,
    region: ['east-asia'],
    way: ['farmer', 'herder'],
    outfits: [
      P('silk', 'Long robe with wide sleeves', { top: 'long', bottom: 'long' }),
      P('linen', 'Hemp jacket and trousers', { top: 'long', bottom: 'trousers' }),
      P('linen', 'Hemp robe to the knee', { top: 'long', bottom: 'knee' }),
    ],
    palette: ['#3a3230', '#8f3b2b', '#c9b48a', '#3e4f6b', '#6b5a3a'],
    hair: { f: ['tied', 'topknot'], m: ['topknot'] },
    ornaments: ['pin'],
    sources: [SRC.silk, SRC.han],
  },
  {
    id: 'andes',
    from: -4000,
    to: 1600,
    region: ['andes'],
    outfits: [
      P('cotton', 'Unku tunic and mantle', { top: 'vest', bottom: 'knee', over: 'cape', sex: 'm' }),
      P('wool', 'Camelid-wool unku tunic', { top: 'vest', bottom: 'knee', sex: 'm' }),
      P('wool', 'Acsu wrap dress and lliclla shawl', { top: 'vest', bottom: 'long', over: 'cape', sex: 'f' }),
    ],
    palette: ['#8f3b2b', '#3e4f6b', '#c9b48a', '#b88a3e', '#2f2a26'],
    hair: { f: ['braids'], m: ['cropped', 'loose'] },
    ornaments: ['headband', 'pin'],
    sources: [SRC.indigo, SRC.murra],
  },
  {
    id: 'mesoamerica',
    from: -1500,
    to: 1600,
    region: ['mesoamerica'],
    outfits: [
      P('cotton', 'Loincloth and cloak knotted at the shoulder', { bottom: 'loin', over: 'cape', sex: 'm' }),
      P('cotton', 'Cotton loincloth', { bottom: 'loin', sex: 'm' }),
      P('cotton', 'Huipil and wrap skirt', { top: 'vest', bottom: 'long', sex: 'f' }),
    ],
    palette: ['#ece4d0', '#e2d6b8', '#8f3b2b', '#3e4f6b'],
    hair: { f: ['braids', 'tied'], m: ['cropped', 'loose'] },
    ornaments: ['earrings', 'beads'],
    sources: [SRC.anawalt],
  },
  {
    id: 'africa-farmers',
    from: -6000,
    to: 1900,
    region: ['africa'],
    way: ['farmer', 'herder'],
    outfits: [P('hide', 'Leather apron skirt and hide cloak', { bottom: 'short', over: 'cloak' }), P('hide', 'Leather apron skirt', { bottom: 'short' }), P('cotton', 'Cotton wrap', { bottom: 'knee', over: 'drape' })],
    hair: { f: ['cropped', 'braids', 'covered'], m: ['cropped'] },
    ornaments: ['beads'],
    sources: [SRC.general],
  },
  {
    id: 'americas-farmers',
    from: -4000,
    to: 1900,
    region: ['americas'],
    way: ['farmer', 'herder'],
    outfits: [P('fibre', 'Woven breechcloth and blanket', { bottom: 'loin', over: 'cape', sex: 'm' }), P('cotton', 'Cotton kilt', { bottom: 'knee', sex: 'm' }), P('cotton', 'Wrap dress', { top: 'vest', bottom: 'knee', sex: 'f' })],
    hair: { f: ['braids', 'tied'], m: ['loose', 'tied'] },
    ornaments: ['beads', 'shell-beads'],
    sources: [SRC.general],
  },
  {
    id: 'tropics-bark',
    from: -10_000,
    to: 1900,
    region: ['oceania', 'africa', 'east-asia'],
    climate: ['hot'],
    outfits: [P('bark', 'Bark-cloth wrap', { bottom: 'knee' }), P('bark', 'Bark-cloth loincloth', { bottom: 'loin' }), P('fibre', 'Fibre skirt', { bottom: 'strings', sex: 'f' })],
    hair: { f: ['cropped', 'loose'], m: ['cropped', 'loose'] },
    ornaments: ['shell-beads'],
    paint: 0.3,
    sources: [SRC.barkcloth],
  },
];

// ---- where and when ------------------------------------------------------------------------------------------------
type Box = [latMin: number, latMax: number, lonMin: number, lonMax: number];
/** First match wins, so the small boxes come before the large ones. Rough culture areas, not borders. */
const REGIONS: [Region, Box[]][] = [
  ['arctic', [[62, 90, -180, 180]]],
  ['nile', [[22, 32, 29, 34]]],
  ['near-east', [[29, 41, 34, 60]]],
  ['mediterranean', [[35, 46, -10, 30]]],
  ['steppe', [[44, 56, 30, 125]]],
  ['europe', [[42, 72, -25, 45]]],
  ['south-asia', [[5, 36, 60, 92]]],
  ['east-asia', [[18, 56, 92, 146]]],
  ['mesoamerica', [[8, 24, -118, -77]]],
  ['andes', [[-35, 5, -82, -60]]],
  ['americas', [[-56, 90, -170, -30]]],
  ['africa', [[-36, 37, -20, 52]]],
  ['oceania', [[-50, 0, 110, 180], [-30, 20, 140, 180], [-30, 20, -180, -120]]],
];

export function regionOf(lat: number, lon: number): Region {
  for (const [id, boxes] of REGIONS) for (const [a, b, c, d] of boxes) if (lat >= a && lat < b && lon >= c && lon < d) return id;
  return 'other';
}

/** Latitude as a stand-in for climate, colder in the last glacial (as lib/footwear.ts does). */
export function climateOf(lat: number, year: number): Climate {
  const a = Math.abs(lat);
  if (a >= 50 || (a >= 40 && year < -10_000)) return 'cold';
  return a < 23 ? 'hot' : 'mild';
}

export type WardrobeQuery = {
  year: number;
  lat: number;
  lon: number;
  way: Way;
  female: boolean;
  age: number;
  otherHuman: boolean;
  /** A stable per-person number in [0, 1). */
  roll: number;
};

const score = (r: WardrobeRow) => (r.otherHuman ? 64 : 0) + (r.region ? 16 : 0) + (r.climate ? 4 : 0) + (r.way ? 2 : 0);

/** The table's row for a person: the most specific match, the narrower era on a tie. Always one (the last resort rows cover all). */
export function rowFor(q: Omit<WardrobeQuery, 'roll' | 'female' | 'age'>): WardrobeRow {
  const region = regionOf(q.lat, q.lon);
  const climate = climateOf(q.lat, q.year);
  let best: WardrobeRow | null = null;
  for (const r of WARDROBE) {
    if (q.year < r.from || q.year >= r.to) continue;
    if (!!r.otherHuman !== q.otherHuman) continue;
    if (r.region && !r.region.includes(region)) continue;
    if (r.climate && !r.climate.includes(climate)) continue;
    if (r.way && !r.way.includes(q.way)) continue;
    if (!best || score(r) > score(best) || (score(r) === score(best) && r.to - r.from < best.to - best.from)) best = r;
  }
  return best ?? LAST_RESORT;
}

const LAST_RESORT: WardrobeRow = {
  id: 'last-resort',
  ...ANY_YEAR,
  outfits: [P('hide', 'Hide tunic', { top: 'short', bottom: 'knee' })],
  sources: [SRC.general],
};

const full = (p: Piece): Outfit => ({ top: 'none', bottom: 'none', over: 'none', head: 'none', ...p, label: p.label, material: p.material });

// ---- the atlas over the table --------------------------------------------------------------------------------------
const GARMENT_RULES: [RegExp, Partial<Omit<Outfit, 'label' | 'material'>>][] = [
  [/parka|anorak/i, { top: 'long', head: 'hood' }],
  [/trouser|legging|pants/i, { bottom: 'trousers' }],
  [/toga|mantle|himation|palla|shawl|sari|draped/i, { over: 'drape' }],
  [/cloak|cape|blanket|robe of (fur|hide|skin)/i, { over: 'cloak' }],
  [/string skirt|fringed? skirt|grass skirt/i, { bottom: 'strings' }],
  [/kilt|skirt|wrap(ped)? (cloth|skirt)|sarong/i, { bottom: 'knee' }],
  [/loincloth|breechcloth|apron|loin/i, { bottom: 'loin' }],
  [/coat|caftan|kaftan|jacket/i, { top: 'long' }],
  [/dress|gown|sheath|huipil/i, { top: 'short', bottom: 'long' }],
  [/robe/i, { top: 'long', bottom: 'long' }],
  [/tunic|shirt/i, { top: 'short' }],
  [/hood/i, { head: 'hood' }],
  [/\bcap\b|\bhat\b/i, { head: 'cap' }],
];
const MATERIAL_RULES: [RegExp, Material][] = [
  [/\bfurs?\b|pelt/i, 'fur'],
  [/linen|flax|hemp|ramie/i, 'linen'],
  [/silk/i, 'silk'],
  [/cotton/i, 'cotton'],
  [/felt/i, 'felt'],
  [/wool|camelid|alpaca|llama/i, 'wool'],
  [/bark/i, 'bark'],
  [/hide|skin|leather/i, 'hide'],
  [/grass|fibre|fiber|plant|bast|reed/i, 'fibre'],
];

/** The atlas's garments as outfit pieces (empty when no phrase maps), and its first material the table knows. */
export function atlasPieces(garments: string[], materials: string[]): { pieces: Partial<Omit<Outfit, 'label' | 'material'>>; material: Material | null } {
  const pieces: Partial<Omit<Outfit, 'label' | 'material'>> = {};
  for (const g of garments)
    for (const [re, set] of GARMENT_RULES)
      if (re.test(g)) {
        for (const [k, v] of Object.entries(set) as [keyof typeof set, never][]) if (pieces[k] === undefined) pieces[k] = v;
        break;
      }
  let material: Material | null = null;
  for (const m of materials) {
    const hit = MATERIAL_RULES.find(([re]) => re.test(m));
    if (hit) {
      material = hit[1];
      break;
    }
  }
  return { pieces, material };
}

/** A row resting on at least one checked source, or written for other kinds of human: the atlas's model does not override it. */
export const rowIsFirm = (row: WardrobeRow) => !!row.otherHuman || row.sources.some((s) => s.status === 'checked');

/**
 * The atlas has a say when its clothing comes from a real source, or when the table's row rests only on unverified
 * reading: a modelled gap-fill does not override a checked row.
 */
function atlasOver(outfit: Outfit, row: WardrobeRow, rec: AtlasRecord | null): Outfit {
  const c = rec?.fields.clothing;
  if (!c?.value) return outfit;
  if (c.source === 'model' && rowIsFirm(row)) return outfit;
  const { pieces, material } = atlasPieces(c.value.garments ?? [], c.value.materials ?? []);
  if (!Object.keys(pieces).length && !material) return outfit;
  const label = c.value.garments?.[0];
  return { ...outfit, ...pieces, material: material ?? outfit.material, label: label ? label[0].toUpperCase() + label.slice(1) : outfit.label };
}

export type Dress = {
  outfit: Outfit;
  row: WardrobeRow;
  hair: HairDo[];
  ornaments: Ornament[];
  paint: number;
  /** Cloth colours for this row, or null for the era's. */
  palette: string[] | null;
};

/** What a person wears, with the row it came from. Same query, same record: same dress. */
export function wardrobeFor(q: WardrobeQuery, rec: AtlasRecord | null = null): Dress {
  const row = rowFor(q);
  const sex = q.female ? 'f' : 'm';
  const mine = row.outfits.filter((o) => !o.sex || o.sex === sex);
  const pool = mine.length ? mine : row.outfits;
  let outfit = full(pool[Math.floor(q.roll * pool.length) % pool.length]);
  outfit = atlasOver(outfit, row, rec);
  // Small children in the warmth wore little (a general reading: SRC.general).
  if (q.age < 5 && climateOf(q.lat, q.year) !== 'cold' && !q.otherHuman)
    outfit = { ...outfit, top: 'none', bottom: 'loin', over: 'none', head: 'none', label: 'Little or nothing (a small child)' };
  return {
    outfit,
    row,
    hair: row.hair?.[sex] ?? ['loose'],
    ornaments: row.ornaments ?? [],
    paint: row.paint ?? 0,
    palette: row.palette ?? null,
  };
}

/** Garment pieces the build makes, by slot value: the file stem is `piece_<name>_<body>`. */
export const PIECE_FILES: Record<string, string | null> = {
  'top:none': null,
  'top:vest': 'vest',
  'top:short': 'shortsleeve',
  'top:long': 'longsleeve',
  'bottom:none': null,
  'bottom:loin': 'loin',
  'bottom:short': 'skirt_short',
  'bottom:knee': 'skirt_knee',
  'bottom:long': 'skirt_long',
  'bottom:strings': 'strings',
  'bottom:trousers': 'trousers',
  'over:none': null,
  'over:cape': 'cape',
  'over:cloak': 'cloak',
  'over:drape': 'drape',
  'head:none': null,
  'head:hood': 'hood',
  'head:cap': null, // a cone built in the viewer
  'head:headcloth': null, // the bun hair mesh in the cloth colour
};

/** The piece files an outfit needs (no body suffix). A long-sleeved top over trousers is a coat or parka: it gets tails. */
export function pieceFiles(o: Outfit): string[] {
  const files = [`top:${o.top}`, `bottom:${o.bottom}`, `over:${o.over}`, `head:${o.head}`].map((k) => PIECE_FILES[k]).filter((x): x is string => !!x);
  if (o.top === 'long' && o.bottom === 'trousers') files.push('skirt_short');
  return files;
}
