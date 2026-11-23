// The 3D figure for a person (`?avatar=3d`, docs/ops/avatar.md): body, build, clothes, hair, ornaments, tool and work,
// from the same looks the SVG portrait draws (lib/avatar.ts `portraitLooks`), the wardrobe table (lib/wardrobe.ts) and
// the role's work (lib/avatarWork.ts). Only the lazy-loaded viewer imports this, so it stays out of the first load.

import type { Person } from '@/components/footsteps/layers/people';
import type { AtlasRecord } from '@/components/footsteps/hooks/useAnthropology';
import type { State } from './routine';
import { OTHER_HUMANS } from './otherHumans';
import { hairStylesFrom, personSeed, pick, rng, saysNone, type HairStyle, type Looks } from './avatar';
import { pieceFiles, regionOf, rowIsFirm, wardrobeFor, type HairDo, type Material, type Ornament, type Outfit, type Way } from './wardrobe';
import { LOOPS, routineWork, workFor, type Loop, type Tool } from './avatarWork';

/** The hair meshes in public/avatar/ (footstep-generator/avatar/build.mjs `HAIR`). */
export type HairMesh = 'long' | 'buns' | 'parted' | 'buzzed' | 'buzzed_female';
export type AgeBand = 'child' | 'adult' | 'elder';

/** Everything the 3D viewer needs to build one person; plain data, so it is testable without WebGL. */
export type AvatarSpec = {
  /**
   * Which base body: the pack has an adult man and woman. Children use the man's body, scaled: before puberty bodies differ
   * little by sex, and the woman's mesh is an adult's. Their hair and the card still say girl or boy.
   */
  body: 'male' | 'female';
  ageBand: AgeBand;
  /** Uniform scale against the adult body (about 1.8 m): a growth curve for children, a little shorter for elders. */
  height: number;
  /** Scale of the head bone: children's heads are larger for their size. */
  headScale: number;
  /** Forward bend, radians, spread over the spine and neck after the animation (elders). */
  stoop: number;
  /** Idle playback speed: elders slower, children a little quicker. */
  idleSpeed: number;
  hair: HairMesh;
  /** The hair mesh stands for a head cloth: drawn in the garment colour, not the hair colour. */
  hairIsWrap: boolean;
  /** A small extra shape in the hair colour: two braids, or a knot on the crown. */
  hairExtra: 'braids' | 'topknot' | null;
  beard: boolean;
  skin: string;
  hairColour: string;
  garment: string;
  trim: string;
  /** Beads, pins and torcs. */
  accent: string;
  /** What they wear (lib/wardrobe.ts) and the piece files it needs (`piece_<name>_<body>.glb`). */
  outfit: Outfit;
  pieces: string[];
  /** The wardrobe row it came from, for the card and tests. */
  wardrobeRow: string;
  ornaments: Ornament[];
  /** Ochre lines on the face. */
  paint: boolean;
  tool: Tool;
  loop: Loop;
  /** Where the idle loop starts (0-1) and how the head turns: so two people side by side do not move in step. */
  phase: number;
  turnSeed: number;
  /** When work and rest alternate. */
  workSeed: number;
  /** Set for other kinds of human: the figure is our own species' body, and the card says so. */
  otherHuman: string | null;
};

/** Standing height in cm for a child of `age`, close to the WHO medians (86 cm at 2, 116 at 6, 150 at 12). */
const childCm = (age: number) => 77 + 6.1 * Math.max(0, age);
const ADULT_CM = 170;

/** Natural colours of the materials that are not dyed here: [garments…], [trims…]. */
const NATURAL: Partial<Record<Material, [string[], string[]]>> = {
  fur: [['#6b4c33', '#8a6a48', '#5a4434', '#9c8466'], ['#d8c8ae', '#c4ab88']],
  hide: [['#8a6a48', '#9a7a52', '#7b5a3c', '#a8865e'], ['#5a4030', '#c9a46a']],
  bark: [['#9b6b43', '#b08055', '#8a5a36'], ['#5a3a20', '#d9c7a3']],
  fibre: [['#b39a6e', '#a08458', '#c4ab7c'], ['#7a5c3e', '#5a4030']],
};
const METAL = ['#b5862e', '#c9a14a', '#9a6a3a'];
const SHELL = ['#ece4d4', '#e2d6b8'];

/** The atlas's hair style as a hair-do. */
const FROM_STYLE: Record<HairStyle, HairDo> = { long: 'loose', tied: 'tied', braid: 'braids', short: 'cropped', wrap: 'covered' };

const ORNAMENT_RULES: [RegExp, Ornament][] = [
  [/shell|dentalium|cowrie/i, 'shell-beads'],
  [/bead|tooth|teeth|ivory|faience|necklace|collar/i, 'beads'],
  [/torc|neck ?ring/i, 'torc'],
  [/pin|brooch|fibula/i, 'pin'],
  [/ear/i, 'earrings'],
  [/headband|diadem|fillet|circlet|band/i, 'headband'],
];

export type SpecContext = {
  year: number;
  rec?: AtlasRecord | null;
  /** The routine state now (`?routine=1`), or null for the role's usual work. */
  state?: State | null;
};

const WAY: Record<number, Way> = { 0: 'forager', 1: 'farmer', 2: 'herder' };

