import { avatarFromParams, GREY_HAIR, personSeed, portraitLooks, SKIN_DEEP, SKIN_LIGHT } from './avatar';
import { avatarSpec } from './avatarSpec';
import type { Person } from '@/components/footsteps/layers/people';
import type { AtlasRecord } from '@/components/footsteps/hooks/useAnthropology';

const base: Person = {
  id: 7,
  position: [31.2, 26.1],
  age: 30,
  ageStructure: 'forager',
  female: true,
  role: 'farmer',
  groupKind: 1,
  groupPeople: 300,
  color: [0, 0, 0, 255],
  radius: 6,
  footwear: 0,
  gait: 0.5,
};
const person = (over: Partial<Person> = {}): Person => ({ ...base, ...over });
const people = (n: number, over: Partial<Person> = {}) =>
  Array.from({ length: n }, (_, i) => person({ id: i + 1, position: [10 + i * 0.013, 5 + i * 0.007], ...over }));

/** How dark a skin colour is, 0 = SKIN_LIGHT, 1 = SKIN_DEEP (only for the `rgb()` range colours). */
const depth = (css: string) => {
  const [r] = css.match(/\d+/g)!.map(Number);
  return (SKIN_LIGHT[0] - r) / (SKIN_LIGHT[0] - SKIN_DEEP[0]);
};

describe('portraitLooks', () => {
  it('is deterministic per person, year, place and record', () => {
    const a = portraitLooks(person(), -3000, 26.1, null);
    const b = portraitLooks(person(), -3000, 26.1, null);
    expect({ ...a, r: 0 }).toEqual({ ...b, r: 0 });
    expect(a.r()).toBe(b.r()); // the SVG continues from the same generator state
  });

  it('differs between people', () => {
    const skins = new Set(people(40).map((p) => portraitLooks(p, -3000, 26, null).skin));
    expect(skins.size).toBeGreaterThan(20);
  });

  it('nudges skin deeper toward the tropics, keeping a wide spread', () => {
    const mean = (lat: number) => {
      const ds = people(300).map((p) => depth(portraitLooks(p, 1500, lat, null).skin));
      return ds.reduce((a, b) => a + b, 0) / ds.length;
    };
    expect(mean(0)).toBeGreaterThan(mean(60) + 0.3);
    const spread = people(300).map((p) => depth(portraitLooks(p, 1500, 30, null).skin));
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(0.4);
  });

  it('uses the atlas skin and hair palettes when the record has them', () => {
    const rec = { cell: { key: 'k' }, era: { start: 0, label: '' }, fields: { skin_hair: { value: { skin_palette: ['#8a5a3c'], hair_palette: ['#101010'] } } } } as unknown as AtlasRecord;
    const l = portraitLooks(person(), -3000, 26, rec);
    expect(l.skin).toBe('#8a5a3c');
    expect(l.hair).toBe('#101010');
  });

  it('greys elders and flags children', () => {
    for (const p of people(30, { age: 70 })) expect(GREY_HAIR).toContain(portraitLooks(p, 1500, 40, null).hair);
    expect(portraitLooks(person({ age: 6 }), 1500, 40, null).child).toBe(true);
  });
});

