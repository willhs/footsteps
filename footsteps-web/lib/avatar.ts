// How an imagined person looks, for both illustrations of them: the SVG portrait (overlays/Portrait.tsx) and the 3D
// figure behind `?avatar=3d` (overlays/Avatar3D.tsx, docs/ops/avatar.md). One place decides skin, hair, clothing colours
// and hair style, so the two agree.
//
// Inputs are the imagined person (age, sex, role, band or village) and the anthropology atlas record for their place and
// era (clothing colours and materials, hair styles, ornaments, body paint, skin and hair palettes). When the record is
// unavailable or has nothing, era and way of life choose from broad defaults and skin/hair tones come from wide ranges
// nudged by latitude. Deterministic per person and record. An illustration of the kind of person, never a likeness.
//
// The draw order of `portraitLooks` is load-bearing: the SVG keeps drawing from the same generator afterwards (beads and
// paint fallbacks, the tool), so reordering a draw here changes every portrait (the `rome-1000bce-person` visual scene
// catches it). Anything new draws from its own generator (`avatarSpec`).

import type { Person } from '@/components/footsteps/layers/people';
import type { AtlasRecord } from '@/components/footsteps/hooks/useAnthropology';
import { OTHER_HUMANS } from './otherHumans';

// Matches UnitKind.Band in components/footsteps/layers/units.ts (not imported: that module pulls in the layer code).
const BAND = 0;

/** A small, fast, seeded generator (mulberry32): the same seed gives the same numbers in every browser. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const mix = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

/** The person's own seed: their fixed spot (and its gait hash), not `id`: ids count the people in view and change as the view moves. */
export const personSeed = (person: Person) =>
  Math.round(person.position[0] * 1e5) ^ Math.round(person.position[1] * 1e5) ^ Math.round(person.gait * 2654435761);

// Broad skin range, light to deep; latitude shifts the centre, the spread stays wide.
export const SKIN_LIGHT = [236, 200, 170];
export const SKIN_DEEP = [92, 58, 40];
export const HAIR = ['#1b1410', '#2a1d15', '#3b2a1e', '#5a3d26', '#7a5a35', '#a07a4a'];
export const GREY_HAIR = ['#bdb6ac', '#8f8a83'];

export type Palette = { garment: string; trim: string; accent: string };
export type Clothing = Palette & { fur: boolean };

function clothing(year: number, kind: number, lat: number, r: () => number): Clothing {
  const cold = Math.abs(lat) > 45;
  if (kind === BAND || year < -6000)
    return {
      garment: pick(r, ['#7b5a3c', '#8a6a48', '#6b4c33', '#9a7a52']), // hide, bark cloth
      trim: pick(r, ['#c9a46a', '#5a4030']),
      accent: pick(r, ['#b5532c', '#d9c7a3', '#2f2a26']), // ochre, shell, charcoal
      fur: cold || r() < 0.25,
    };
  const dyed = year > -2000;
  return {
    garment: pick(r, dyed ? ['#d8c7a2', '#c9b48a', '#8f3b2b', '#3e4f6b', '#b88a3e'] : ['#d8c7a2', '#c9b48a', '#a8916a']), // undyed wool/linen, madder, indigo, weld
    trim: pick(r, dyed ? ['#7a2e22', '#2d3a55', '#e2d6b8'] : ['#8a7350', '#e2d6b8']),
    accent: pick(r, year > -1500 ? ['#c08a2e', '#b5532c', '#3f7a6a'] : ['#b5532c', '#e2d6b8']), // bronze/copper later
    fur: cold && r() < 0.6,
  };
}

// Garments only: materials lists include sandals and belts, so 'leather' there says nothing about a fur wrap.
const FUR = /\bfurs?\b|\bhides?\b|\bpelts?\b|\bskins?\b/i;
/** Atlas text that records an absence ("none recorded", "no evidence") rather than a thing. */
export const saysNone = (s: string | null | undefined) => !s || /^\s*(none|no|not|unknown)\b/i.test(s);

