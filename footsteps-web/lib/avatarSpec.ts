// The 3D figure for a person (`?avatar=3d`, docs/ops/avatar.md): body, build, hair mesh and colours, from the same looks
// the SVG portrait draws (lib/avatar.ts `portraitLooks`). Only the lazy-loaded viewer imports this, so it stays out of the
// first load.

import type { Person } from '@/components/footsteps/layers/people';
import { OTHER_HUMANS } from './otherHumans';
import { personSeed, rng, type Looks } from './avatar';

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
  /** The hair mesh stands for a head wrap: drawn in the trim colour, not the hair colour. */
  hairIsWrap: boolean;
  beard: boolean;
  skin: string;
  hairColour: string;
  garment: string;
  trim: string;
  /** Where the idle loop starts (0-1) and how the head turns: so two people side by side do not move in step. */
  phase: number;
  turnSeed: number;
  /** Set for other kinds of human: the figure is our own species' body, and the card says so. */
  otherHuman: string | null;
};

/** Standing height in cm for a child of `age`, close to the WHO medians (86 cm at 2, 116 at 6, 150 at 12). */
const childCm = (age: number) => 77 + 6.1 * Math.max(0, age);
const ADULT_CM = 170;

/** The 3D figure for a person, from the same looks the SVG draws. Deterministic: extra draws use their own generator. */
export function avatarSpec(person: Person, looks: Looks): AvatarSpec {
  const r = rng(personSeed(person) ^ 0x5bd1e995);
  const ageBand: AgeBand = looks.child ? 'child' : looks.elder ? 'elder' : 'adult';
  const grown = Math.min(1, childCm(person.age) / ADULT_CM);
  const height = person.age < 18 ? grown : looks.elder ? 0.98 : 1;
  const headScale = 1 + 0.6 * (1 - grown);
  const stoop = looks.elder ? Math.min(0.4, 0.2 + 0.006 * (person.age - 55)) : 0;
  const style = looks.hairStyle;
  const hair: HairMesh =
    style === 'long' || style === 'braid' ? 'long' : style === 'tied' || style === 'wrap' ? 'buns' : person.female ? 'buzzed_female' : 'parted';
  const beard = !person.female && person.age >= 18 && r() < 0.4;
  const other = person.kindOfHuman ? (OTHER_HUMANS.find((h) => h.id === person.kindOfHuman)?.name ?? person.kindOfHuman) : null;
  return {
    body: person.female && !looks.child ? 'female' : 'male',
    ageBand,
    height,
    headScale,
    stoop,
    idleSpeed: looks.elder ? 0.8 : looks.child ? 1.1 : 1,
    hair,
    hairIsWrap: style === 'wrap',
    beard,
    skin: looks.skin,
    hairColour: looks.hair,
    garment: looks.cloth.garment,
    trim: looks.cloth.trim,
    phase: r(),
    turnSeed: Math.floor(r() * 2 ** 31),
    otherHuman: other,
  };
}

/** The card's line for another kind of human: we do not invent their anatomy. */
export const OTHER_HUMAN_BODY_NOTE = "Illustration of our own species' body; their build differed.";
