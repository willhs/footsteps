import { seasonalRegion, seasonalUnits } from './seasons';
import { buildUnitMorph } from '@/components/footsteps/hooks/unitMorph';
import { sliceUnits } from '@/components/footsteps/hooks/unitRegion';
import { UnitKind, type Units } from '@/components/footsteps/layers/units';

function groups(lat = 45, kind: number = UnitKind.Band): Units {
  const cell = Math.floor(90 - lat) * 360 + 180;
  return {
    length: 4, positions: new Float32Array([0.1, lat, 0.2, lat, 0.3, lat, 0.4, lat]),
    people: new Float32Array([30, 40, 50, 60]), kind: new Uint8Array(4).fill(kind),
    ids: new Uint32Array([cell * 32, cell * 32 + 1, cell * 32 + 2, cell * 32 + 3]),
    mobility: new Float32Array([1, 1, 1, 1]), counts: [4, 0, 0, 0],
  };
}

test('winter gathers mobile bands, retaining head counts, IDs and the immutable summer source', () => {
  const source = groups();
  const summer = seasonalUnits(source, 360, 'june');
  const winter = seasonalUnits(source, 360, 'december');
  expect(Array.from(summer.people)).toEqual([30, 40, 50, 60]);
  expect(Array.from(winter.people)).toEqual([80, 100, 0, 0]);
  expect(Array.from(source.people)).toEqual([30, 40, 50, 60]);
  expect(winter.ids).toEqual(source.ids);
  const morph = buildUnitMorph(winter, winter, true);
  expect(Array.from(morph.info.people)).toEqual([80, 100, 0, 0]);
  expect(Array.from(morph.attributes.getFillColor.value).filter((_, i) => i % 4 === 3)).toEqual([200, 200, 0, 0]);
});

test('southern seasons reverse, tropical contrast fades and settled people remain fixed', () => {
  expect(Array.from(seasonalUnits(groups(-45), 360, 'june').people)).toEqual([80, 100, 0, 0]);
  const settled = groups();
  settled.mobility!.fill(0);
  expect(seasonalUnits(settled, 360, 'december').people).toEqual(settled.people);
  const equator = groups(0.5);
  const output = seasonalUnits(equator, 360, 'december');
  expect(output.people[2]).toBeCloseTo(49.166667, 3);
  for (const kind of [UnitKind.Village, UnitKind.Glow]) {
    const fixed = groups(45, kind);
    expect(seasonalUnits(fixed, 360, 'december').positions).toEqual(fixed.positions);
    expect(seasonalUnits(fixed, 360, 'december').people).toEqual(fixed.people);
  }
});

test('herder pastures change inside their cell without changing population or moving settled camps', () => {
  const source = groups(45, UnitKind.Camp);
  source.mobility![0] = 0;
  const summer = seasonalUnits(source, 360, 'june');
  const winter = seasonalUnits(source, 360, 'december');
  expect(summer.positions[3]).toBeCloseTo(44.8, 4);
  expect(winter.positions[3]).toBeCloseTo(44.2, 4);
  expect(summer.positions[1]).toBe(45);
  expect(winter.people).toEqual(source.people);
  expect(seasonalUnits(source, 360, 'off')).toBe(source);
});

test('single fractional bands from neighbouring HYDE cells share a winter gathering site', () => {
  const width = 4320;
  const cell = 540 * width + 2160; // latitude 45N, longitude 0E
  const source: Units = {
    length: 2, positions: new Float32Array([0.04, 44.96, 0.12, 44.96]),
    people: new Float32Array([0.25, 0.5]), kind: new Uint8Array([UnitKind.Band, UnitKind.Band]),
    ids: new Uint32Array([cell * 32, (cell + 1) * 32]),
    mobility: new Float32Array([1, 1]), counts: [2, 0, 0, 0],
  };
  const region = seasonalRegion({ west: 0.2, east: 0.3, south: 44.7, north: 44.8 });
  expect(region).toEqual({ west: 0, east: 0.5, south: 44.5, north: 45 });
  const winter = seasonalUnits(sliceUnits(source, width, region), width, 'december');
  const summer = seasonalUnits(source, width, 'june');
  expect(Array.from(winter.positions)).toEqual([0.25, 44.75, 0.25, 44.75]);
  expect(winter.people).toEqual(new Float32Array([0.25, 0.5]));
  expect(winter.ids).toEqual(source.ids);
  expect(summer.positions).toEqual(source.positions);
});