/** Atlas clothing over the era defaults: its palette for garment and trim, fur if its materials say so. */
function atlasClothing(base: Clothing, rec: AtlasRecord | null, r: () => number): Clothing {
  const c = rec?.fields.clothing?.value;
  const palette = (c?.palette ?? []).filter((x) => /^#[0-9a-f]{6}$/i.test(x));
  if (!c || palette.length === 0) return base;
  const text = (c.garments ?? []).join(' ');
  return {
    garment: palette[Math.floor(r() * Math.min(2, palette.length))],
    trim: palette[palette.length - 1],
    accent: base.accent,
    fur: base.fur || FUR.test(text),
  };
}

export type HairStyle = 'long' | 'tied' | 'braid' | 'short' | 'wrap';
/** Map the atlas's hair-style phrases onto the styles the illustrations can draw. */
export function hairStylesFrom(phrases: string[]): HairStyle[] {
  const out = new Set<HairStyle>();
  for (const p of phrases) {
    if (/braid|plait/i.test(p)) out.add('braid');
    if (/tied|bun|knot|topknot|tail/i.test(p)) out.add('tied');
    if (/cover|wrap|cap|veil|turban|headdress|hood|scarf/i.test(p)) out.add('wrap');
    if (/short|shaved|shorn|cropped/i.test(p)) out.add('short');
    if (/long|loose/i.test(p) && !/tied|braid/i.test(p)) out.add('long');
  }
  return [...out];
}

const pickHex = (r: () => number, xs: string[] | undefined) => {
  const ok = (xs ?? []).filter((x) => /^#[0-9a-f]{6}$/i.test(x));
  return ok.length ? pick(r, ok) : null;
};

export type Looks = {
  /** CSS colour: `#rrggbb` from the atlas palette or `rgb(r,g,b)` from the latitude-nudged range. */
  skin: string;
  /** A darker skin for the SVG's neck and nose line. */
  skinShade: string;
  hair: string;
  cloth: Clothing;
  /** null: the atlas says nothing about ornaments (the SVG then uses chance). */
  beads: boolean | null;
  paint: boolean | null;
  hairStyle: HairStyle;
  child: boolean;
  elder: boolean;
  /** The generator in the state the SVG continues from. */
  r: () => number;
};

/** Skin, hair, clothing and hair style for a person. Same person, year, place and record: same looks. */
export function portraitLooks(person: Person, year: number, lat: number, rec: AtlasRecord | null): Looks {
  const r = rng(personSeed(person));
  const child = person.age < 13;
  const elder = person.age >= 55;

  // skin: wide random spread, centre nudged deeper toward the tropics
  const latPull = 1 - Math.min(1, Math.abs(lat) / 60); // 1 at equator, 0 at 60°
  const tone = Math.min(1, Math.max(0, 0.25 + 0.5 * latPull + (r() - 0.5) * 0.6));
  const looks = rec?.fields.skin_hair?.value;
  const atlasSkin = pickHex(r, looks?.skin_palette);
  const skin = atlasSkin ?? mix(SKIN_LIGHT, SKIN_DEEP, tone);
  const skinShade = atlasSkin ? `color-mix(in srgb, ${atlasSkin} 82%, black)` : mix(SKIN_LIGHT, SKIN_DEEP, Math.min(1, tone + 0.18));
  let hair = pickHex(r, looks?.hair_palette) ?? (Math.abs(lat) > 45 && r() < 0.35 ? pick(r, HAIR.slice(3)) : pick(r, HAIR.slice(0, 4)));
  if (elder) hair = r() < 0.7 ? GREY_HAIR[0] : GREY_HAIR[1];
  const cloth = atlasClothing(clothing(year, person.groupKind, lat, r), rec, r);
  const adorn = rec?.fields.hair_adornment?.value;
  const atlasStyles = hairStylesFrom(adorn?.styles ?? []);
  // most, not all: people in one place still differ. null: the atlas says nothing, use chance
  const beads = adorn?.ornaments?.length ? r() < 0.85 : null;
  const paint = adorn ? (saysNone(adorn.body_paint) ? false : r() < 0.6) : null;
  const hairStyle: HairStyle = atlasStyles.length
    ? pick(r, atlasStyles)
    : pick(r, person.female ? ['long', 'tied', 'braid', 'short', 'wrap'] : ['short', 'long', 'tied', 'short', 'wrap']);
  return { skin, skinShade, hair, cloth, beads, paint, hairStyle, child, elder, r };
}

// ---- the 3D figure ------------------------------------------------------------------------------------------

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

/** `?avatar=3d` asks for the 3D figure in the person card (off by default until Will reviews it). */
export function avatarFromParams(search: string): boolean {
  return new URLSearchParams(search).get('avatar') === '3d';
}

/** The card's line for another kind of human: we do not invent their anatomy. */
export const OTHER_HUMAN_BODY_NOTE = "Illustration of our own species' body; their build differed.";
