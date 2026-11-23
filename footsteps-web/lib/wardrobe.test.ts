import { atlasPieces, climateOf, pieceFiles, regionOf, rowFor, WARDROBE, wardrobeFor, type WardrobeQuery } from './wardrobe';
import type { AtlasRecord } from '@/components/footsteps/hooks/useAnthropology';

const q = (over: Partial<WardrobeQuery>): WardrobeQuery => ({ year: 0, lat: 0, lon: 0, way: 'farmer', female: false, age: 30, otherHuman: false, roll: 0.3, ...over });

const atlas = (garments: string[], materials: string[], source = 'model'): AtlasRecord => ({
  cell: { key: 'x' },
  era: { start: 0, label: '' },
  fields: { clothing: { value: { garments, materials }, source } },
});

describe('the table', () => {
  it('cites a source on every row, each checked or unverified with a reason', () => {
    for (const row of WARDROBE) {
      expect(row.sources.length).toBeGreaterThan(0);
      for (const s of row.sources) {
        expect(s.cite.length).toBeGreaterThan(10);
        if (s.status === 'unverified' && s.cite !== 'General ethnographic reading (not tied to one source)') expect(s.note).toBeTruthy();
      }
      expect(row.outfits.length).toBeGreaterThan(0);
    }
  });

  it('has a row for anyone, anywhere, any year', () => {
    for (const year of [-90000, -45000, -20000, -9000, -3000, 0, 1500])
      for (const [lat, lon] of [[60, 10], [0, 20], [-30, 140], [40, -100], [70, -50]])
        for (const way of ['forager', 'farmer', 'herder'] as const) expect(wardrobeFor(q({ year, lat, lon, way })).outfit.label).toBeTruthy();
  });
});

describe('places and climates', () => {
  it('finds the culture areas', () => {
    expect(regionOf(26.1, 32.6)).toBe('nile');
    expect(regionOf(32.7, 35)).toBe('near-east');
    expect(regionOf(41.9, 12.5)).toBe('mediterranean');
    expect(regionOf(52.6, 59.6)).toBe('steppe');
    expect(regionOf(34.6, 112.4)).toBe('east-asia');
    expect(regionOf(-13.5, -72)).toBe('andes');
    expect(regionOf(19.4, -99.1)).toBe('mesoamerica');
    expect(regionOf(-1.3, 36.8)).toBe('africa');
    expect(regionOf(68, -50)).toBe('arctic');
  });

  it('reads the glacial as cold further south', () => {
    expect(climateOf(45, -20000)).toBe('cold');
    expect(climateOf(45, 1000)).toBe('mild');
    expect(climateOf(10, 1000)).toBe('hot');
  });
});

