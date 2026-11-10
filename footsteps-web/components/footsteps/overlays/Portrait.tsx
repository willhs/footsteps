'use client';

// People-drawer: a layered SVG portrait built from a template. Inputs are the
// imagined person (age, sex, role, band or village) and the anthropology atlas
// record for their place and era (clothing colours and materials, hair styles,
// ornaments, body paint, skin and hair palettes). While the record loads, or
// where it has nothing, era and way of life choose from broad defaults and
// skin/hair tones come from wide ranges nudged by latitude. Deterministic per
// person and record. An illustration of the kind of person, never a likeness.

import type { Person } from '../layers/people';
import { UnitKind } from '../layers/units';
import { useAnthropology, type AtlasRecord } from '../hooks/useAnthropology';

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
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const mix = (a: number[], b: number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

// Broad skin range, light to deep; latitude shifts the centre, the spread stays wide.
const SKIN_LIGHT = [236, 200, 170];
const SKIN_DEEP = [92, 58, 40];
const HAIR = ['#1b1410', '#2a1d15', '#3b2a1e', '#5a3d26', '#7a5a35', '#a07a4a'];

type Palette = { garment: string; trim: string; accent: string };
function clothing(year: number, kind: number, lat: number, r: () => number): Palette & { fur: boolean } {
  const cold = Math.abs(lat) > 45;
  if (kind === UnitKind.Band || year < -6000)
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
function atlasClothing(base: Palette & { fur: boolean }, rec: AtlasRecord | null, r: () => number) {
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

type HairStyle = 'long' | 'tied' | 'braid' | 'short' | 'wrap';
/** Map the atlas's hair-style phrases onto the styles the template can draw. */
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

/** A small object in hand that says what they do. */
function Tool({ role, r }: { role: string; r: () => number }) {
  const wood = '#6e4b2a';
  const stone = '#8d8a84';
  switch (role) {
    case 'hunter':
      return <g><line x1="104" y1="40" x2="96" y2="150" stroke={wood} strokeWidth="3" /><path d="M101 30 L108 44 L100 44 Z" fill={stone} /></g>;
    case 'fisher':
      return <g><line x1="104" y1="38" x2="96" y2="150" stroke={wood} strokeWidth="3" /><path d="M100 30 l3 12 M104 30 l0 12 M108 30 l-3 12" stroke={stone} strokeWidth="2" /></g>;
    case 'gatherer':
    case 'forager':
      return <g><path d="M90 118 q14 -10 28 0 l-4 22 h-20 z" fill="#a8844f" stroke="#6e5230" /><path d="M93 124 h22 M95 131 h18" stroke="#6e5230" /></g>;
    case 'toolmaker':
      return <g><ellipse cx="104" cy="122" rx="9" ry="6" fill={stone} /><path d="M98 120 l12 -3" stroke="#5f5c57" /></g>;
    case 'fire-keeper':
      return <g><path d="M100 140 q4 -18 8 -24 q4 10 0 24 z" fill="#e0782a" /><path d="M102 140 q3 -10 5 -14 q2 6 0 14 z" fill="#f4c04e" /></g>;
    case 'farmer':
      return <g><line x1="104" y1="60" x2="98" y2="150" stroke={wood} strokeWidth="3" /><path d="M96 56 q12 -4 16 8" stroke={r() < 0.5 ? stone : '#a87b3c'} strokeWidth="4" fill="none" /></g>;
    case 'herder':
    case 'elder':
      return <g><path d="M104 150 L104 52 q0 -10 -8 -10" stroke={wood} strokeWidth="3" fill="none" /></g>;
    case 'potter':
      return <g><path d="M94 118 q-4 10 4 20 h14 q8 -10 4 -20 z" fill="#b5643a" /><ellipse cx="105" cy="118" rx="11" ry="3" fill="#8d4a2a" /></g>;
    case 'weaver':
      return <g><line x1="104" y1="104" x2="104" y2="140" stroke={wood} strokeWidth="2" /><ellipse cx="104" cy="122" rx="6" ry="9" fill="#d8c7a2" /></g>;
    case 'builder':
      return <g><rect x="94" y="118" width="22" height="12" fill="#a67c52" stroke="#6e5230" /><line x1="100" y1="118" x2="100" y2="130" stroke="#6e5230" /></g>;
    default:
      return null;
  }
}

export default function Portrait({ person, year, lat }: { person: Person; year: number; lat: number }) {
  const rec = useAnthropology(lat, person.position[0], year);
  const seed = Math.round(person.position[0] * 1e5) ^ Math.round(person.position[1] * 1e5) ^ (person.id * 2654435761);
  const r = rng(seed);
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
  if (elder) hair = r() < 0.7 ? '#bdb6ac' : '#8f8a83';
  const cloth = atlasClothing(clothing(year, person.groupKind, lat, r), rec, r);
  const adorn = rec?.fields.hair_adornment?.value;
  const atlasStyles = hairStylesFrom(adorn?.styles ?? []);
  // most, not all: people in one place still differ. null: the atlas says nothing, use chance
  const beads = adorn?.ornaments?.length ? r() < 0.85 : null;
  const paint = adorn ? (saysNone(adorn.body_paint) ? false : r() < 0.6) : null;

  // proportions: children have bigger heads on smaller bodies
  const headR = child ? 25 : 21;
  const headY = child ? 66 : 58;
  const shoulderY = child ? 112 : 104;
  const shoulderW = child ? 26 : person.female ? 32 : 36;
  const hairStyle: HairStyle = atlasStyles.length
    ? pick(r, atlasStyles)
    : pick(r, person.female ? ['long', 'tied', 'braid', 'short', 'wrap'] : ['short', 'long', 'tied', 'short', 'wrap']);
  const dress = rec?.fields.clothing?.value?.garments?.[0];
  const sources = rec
    ? [...new Set(['clothing', 'hair_adornment', 'skin_hair'].map((k) => rec.fields[k]?.source).filter((x): x is string => !!x && x !== 'none'))]
    : [];

  return (
    <figure className="m-0 shrink-0">
      <svg viewBox="0 0 120 150" width="96" height="120" role="img" aria-label={`Illustration of a ${person.role}, about ${person.age}`} className="rounded bg-[#2a241d]">
        {/* setting hint */}
        <circle cx="60" cy="70" r="58" fill={person.groupKind === UnitKind.Band ? '#3b3a2a' : '#4a3f2a'} />
        <rect x="0" y="128" width="120" height="22" fill={person.groupKind === UnitKind.Band ? '#4b4630' : '#6a5a38'} />
        {/* body and garment */}
        <path d={`M${60 - shoulderW} 150 Q${60 - shoulderW} ${shoulderY} 60 ${shoulderY - 6} Q${60 + shoulderW} ${shoulderY} ${60 + shoulderW} 150 Z`} fill={cloth.garment} />
        <path d={`M${60 - shoulderW + 6} ${shoulderY + 4} Q60 ${shoulderY + 14} ${60 + shoulderW - 6} ${shoulderY + 4}`} stroke={cloth.trim} strokeWidth="3" fill="none" />
        {cloth.fur && <path d={`M${60 - shoulderW + 2} ${shoulderY + 2} Q60 ${shoulderY - 10} ${60 + shoulderW - 2} ${shoulderY + 2} Q60 ${shoulderY + 8} ${60 - shoulderW + 2} ${shoulderY + 2}`} fill="#cbb89a" opacity="0.9" />}
        {/* neck */}
        <rect x="53" y={headY + headR - 6} width="14" height={shoulderY - headY - headR + 4} fill={skinShade} />
        {/* adornment */}
        {(beads ?? r() < 0.6) && <path d={`M50 ${shoulderY - 2} Q60 ${shoulderY + 8} 70 ${shoulderY - 2}`} stroke={cloth.accent} strokeWidth="2.5" strokeDasharray="2 2" fill="none" />}
        {/* hair behind */}
        {(hairStyle === 'long' || hairStyle === 'braid') && <path d={`M${60 - headR - 2} ${headY} Q${60 - headR - 4} ${headY + 34} ${60 - headR + 6} ${headY + 38} L${60 + headR - 6} ${headY + 38} Q${60 + headR + 4} ${headY + 34} ${60 + headR + 2} ${headY} Z`} fill={hair} />}
        {/* head */}
        <ellipse cx="60" cy={headY} rx={headR - 2} ry={headR} fill={skin} />
        {/* hair on top */}
        {hairStyle === 'wrap' ? (
          <path d={`M${60 - headR} ${headY - 2} Q60 ${headY - headR - 14} ${60 + headR} ${headY - 2} Q60 ${headY - headR + 2} ${60 - headR} ${headY - 2}`} fill={cloth.trim} />
        ) : (
          <path d={`M${60 - headR + 1} ${headY - 3} Q60 ${headY - headR - 9} ${60 + headR - 1} ${headY - 3} Q${60 + headR - 6} ${headY - headR + 6} 60 ${headY - headR + 4} Q${60 - headR + 6} ${headY - headR + 6} ${60 - headR + 1} ${headY - 3}`} fill={hair} />
        )}
        {hairStyle === 'tied' && <circle cx={60} cy={headY - headR - 3} r="6" fill={hair} />}
        {hairStyle === 'braid' && <path d={`M${60 + headR - 4} ${headY + 4} q6 14 0 30`} stroke={hair} strokeWidth="5" fill="none" />}
        {/* face */}
        <ellipse cx="52" cy={headY + 1} rx="2" ry="2.2" fill="#1d1612" />
        <ellipse cx="68" cy={headY + 1} rx="2" ry="2.2" fill="#1d1612" />
        <path d={`M48 ${headY - 6} q4 -2 8 0 M64 ${headY - 6} q4 -2 8 0`} stroke={hair === '#bdb6ac' ? '#8f8a83' : hair} strokeWidth="1.6" fill="none" />
        <path d={`M60 ${headY + 3} q-2 6 1 7`} stroke={skinShade} strokeWidth="1.4" fill="none" />
        <path d={`M54 ${headY + 13} q6 ${child ? 4 : 3} 12 0`} stroke="#6b3b2c" strokeWidth="1.6" fill="none" />
        {elder && <path d={`M45 ${headY + 2} q3 3 6 0 M69 ${headY + 2} q3 3 6 0 M52 ${headY - 13} h16`} stroke={skinShade} strokeWidth="1" fill="none" />}
        {(paint ?? (cloth.accent === '#b5532c' && person.groupKind === UnitKind.Band && r() < 0.4)) && <path d={`M47 ${headY + 7} h6 M67 ${headY + 7} h6`} stroke="#b5532c" strokeWidth="2" />}
        <Tool role={person.role} r={r} />
      </svg>
      <figcaption
        className="mt-1 w-24 text-[10px] leading-tight text-white/45"
        title={rec ? `${rec.era.label}. Dress, hair and colours from the anthropology atlas (${sources.join(', ')}); "model" means AI gap-fill.` : undefined}
      >
        {dress && <span className="block text-white/60">{dress}</span>}
        Illustration,<br />not a likeness
      </figcaption>
    </figure>
  );
}
