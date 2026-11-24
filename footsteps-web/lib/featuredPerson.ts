// The person the left column shows at street zoom without a click: someone in frame, kept while they stay in frame,
// otherwise the one nearest the middle of the view. Zooming in narrows the frame, so the choice narrows with it.
// Pure, so it can be tested; FootstepsViz feeds it the people in view and the view's box.

import type { Person } from '@/components/footsteps/layers/people';

type Placed = { position: [number, number] };
export type Box = { west: number; south: number; east: number; north: number };

/** A person's stable key: their place is fixed by their group and their index in it (people.ts), unlike `id`, which
 * counts people in view and so changes as the view moves. */
export const personKey = (p: Placed) => `${p.position[0].toFixed(6)},${p.position[1].toFixed(6)}`;

/** Same person as far as the card shows: everything but the drawing's pixel size and colour, which change with zoom. */
export function samePerson(a: Person, b: Person): boolean {
  return (
    personKey(a) === personKey(b) &&
    a.age === b.age &&
    a.female === b.female &&
    a.role === b.role &&
    a.groupKind === b.groupKind &&
    a.groupPeople === b.groupPeople &&
    a.footwear === b.footwear &&
    a.gait === b.gait &&
    a.household === b.household &&
    a.kindOfHuman === b.kindOfHuman &&
    a.ageStructure === b.ageStructure
  );
}

const inside = (p: Placed, b: Box) => {
  const [lon, lat] = p.position;
  return lat >= b.south && lat <= b.north && (b.west <= b.east ? lon >= b.west && lon <= b.east : lon >= b.west || lon <= b.east);
};

/** The featured person: `previous` (by key) if still well inside `box`, else whoever is nearest `centre`, else null.
 * `inset` shrinks the box by that share of its size on every side, so the pick is well inside the frame, not under a panel. */
export function pickFeatured<P extends Placed & { age?: number }>(people: readonly P[], box: Box, centre: [number, number], previous: string | null, inset = 0.15): P | null {
  const dx = (box.west <= box.east ? box.east - box.west : box.east + 360 - box.west) * inset;
  const dy = (box.north - box.south) * inset;
  const inner = { west: box.west + dx, east: box.east - dx, south: box.south + dy, north: box.north - dy };
  if (previous) {
    // Kept while clearly in view: half the inset, so someone slid under a panel at the edge gives way to a new pick.
    const keep = { west: box.west + dx / 2, east: box.east - dx / 2, south: box.south + dy / 2, north: box.north - dy / 2 };
    const kept = people.find((p) => personKey(p) === previous);
    if (kept && inside(kept, keep)) return kept;
  }
  const cosLat = Math.cos((centre[1] * Math.PI) / 180);
  // Someone with a day to show: a person aged 5 or more when there is one, a baby only if no one else is in frame.
  let best: P | null = null;
  let bestD = Infinity;
  let baby: P | null = null;
  let babyD = Infinity;
  for (const p of people) {
    if (!inside(p, inner)) continue;
    if (p.age !== undefined && p.age < 5) {
      const ex = (p.position[0] - centre[0]) * cosLat;
      const ey = p.position[1] - centre[1];
      const d = ex * ex + ey * ey;
      if (d < babyD) { babyD = d; baby = p; }
      continue;
    }
    const ex = (p.position[0] - centre[0]) * cosLat;
    const ey = p.position[1] - centre[1];
    const d = ex * ex + ey * ey;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ?? baby;
}