describe('avatarSpec', () => {
  const spec = (p: Person, year = -3000, lat = 26) => avatarSpec(p, portraitLooks(p, year, lat, null), { year });

  it('takes the same skin and hair as the SVG, and its cloth colours for woven cloth with no row palette', () => {
    // central Europe, 1200 CE: wool, and the europe-later row names no palette
    for (const p of people(20, { position: [10, 50] })) {
      const l = portraitLooks(p, 1200, 50, null);
      const s = avatarSpec(p, portraitLooks(p, 1200, 50, null), { year: 1200 });
      expect(s.outfit.material).toBe('wool');
      expect([s.skin, s.hairColour, s.garment, s.trim]).toEqual([l.skin, l.hair, l.cloth.garment, l.cloth.trim]);
    }
  });

  it('colours natural materials by the material, and keeps the atlas palette for cloth', () => {
    const hunter = avatarSpec(person({ position: [16.6, 48.9], groupKind: 0, role: 'hunter' }), portraitLooks(person(), -20000, 48.9, null), { year: -20000 });
    expect(hunter.outfit.material).toBe('fur');
    expect(['#6b4c33', '#8a6a48', '#5a4434', '#9c8466']).toContain(hunter.garment);
    const rec = { cell: { key: 'x' }, era: { start: 0, label: '' }, fields: { clothing: { value: { palette: ['#123456', '#654321'] }, source: 'model' } } } as AtlasRecord;
    const p = person({ position: [12.5, 41.9], female: false });
    const l = portraitLooks(p, 100, 41.9, rec);
    expect(avatarSpec(p, l, { year: 100, rec }).garment).toBe(l.cloth.garment);
  });

  it('is deterministic and does not disturb the SVG draws', () => {
    const p = person({ female: false, id: 12 });
    expect(spec(p)).toEqual(spec(p));
    const l = portraitLooks(p, -3000, 26, null);
    avatarSpec(p, l, { year: -3000 });
    expect(l.r()).toBe(portraitLooks(p, -3000, 26, null).r());
  });

  it('builds children smaller with bigger heads, by age', () => {
    const c3 = spec(person({ age: 3 }));
    const c10 = spec(person({ age: 10 }));
    const adult = spec(person({ age: 30 }));
    expect(c3.ageBand).toBe('child');
    expect(c3.height).toBeCloseTo((77 + 6.1 * 3) / 170, 5);
    expect(c3.height).toBeLessThan(c10.height);
    expect(c10.height).toBeLessThan(adult.height);
    expect(c3.headScale).toBeGreaterThan(c10.headScale);
    expect(adult.headScale).toBe(1);
    expect(adult.stoop).toBe(0);
  });

  it('gives elders a stoop and a slower idle', () => {
    const e = spec(person({ age: 72, female: false }));
    expect(e.ageBand).toBe('elder');
    expect(e.stoop).toBeGreaterThan(0.1);
    expect(e.idleSpeed).toBeLessThan(1);
  });

  it('picks the body by sex and never gives women or children a beard', () => {
    expect(spec(person({ female: false })).body).toBe('male');
    expect(spec(person({ female: true })).body).toBe('female');
    expect(spec(person({ female: true, age: 7 })).body).toBe('male'); // the woman's mesh is an adult's
    expect(people(50).some((p) => spec(p).beard)).toBe(false);
    expect(people(50, { female: false, age: 8 }).some((p) => spec(p).beard)).toBe(false);
    const men = people(100, { female: false }).filter((p) => spec(p).beard).length;
    expect(men).toBeGreaterThan(20);
    expect(men).toBeLessThan(60);
  });

  it('maps the atlas hair styles onto the meshes there are', () => {
    const rec = { cell: { key: 'x' }, era: { start: 0, label: '' }, fields: { hair_adornment: { value: { styles: ['long loose hair', 'braids', 'hair tied in a bun', 'short cropped hair'] }, source: 'model' } } } as AtlasRecord;
    for (const p of people(60, { position: [10, 50] })) {
      const l = portraitLooks(p, 1200, 50, rec);
      const s = avatarSpec(p, l, { year: 1200, rec });
      if (s.outfit.head !== 'none') continue; // hoods, caps and head cloths have their own rules
      const want = { long: 'long', braid: 'buzzed_female', tied: 'buns', wrap: 'buns', short: 'buzzed_female' }[l.hairStyle];
      expect(s.hair).toBe(want);
      expect(s.hairExtra).toBe(l.hairStyle === 'braid' ? 'braids' : null);
    }
  });

  it('dresses, equips and sets to work by era, place and role', () => {
    const nile = spec(person({ position: [32.6, 26.1], role: 'potter' }), -3000, 26.1);
    expect(nile.wardrobeRow).toBe('nile');
    expect(nile.outfit.material).toBe('linen');
    expect(nile.pieces.length).toBeGreaterThan(0);
    expect(nile.tool).toBe('pot');
    expect(nile.loop).toBe('shape');
    const neanderthal = spec(person({ position: [-3, 43.3], groupKind: 0, role: 'toolmaker', kindOfHuman: 'neanderthals' }), -60000, 43.3);
    expect(neanderthal.wardrobeRow).toBe('other-human');
    expect(neanderthal.loop).toBe('knap');
  });

  it('follows the routine state when given one', () => {
    const p = person({ role: 'toolmaker', groupKind: 0 });
    const s = avatarSpec(p, portraitLooks(p, -3000, 26, null), { year: -3000, state: { activity: 'asleep' } });
    expect([s.tool, s.loop]).toEqual(['none', 'doze']);
  });

  it('names other kinds of human so the card can say the body is ours', () => {
    expect(spec(person({ kindOfHuman: 'neanderthals' })).otherHuman).toBe('Neanderthals');
    expect(spec(person()).otherHuman).toBeNull();
  });
});

test('the seed is the spot, not the id (ids change as the view moves)', () => {
  expect(personSeed(person())).toBe(personSeed(person()));
  expect(personSeed(person({ id: 8 }))).toBe(personSeed(person()));
  expect(personSeed(person({ gait: 0.7 }))).not.toBe(personSeed(person()));
});

test('?avatar=3d turns the 3D figure on; anything else leaves the SVG', () => {
  expect(avatarFromParams('?avatar=3d')).toBe(true);
  expect(avatarFromParams('?avatar=1')).toBe(false);
  expect(avatarFromParams('')).toBe(false);
});