/** The 3D figure for a person. Deterministic: its draws come from its own generator, so the SVG's are untouched. */
export function avatarSpec(person: Person, looks: Looks, { year, rec = null, state = null }: SpecContext): AvatarSpec {
  const r = rng(personSeed(person) ^ 0x5bd1e995);
  const [lon, lat] = person.position;
  const ageBand: AgeBand = looks.child ? 'child' : looks.elder ? 'elder' : 'adult';
  const grown = Math.min(1, childCm(person.age) / ADULT_CM);
  const height = person.age < 18 ? grown : looks.elder ? 0.98 : 1;
  const headScale = 1 + 0.6 * (1 - grown);
  const stoop = looks.elder ? Math.min(0.4, 0.2 + 0.006 * (person.age - 55)) : 0;
  const beard = !person.female && person.age >= 18 && r() < 0.4;
  const phase = r();
  const turnSeed = Math.floor(r() * 2 ** 31);
  const other = person.kindOfHuman ? (OTHER_HUMANS.find((h) => h.id === person.kindOfHuman)?.name ?? person.kindOfHuman) : null;

  // What they wear.
  const dress = wardrobeFor(
    { year, lat, lon, way: WAY[person.groupKind] ?? 'forager', female: person.female, age: person.age, otherHuman: !!person.kindOfHuman, roll: r() },
    rec,
  );
  const { outfit } = dress;
  const body = person.female && !looks.child ? 'female' : 'male';

  // Colours: natural materials keep their own; cloth takes the atlas palette, else the row's, else the era's (as the SVG).
  const natural = NATURAL[outfit.material];
  const atlasPalette = (rec?.fields.clothing?.value?.palette ?? []).some((x) => /^#[0-9a-f]{6}$/i.test(x));
  let garment = looks.cloth.garment;
  let trim = looks.cloth.trim;
  const gPick = r();
  const tPick = r();
  if (natural) {
    garment = natural[0][Math.floor(gPick * natural[0].length)];
    trim = natural[1][Math.floor(tPick * natural[1].length)];
  } else if (!atlasPalette && dress.palette) {
    const p = dress.palette;
    garment = p[Math.floor(gPick * p.length)];
    const others = p.filter((c) => c !== garment);
    trim = others[Math.floor(tPick * others.length)];
  }

  // Hair: the atlas's styles where it has a say (as for clothes), else the row's.
  const adorn = rec?.fields.hair_adornment;
  const atlasSays = !!adorn?.value && !(adorn.source === 'model' && rowIsFirm(dress.row));
  const atlasStyles = atlasSays ? hairStylesFrom(adorn!.value!.styles ?? []) : [];
  let hairDo: HairDo = atlasStyles.length ? FROM_STYLE[looks.hairStyle] : pick(r, dress.hair);
  if (outfit.head === 'headcloth') hairDo = 'covered';
  if (outfit.head === 'hood' && hairDo === 'covered') hairDo = 'cropped';
  const cropped: HairMesh = person.female ? 'buzzed_female' : 'parted';
  const shortUnder: HairMesh = person.female ? 'buzzed_female' : 'buzzed';
  const covers = outfit.head === 'hood' || outfit.head === 'cap';
  const hair: HairMesh = covers
    ? shortUnder
    : hairDo === 'loose'
      ? 'long'
      : hairDo === 'tied' || hairDo === 'covered'
        ? 'buns'
        : hairDo === 'braids' || hairDo === 'topknot'
          ? shortUnder
          : cropped;
  const hairExtra = covers ? null : hairDo === 'braids' ? 'braids' : hairDo === 'topknot' ? 'topknot' : null;

  // Ornaments and paint: the atlas where it says, else the row's, each worn by most but not all.
  const named = atlasSays ? (adorn!.value!.ornaments ?? []).map((o) => ORNAMENT_RULES.find(([re]) => re.test(o))?.[1]).filter((o): o is Ornament => !!o) : [];
  const pool = [...new Set(named.length ? named : dress.ornaments)];
  const ornaments = pool.filter(() => r() < 0.6).slice(0, 2);
  const paintRoll = r();
  const paint = atlasSays && adorn?.value ? !saysNone(adorn.value.body_paint) && paintRoll < 0.6 : looks.paint ?? paintRoll < dress.paint;
  const accent = ornaments.some((o) => o === 'torc' || o === 'pin') && year > -2500 ? pick(r, METAL) : ornaments.includes('shell-beads') ? pick(r, SHELL) : looks.cloth.accent;

  // Tool and work.
  const workQuery = { role: person.role, year, region: regionOf(lat, lon), female: person.female, roll: r() };
  const work = state ? routineWork(state, workQuery) : workFor(workQuery);
  const workSeed = Math.floor(r() * 2 ** 31);

  return {
    body,
    ageBand,
    height,
    headScale,
    stoop,
    idleSpeed: looks.elder ? 0.8 : looks.child ? 1.1 : 1,
    hair,
    hairIsWrap: hairDo === 'covered',
    hairExtra,
    beard,
    skin: looks.skin,
    hairColour: looks.hair,
    garment,
    trim,
    accent,
    outfit,
    pieces: pieceFiles(outfit),
    wardrobeRow: dress.row.id,
    ornaments,
    paint,
    tool: work.tool,
    loop: work.loop,
    phase,
    turnSeed,
    workSeed,
    otherHuman: other,
  };
}

/** The card's caption: what they wear and what they are doing. */
export function avatarCaption(spec: AvatarSpec): string {
  const doing = LOOPS[spec.loop].doing;
  return doing ? `${spec.outfit.label}; ${doing}` : spec.outfit.label;
}

/** The card's line for another kind of human: we do not invent their anatomy. */
export const OTHER_HUMAN_BODY_NOTE = "Illustration of our own species' body; their build differed.";
