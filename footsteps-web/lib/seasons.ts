import { UnitKind, type Units } from '@/components/footsteps/layers/units';
import type { Region } from '@/components/footsteps/hooks/unitRegion';

export type Season = 'off' | 'june' | 'december';

/** Include entire gathering territories even when the viewport is street-sized.
 * Otherwise a camp would lose its neighbouring allocations as the camera pans. */
export function seasonalRegion(region: Region): Region {
  return {
    west: Math.floor(region.west * 2) / 2,
    east: Math.ceil(region.east * 2) / 2,
    south: Math.floor(region.south * 2) / 2,
    north: Math.ceil(region.north * 2) / 2,
  };
}

/** A scenario, not a seasonal ethnographic reconstruction. Mobility comes from
 * the settlement analog model; hemisphere and latitude set the local contrast.
 * Work on a copied viewport slice, retaining IDs and each cell's people budget. */
export function seasonalUnits(units: Units, width: number, season: Season): Units {
  if (season === 'off') return units;
  const out = { ...units, positions: units.positions.slice(), people: units.people.slice() };
  const cellDeg = 360 / width;
  let start = 0;
  while (start < units.length) {
    const cell = Math.floor(units.ids[start] / 32);
    let end = start + 1;
    while (end < units.length && Math.floor(units.ids[end] / 32) === cell) end++;
    const lat = 90 - (Math.floor(cell / width) + 0.5) * cellDeg;
    const lon = ((cell % width) + 0.5) * cellDeg - 180;
    const summer = (season === 'june' ? 1 : -1) * Math.sign(lat);
    const contrast = Math.min(1, Math.abs(lat) / 30);
    const mobileBands: number[] = [];
    for (let i = start; i < end; i++) {
      if (units.kind[i] === UnitKind.Band && (units.mobility?.[i] ?? 0) > 0) mobileBands.push(i);
    }
    // Prehistory cells usually hold one fractional band. Shared illustrative
    // 0.5-degree territories let those neighbours gather too; no claim is made
    // about a measured route or site. Source-cell allocations retain their IDs.
    const territory = Math.max(1, Math.round(0.5 / cellDeg));
    const gatheringLon = (Math.floor((cell % width) / territory) + 0.5) * territory * cellDeg - 180;
    const gatheringLat = 90 - (Math.floor(Math.floor(cell / width) / territory) + 0.5) * territory * cellDeg;
    for (let i = start; i < end; i++) {
      const mobility = units.mobility?.[i] ?? 0;
      if (mobility === 0) continue;
      if (units.kind[i] === UnitKind.Band && summer < 0) {
        const gatherShare = contrast * Math.min(1, mobility * 2);
        out.positions[i * 2] += (gatheringLon - out.positions[i * 2]) * gatherShare;
        out.positions[i * 2 + 1] += (gatheringLat - out.positions[i * 2 + 1]) * gatherShare;
        const gather = mobileBands[(i - start) % Math.min(2, mobileBands.length)];
        if (i !== gather) {
          const share = out.people[i] * gatherShare;
          out.people[i] -= share;
          out.people[gather] += share;
        }
      } else if (units.kind[i] === UnitKind.Camp) {
        out.positions[i * 2] = lon + (units.positions[i * 2] - lon) * (1 - 0.5 * contrast);
        out.positions[i * 2 + 1] = lat + summer * cellDeg * 0.3 * contrast * mobility;
      }
    }
    start = end;
  }
  return out;
}
