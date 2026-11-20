import { UnitKind } from '@/components/footsteps/layers/units';
import {
  ARCHAEOLOGICAL_TYPES,
  NO_SOCIETY,
  SHAPES,
  describeShelter,
  parseDwellings,
  recordedHouse,
  shelterSpec,
  sheltersParam,
  townMix,
  type DwellingFile,
} from './dwellings';

const file: DwellingFile = {
  version: 1,
  caveat: 'The ethnographic present (about 1850-1950) is not the past.',
  codes: {
    plan: { '1': 'Semicircular', '2': 'Circular', '5': 'Rectangular' },
    walls: { '5': 'Hides or skins', '11': 'Walls not diff. from roof' },
    roof: { '8': 'Grass, leaves or thatch' },
  },
  columns: ['id', 'name', 'year', 'plan', 'walls', 'roof'],
  societies: [['xd1', '!Kung', 1950, 2, 11, 8]],
};
const table = parseDwellings(file);
const at = (kind: number, year = 1000, lon = 0, lat = 0) => ({ kind, year, lon, lat });
const codes = (plan: number | null, walls: number | null, roof: number | null) => ({ plan, walls, roof });

describe('?shelters flag', () => {
  it('is off unless the URL asks', () => {
    expect(sheltersParam('')).toBe(false);
    expect(sheltersParam('?shelters=0')).toBe(false);
    expect(sheltersParam('?year=-7000&shelters=1')).toBe(true);
  });
});

