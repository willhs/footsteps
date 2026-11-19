// Selection only; the layer class needs WebGL and is not imported here.
jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import { UnitKind } from './units';
import { peopleForGroups, type Person } from './people';
import { MAX_TAGS, MIN_TAG_SCALE, TAG_ZOOM, chooseTags, tagText, tagVisibility, type Project } from './personTags';

const village = { lon: 31.131, lat: 30.8885, kind: UnitKind.Village, people: 150 };
const people = peopleForGroups([village], 1500);
const size = { width: 1200, height: 800 };
// A flat map at about 0.35 m per pixel, centred on the village.
const M_PER_PX = 0.35;
const project: Project = ([lon, lat]) => ({
  x: size.width / 2 + ((lon - village.lon) * 111_320 * Math.cos((village.lat * Math.PI) / 180)) / M_PER_PX,
  y: size.height / 2 - ((lat - village.lat) * 111_320) / M_PER_PX,
  scale: 1,
});
const choose = (over: Partial<Parameters<typeof chooseTags>[0]> = {}) =>
  chooseTags({ people, clock: 10, centre: [village.lon, village.lat], size, project, ...over });

describe('tags', () => {
  it('say role and age', () => {
    const p = people.find((q) => q.role === 'potter') ?? people[0];
    expect(tagText(p)).toBe(`${p.role}, ${p.age}`);
  });

  it('fade in with zoom, and are gone below the threshold', () => {
    expect(tagVisibility(TAG_ZOOM.from - 0.1)).toBe(0);
    expect(tagVisibility(TAG_ZOOM.full)).toBe(1);
    const mid = tagVisibility((TAG_ZOOM.from + TAG_ZOOM.full) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it('are capped and never overlap', () => {
    const tags = choose();
    expect(tags.length).toBeGreaterThan(5);
    expect(tags.length).toBeLessThanOrEqual(MAX_TAGS);
    expect(choose({ max: 3 })).toHaveLength(3);
    // Boxes as the chooser draws them: starting 13 px right of the print, ~6.6 px a letter, 12 px tall.
    const boxes = tags.map((t) => {
      const { x, y } = project(t.position);
      return { x0: x + 13, x1: x + 13 + t.text.length * 6.6, y0: y - 6, y1: y + 6 };
    });
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false);
      }
  });

  it('follow the walker: the position is the newest print, and it changes with the clock', () => {
    const early = choose({ clock: 0 });
    const later = choose({ clock: 20 });
    const first = early[0];
    const same = later.find((t) => t.person.id === first.person.id);
    expect(first.position).not.toEqual(first.person.position);
    // someone moved between the two moments
    const moved = early.some((t) => {
      const l = later.find((u) => u.person.id === t.person.id);
      return l && (l.position[0] !== t.position[0] || l.position[1] !== t.position[1]);
    });
    expect(moved).toBe(true);
    expect(same === undefined || same.person === first.person).toBe(true);
  });

  it('keep the people tagged last time ahead of nearer strangers', () => {
    const all = choose();
    // Someone far from the centre who fits; pretend they were tagged last time and ask for one tag.
    const far = all[all.length - 1];
    const next = choose({ max: 1, kept: new Set([far.person.id]) });
    expect(next[0].person.id).toBe(far.person.id);
  });

  it('skip people off screen or far from the view', () => {
    expect(choose({ centre: [village.lon + 1, village.lat] })).toHaveLength(0);
    const offScreen: Project = () => ({ x: -50, y: -50, scale: 1 });
    expect(choose({ project: offScreen })).toHaveLength(0);
  });

  it('leave out tags drawn too small to read (near the horizon of a tilted view)', () => {
    const far: Project = (lonLat) => ({ ...project(lonLat), scale: MIN_TAG_SCALE - 0.01 });
    expect(choose({ project: far })).toHaveLength(0);
    const near: Project = (lonLat) => ({ ...project(lonLat), scale: MIN_TAG_SCALE + 0.01 });
    expect(choose({ project: near }).length).toBeGreaterThan(0);
  });

  it('handle an empty crowd', () => {
    expect(choose({ people: [] as Person[] })).toEqual([]);
  });
});
