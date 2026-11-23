'use client';

// People-drawer: a layered SVG portrait built from a template. Skin, hair,
// clothing colours and hair style come from `portraitLooks` (lib/avatar.ts,
// shared with the 3D figure behind ?avatar=3d), from the imagined person and the
// anthropology atlas record for their place and era. Deterministic per person and
// record. An illustration of the kind of person, never a likeness.

import type { Person } from '../layers/people';
import { UnitKind } from '../layers/units';
import { useAnthropology } from '../hooks/useAnthropology';
import { portraitLooks } from '@/lib/avatar';

// The palette logic lives in lib/avatar.ts (shared with the 3D figure); these stay importable from here.
export { hairStylesFrom, saysNone } from '@/lib/avatar';

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
  const atlas = useAnthropology(lat, person.position[0], year);
  if (atlas.kind === 'loading') return (
    <div role="status" className="flex h-[120px] w-24 shrink-0 items-center justify-center rounded-[var(--ov-radius-sm)] bg-[#2a241d] p-3 text-center text-[11px] text-[var(--ov-text-3)]">
      Preparing illustration…
    </div>
  );
  const rec = atlas.rec;
  const { skin, skinShade, hair, cloth, beads, paint, hairStyle, child, elder, r } = portraitLooks(person, year, lat, rec);

  // proportions: children have bigger heads on smaller bodies
  const headR = child ? 25 : 21;
  const headY = child ? 66 : 58;
  const shoulderY = child ? 112 : 104;
  const shoulderW = child ? 26 : person.female ? 32 : 36;
  const dress = rec?.fields.clothing?.value?.garments?.[0];
  const sources = rec
    ? [...new Set(['clothing', 'hair_adornment', 'skin_hair'].map((k) => rec.fields[k]?.source).filter((x): x is string => !!x && x !== 'none'))]
    : [];

  return (
    <figure className="m-0 shrink-0">
      <svg viewBox="0 0 120 150" width="96" height="120" role="img" aria-label={`Illustration of a ${person.role}, about ${person.age}`} className="rounded-[var(--ov-radius-sm)] bg-[#2a241d]">
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
        className="mt-1.5 w-24 text-[11px] leading-snug text-[var(--ov-text-3)]"
        title={rec ? `${rec.era.label}. Dress, hair and colours from the anthropology atlas (${sources.join(', ')}); "model" means AI gap-fill.` : undefined}
      >
        {dress && <span className="block text-[var(--ov-text-2)]">{dress}</span>}
        Illustration,<br />not a likeness
      </figcaption>
    </figure>
  );
}