describe('lookup per era and region (the contact sheet people)', () => {
  const cases: [string, Partial<WardrobeQuery>, string, (o: ReturnType<typeof wardrobeFor>['outfit']) => boolean][] = [
    ['Ice Age Europe forager: sewn fur', { year: -20000, lat: 48.9, lon: 16.6, way: 'forager' }, 'up-cold', (o) => o.material === 'fur' && o.top === 'long' && o.bottom === 'trousers'],
    ['East Africa 50 ka: little, of hide', { year: -50000, lat: -1.3, lon: 36.8, way: 'forager', female: true }, 'mp-warm', (o) => o.material === 'hide' && o.top === 'none'],
    ['Natufian: hide', { year: -11000, lat: 32.7, lon: 35, way: 'forager' }, 'natufian', (o) => o.material === 'hide'],
    ['Nile 3000 BCE woman: linen dress', { year: -3000, lat: 26.1, lon: 32.6, female: true }, 'nile', (o) => o.material === 'linen' && o.bottom === 'long'],
    ['Nile 3000 BCE man: linen kilt or loincloth', { year: -3000, lat: 26.1, lon: 32.6 }, 'nile', (o) => o.material === 'linen' && o.top === 'none'],
    ['Steppe riders: trousers', { year: -500, lat: 50, lon: 80, way: 'herder' }, 'steppe-riders', (o) => o.bottom === 'trousers'],
    ['Rome 100 CE man: tunic', { year: 100, lat: 41.9, lon: 12.5 }, 'rome', (o) => o.material === 'wool' && o.top === 'short'],
    ['Han China: long sleeves', { year: 100, lat: 34.6, lon: 112.4, female: true }, 'east-asia', (o) => o.top === 'long'],
    ['Andes 1400 man: unku', { year: 1400, lat: -13.5, lon: -72 }, 'andes', (o) => o.top === 'vest' && o.bottom === 'knee'],
    ['Meseta 1500 woman: long wool', { year: 1500, lat: 40.4, lon: -3.7, female: true }, 'europe-later', (o) => o.material === 'wool' && o.bottom === 'long'],
    ['Neanderthal: draped, not fitted', { year: -60000, lat: 43.3, lon: -3, way: 'forager', otherHuman: true }, 'other-human', (o) => o.over === 'cape' && o.top === 'none'],
  ];
  it.each(cases)('%s', (_name, query, row, ok) => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.99]) {
      const d = wardrobeFor(q({ ...query, roll }));
      expect(d.row.id).toBe(row);
      expect(ok(d.outfit)).toBe(true);
    }
  });

  it('dresses small children in the warmth lightly', () => {
    expect(wardrobeFor(q({ year: 100, lat: 41.9, lon: 12.5, age: 3 })).outfit.bottom).toBe('loin');
    expect(wardrobeFor(q({ year: -20000, lat: 48.9, lon: 16.6, way: 'forager', age: 3 })).outfit.material).toBe('fur');
  });

  it('is deterministic', () => {
    const a = wardrobeFor(q({ year: -1000, lat: 50, lon: 10, roll: 0.42 }));
    expect(wardrobeFor(q({ year: -1000, lat: 50, lon: 10, roll: 0.42 }))).toEqual(a);
  });

  it('prefers the narrower era on a tie, the more specific row otherwise', () => {
    expect(rowFor(q({ year: -9000, lat: 48, lon: 5, way: 'farmer' })).id).toBe('neolithic');
    expect(rowFor(q({ year: -1500, lat: 48, lon: 5, way: 'farmer' })).id).toBe('bronze-europe');
  });
});

describe('the atlas over the table', () => {
  it('maps garment phrases and materials onto pieces', () => {
    expect(atlasPieces(['fur parka with hood', 'leggings'], ['caribou fur']).pieces).toMatchObject({ top: 'long', head: 'hood', bottom: 'trousers' });
    expect(atlasPieces(['simple tunic'], ['flax linen', 'wool']).material).toBe('linen');
    expect(atlasPieces(['nothing we know'], []).pieces).toEqual({});
  });

  it('a real atlas source overrides the table', () => {
    const d = wardrobeFor(q({ year: -3000, lat: 26.1, lon: 32.6 }), atlas(['simple tunic', 'cloak'], ['wool'], 'D-PLACE EA'));
    expect(d.outfit.top).toBe('short');
    expect(d.outfit.material).toBe('wool');
    expect(d.outfit.label).toBe('Simple tunic');
  });

  it('a modelled atlas does not override a checked row, but fills an unverified one', () => {
    const nile = wardrobeFor(q({ year: -3000, lat: 26.1, lon: 32.6 }), atlas(['simple tunic'], ['wool']));
    expect(nile.outfit.material).toBe('linen');
    const general = wardrobeFor(q({ year: 1200, lat: 50, lon: 10 }), atlas(['simple tunic', 'trousers'], ['hemp']));
    expect(general.row.id).toBe('europe-later');
    expect(general.outfit).toMatchObject({ top: 'short', bottom: 'trousers', material: 'linen' });
  });

  it('never fits other kinds of human with tailored clothes from the atlas model', () => {
    const d = wardrobeFor(q({ year: -60000, lat: 43, lon: -3, way: 'forager', otherHuman: true }), atlas(['fur parka', 'trousers'], ['fur']));
    expect(d.outfit.top).toBe('none');
  });
});

test('piece files: one per worn slot; coats and parkas get tails', () => {
  expect(pieceFiles({ top: 'short', bottom: 'knee', over: 'drape', head: 'none', material: 'wool', label: '' })).toEqual(['shortsleeve', 'skirt_knee', 'drape']);
  expect(pieceFiles({ top: 'long', bottom: 'trousers', over: 'none', head: 'hood', material: 'fur', label: '' })).toEqual(['longsleeve', 'trousers', 'hood', 'skirt_short']);
  expect(pieceFiles({ top: 'none', bottom: 'loin', over: 'none', head: 'cap', material: 'hide', label: '' })).toEqual(['loin']);
});
