// Marauder's Map name tags: at the closest zoom each of a handful of people gets a small tag
// ("potter, 34") beside their newest footprint. IMAGINED, like the people: role and age are drawn
// from a typical population (people.ts). Which people, and where their tags sit, is decided
// here from plain data; the hook (hooks/usePersonTags.ts) runs it a few times a second.
import { newestPrint } from '@/lib/gait';
import type { Person } from './people';

/** Tags fade in over this zoom range (flat map; ~0.35 m per pixel at the top at 30°N). */
export const TAG_ZOOM = { from: 16.6, full: 17.4 } as const;
/** At most this many tags at once: the nearest to the view centre that fit. */
export const MAX_TAGS = 150;
/** Text size in pixels and the gap between the print and the tag. */
export const TAG_FONT_PX = 12;
export const TAG_GAP_PX = 13;

/** Tags that would be drawn smaller than this fraction of full size are left out (unreadable). */
export const MIN_TAG_SCALE = 0.75;
const TAG_ROOM_PX = 4; // empty space kept round each tag
const CHAR_PX = 6.6; // average glyph width at TAG_FONT_PX, a little generous
const MAX_RANGE_M = 700; // people farther than this from the view centre are not considered
const M_PER_DEG_LAT = 111_320;

export const tagText = (p: Pick<Person, 'role' | 'age'>) => `${p.role}, ${p.age}`;

/** 0 to 1: how visible tags are at a zoom. */
export function tagVisibility(zoom: number): number {
  const t = Math.min(1, Math.max(0, (zoom - TAG_ZOOM.from) / (TAG_ZOOM.full - TAG_ZOOM.from)));
  return t * t * (3 - 2 * t);
}

/** A place on screen: x, y in pixels, and `scale`, how big a pixel-sized mark drawn there is next to
 * one at the view centre. deck.gl draws pixel sizes smaller with distance in a tilted view, so a tag
 * near the horizon is tiny (scale is 1 everywhere on a flat map). */
export type Projected = { x: number; y: number; scale: number };
export type Project = (lonLat: [number, number]) => Projected;

export type Tag = {
  person: Person;
  text: string;
  /** Where the person's newest footprint is now, [lon, lat]. Rewritten in place each update. */
  position: [number, number];
};

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The tags to show for `people` now. `centre` is the view centre [lon, lat], `size` the screen in
 * pixels, `project` maps a place to the screen. `kept` are the people tagged last time: they are
 * considered first, so a tag does not wink out because a stranger came nearer the centre. */
export function chooseTags({
  people,
  clock,
  centre,
  size,
  project,
  kept = new Set<number>(),
  max = MAX_TAGS,
}: {
  people: readonly Person[];
  clock: number;
  centre: [number, number];
  size: { width: number; height: number };
  project: Project;
  kept?: ReadonlySet<number>;
  max?: number;
}): Tag[] {
  const [cLon, cLat] = centre;
  const mPerDegLon = M_PER_DEG_LAT * Math.max(0.2, Math.cos((cLat * Math.PI) / 180));
  const cx = size.width / 2;
  const cy = size.height / 2;
  const candidates: { tag: Tag; box: Box; rank: number }[] = [];
  for (const person of people) {
    const [lon, lat] = person.position;
    const dx = (lon - cLon) * mPerDegLon;
    const dy = (lat - cLat) * M_PER_DEG_LAT;
    if (Math.abs(dx) > MAX_RANGE_M || Math.abs(dy) > MAX_RANGE_M) continue;
    const position = newestPrint(person.position, person.gait, clock);
    const { x: px, y: py, scale } = project(position);
    if (px < 0 || py < 0 || px > size.width || py > size.height || scale < MIN_TAG_SCALE) continue;
    const text = tagText(person);
    const w = text.length * CHAR_PX * scale;
    const gap = TAG_GAP_PX * scale;
    const half = (TAG_FONT_PX / 2) * scale;
    candidates.push({
      tag: { person, text, position },
      box: {
        x0: px + gap - TAG_ROOM_PX,
        x1: px + gap + w + TAG_ROOM_PX,
        y0: py - half - TAG_ROOM_PX,
        y1: py + half + TAG_ROOM_PX,
      },
      // Nearest the middle of the screen first; people tagged last time come before everyone else.
      rank: Math.hypot(px - cx, py - cy) - (kept.has(person.id) ? 1e6 : 0),
    });
  }
  candidates.sort((a, b) => a.rank - b.rank);
  const placed: Box[] = [];
  const out: Tag[] = [];
  for (const c of candidates) {
    if (out.length >= max) break;
    if (placed.some((box) => overlaps(box, c.box))) continue;
    placed.push(c.box);
    out.push(c.tag);
  }
  return out;
}