describe('dwelling type from an analog society (Ethnographic Atlas house codes)', () => {
  const type = (c: ReturnType<typeof codes> | null, kind: number, year = 1000, lon = 0, lat = 0) => {
    const s = shelterSpec(c, at(kind, year, lon, lat));
    return [s.how, s.shape, s.material];
  };

  it('draws a circular grass house with walls and roof one (the !Kung) as a low dome of thatch', () => {
    expect(type(codes(2, 11, 8), UnitKind.Band)).toEqual(['analog', 'dome', 'thatch']);
  });
  it('draws a felt tent of a herding camp as a round yurt, white', () => {
    expect(type(codes(2, 6, 6), UnitKind.Camp)).toEqual(['analog', 'drum', 'felt']);
  });
  it('draws a circular hide tent of foragers as a cone, and an igloo (snow roof) as a dome', () => {
    expect(type(codes(2, 5, 5), UnitKind.Band)).toEqual(['analog', 'cone', 'hides']);
    expect(type(codes(2, 11, 10), UnitKind.Band)).toEqual(['analog', 'dome', 'snow']);
  });
  it('draws a semicircular plan as a windbreak', () => {
    expect(type(codes(1, 11, 8), UnitKind.Band)[1]).toBe('lean');
  });
  it('draws rectangular houses gabled, or flat-roofed where the roof is clay or earth', () => {
    expect(type(codes(5, 3, 8), UnitKind.Village)).toEqual(['analog', 'gable', 'thatch']);
    expect(type(codes(5, 9, 2), UnitKind.Village)).toEqual(['analog', 'block', 'mud']);
    expect(type(codes(5, 1, 11), UnitKind.Village)).toEqual(['analog', 'gable', 'tile']);
  });
  it('draws circular solid-walled houses as drums', () => {
    expect(type(codes(2, 3, 8), UnitKind.Village)).toEqual(['analog', 'drum', 'thatch']);
  });
  it('falls back to a plain default for the kind of group where the analog recorded no house', () => {
    expect(type(codes(null, null, null), UnitKind.Band)).toEqual(['kind', 'dome', 'thatch']);
    expect(type(null, UnitKind.Camp)).toEqual(['kind', 'drum', 'felt']);
    expect(type(null, UnitKind.Village)).toEqual(['kind', 'gable', 'thatch']);
  });
  it('only ever names a shape the renderer has', () => {
    for (const plan of [null, 1, 2, 3, 4, 5, 6])
      for (const walls of [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        for (const roof of [null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
          for (const kind of [0, 1, 2, 3]) expect(SHAPES).toContain(shelterSpec(codes(plan, walls, roof), at(kind)).shape);
  });
});

describe('dwelling types known from digs', () => {
  it('uses mammoth-bone huts for bands on the Russian Plain at Mezhyrich in 15,000 BCE, whatever the analog says', () => {
    const s = shelterSpec(codes(2, 5, 5), at(UnitKind.Band, -15000, 31.41, 49.63));
    expect(s).toMatchObject({ how: 'archaeology', shape: 'dome', material: 'bone' });
  });
  it('leaves the same place to the analogs once the mammoth steppe is gone, and for other kinds of group', () => {
    expect(shelterSpec(codes(2, 5, 5), at(UnitKind.Band, -5000, 31.41, 49.63)).how).toBe('analog');
    expect(shelterSpec(codes(2, 5, 5), at(UnitKind.Camp, -15000, 31.41, 49.63)).how).toBe('analog');
  });
  it('leaves Ohalo II (Levant, 21,000 BCE) to the analogs: brush huts are not a dug type here', () => {
    expect(shelterSpec(codes(2, 11, 8), at(UnitKind.Band, -21000, 35.55, 32.86)).how).toBe('analog');
  });
  it('uses packed flat-roofed mud-brick houses for farmers near Çatalhöyük in 7000 BCE', () => {
    const s = shelterSpec(codes(2, 3, 8), at(UnitKind.Village, -7000, 32.83, 37.67));
    expect(s).toMatchObject({ how: 'archaeology', shape: 'block', material: 'mud' });
  });
  it('keeps every type to a sensible box and dated range, with a source', () => {
    for (const t of ARCHAEOLOGICAL_TYPES) {
      expect(t.box.west).toBeLessThan(t.box.east);
      expect(t.box.south).toBeLessThan(t.box.north);
      expect(t.years[0]).toBeLessThan(t.years[1]);
      expect(t.source).toMatch(/\d{4}/);
    }
  });
});

describe('town roofs', () => {
  it('tiles Rome in 100 CE with gables among stone blocks', () => {
    const mix = townMix(12.5, 41.9, 100);
    expect(mix.map(([shape, material]) => `${shape}/${material}`)).toEqual(['gable/tile', 'block/stone']);
    expect(mix.reduce((sum, [, , share]) => sum + share, 0)).toBeCloseTo(1, 6);
  });
  it('gives every region row a mix that sums to one', () => {
    for (const [lon, lat, year] of [[44, 33, -2000], [116, 39, 1400], [-99, 19, 1400], [2, 49, 1200], [12.5, 41.9, 100]])
      expect(townMix(lon, lat, year).reduce((sum, [, , share]) => sum + share, 0)).toBeCloseTo(1, 6);
  });
});

describe('what the hover says', () => {
  it('names the analog and its recorded house, and says the place is imagined', () => {
    const s = shelterSpec(table.societies[0], at(UnitKind.Band));
    const words = describeShelter(s, table.societies[0], table);
    expect(words.title).toMatch(/^Modelled:/);
    expect(words.evidence).toBe('Like the !Kung, recorded 1950: circular plan; walls and roof one, of grass, leaves or thatch.');
    expect(words.placement).toMatch(/Imagined/);
    expect(words.caveat).toMatch(/ethnographic present is not the past/);
  });
  it('says a dug type comes from digs, with its source, and a town roof that nobody recorded it', () => {
    const dug = shelterSpec(null, at(UnitKind.Band, -15000, 31.41, 49.63));
    expect(describeShelter(dug, null, table).evidence).toMatch(/known from digs.*Mezhyrich.*Pidoplichko 1998/);
    const town = describeShelter({ how: 'town', shape: 'gable', material: 'tile' }, null, table, 40);
    expect(town.evidence).toMatch(/no analog society was recorded/);
    expect(town.placement).toMatch(/about 40 households/);
  });
  it('says so where the analog kept no house record', () => {
    const none = { id: 'x', name: 'Hare', year: 1860, plan: null, walls: null, roof: null };
    const words = describeShelter(shelterSpec(none, at(UnitKind.Band)), none, table);
    expect(words.evidence).toMatch(/kept no house record/);
  });
  it('reads codes the table does not know as no phrase', () => {
    expect(recordedHouse(codes(null, null, null), table)).toBeNull();
    expect(recordedHouse(codes(1, null, null), table)).toBe('semicircular plan');
  });
});

describe('the table', () => {
  it('indexes societies by id and uses one sentinel for none', () => {
    expect(table.index.get('xd1')).toBe(0);
    expect(table.societies[0]).toMatchObject({ name: '!Kung', plan: 2, walls: 11, roof: 8 });
    expect(NO_SOCIETY).toBe(0xffff);
  });
});
