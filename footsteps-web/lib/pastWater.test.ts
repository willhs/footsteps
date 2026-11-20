import { PAST_WATER, NO_EPOCH, lakePlaneFor, lakeShareAt, pastWaterEpoch, pastWaterNote, pastWaterParam, pastWaterTerrainYear, type PastWaterLayers } from './pastWater';

test('the flag is ?pastwater=1 only', () => {
  expect(pastWaterParam('?pastwater=1')).toBe(true);
  expect(pastWaterParam('')).toBe(false);
  expect(pastWaterParam('?pastwater=0')).toBe(false);
  expect(pastWaterParam('?pastwater=true')).toBe(false);
});

test('the epoch is the manifest\'s calendar-BP window: -6000 is inside, -12000 and 0 are controls, ends inclusive', () => {
  expect([PAST_WATER.epochs[0].from_year, PAST_WATER.epochs[0].to_year]).toEqual([1950 - 11_500, 1950 - 5_000]); // -9550, -3050
  expect(pastWaterEpoch(-6000)).toBe(1);
  expect(pastWaterEpoch(-9550)).toBe(1);
  expect(pastWaterEpoch(-3050)).toBe(1);
  expect(pastWaterEpoch(-9551)).toBe(NO_EPOCH);
  expect(pastWaterEpoch(-3049)).toBe(NO_EPOCH);
  expect(pastWaterEpoch(-12000)).toBe(NO_EPOCH);
  expect(pastWaterEpoch(0)).toBe(NO_EPOCH);
});

test('the Earth images repainted under the flag are the manifest\'s years', () => {
  expect(PAST_WATER.terrain.years).toEqual([-9000, -8000, -7000, -6000, -5000, -4000, -3000]);
  expect(pastWaterTerrainYear(-6000)).toBe(true);
  expect(pastWaterTerrainYear(-12000)).toBe(false);
  expect(pastWaterTerrainYear(-10000)).toBe(false);
});

const layers: PastWaterLayers = {
  lake: { x0: 100, y0: 50, width: 2, height: 2, wet: Uint8Array.of(1, 1, 0, 0) },
  water: { x0: 0, y0: 0, width: 1, height: 1, code: Uint8Array.of(0) },
};
// the centre of pixel (col, row) of the 8640 × 4320 world grid
const centre = (col: number, row: number): [number, number] => [-180 + ((col + 0.5) / 8640) * 360, 90 - ((row + 0.5) / 4320) * 180];

test('lake share is bilinear on the 2.5′ grid and zero outside the patch', () => {
  expect(lakeShareAt(layers.lake, ...centre(100, 50))).toBeCloseTo(1);
  expect(lakeShareAt(layers.lake, ...centre(100, 51))).toBeCloseTo(0);
  const [lon, lat] = centre(100, 50);
  expect(lakeShareAt(layers.lake, lon, lat - 90 / 4320 / 1)).toBeCloseTo(0.5, 1); // half way between the wet row and the dry one
  expect(lakeShareAt(layers.lake, ...centre(5000, 3000))).toBe(0);
});

test('the lake plane exists only in the epoch, at the manifest level, wet where at least half is lake', () => {
  expect(lakePlaneFor(null, -6000)).toBeNull();
  expect(lakePlaneFor(layers, -12000)).toBeNull();
  expect(lakePlaneFor(layers, 0)).toBeNull();
  const plane = lakePlaneFor(layers, -6000)!;
  expect(plane.level).toBe(329);
  expect(plane.wetAt(...centre(100, 50))).toBe(true);
  expect(plane.wetAt(...centre(101, 51))).toBe(false);
  expect(plane.key).toContain(PAST_WATER.digest);
});

test('the control years say the scenario is inactive and the geography unknown, not dry', () => {
  for (const year of [-12000, 0]) {
    const note = pastWaterNote(year, 'units', undefined);
    expect(note.label).toMatch(/inactive/);
    expect(note.label).toMatch(/unknown/);
    expect(note.title).toMatch(/not dry lakebed/);
  }
});

test('in the epoch the note names the model, its datum and dates, and reports what could not be placed', () => {
  const none = pastWaterNote(-6000, 'units', { groups: 0, people: 0 });
  expect(none.title).toContain('329 m');
  expect(none.title).toMatch(/geoid/);
  expect(none.title).toMatch(/fresh/);
  expect(none.title).toContain('11.5–5 ka BP');
  expect(none.title).toMatch(/none is in the lake/);
  const some = pastWaterNote(-6000, 'units', { groups: 12, people: 3400 });
  expect(some.label).toContain('12 groups unplaced');
  expect(some.title).toContain('3,400 people');
  expect(some.title).toMatch(/still counted in the totals/);
});

test('Dots says the experimental model does not apply there; Grid says it places nobody', () => {
  expect(pastWaterNote(-6000, 'dots', undefined).label).toMatch(/not applied to Dots/);
  expect(pastWaterNote(-6000, 'dots', undefined).title).toMatch(/static archive/);
  expect(pastWaterNote(-12000, 'dots', undefined).label).toMatch(/not applied to Dots/);
  expect(pastWaterNote(-6000, 'grid', undefined).title).toMatch(/places nobody/);
});

test('with the model not running the note does not claim groups are kept dry', () => {
  expect(pastWaterNote(-6000, 'units', undefined).title).toMatch(/not being kept out of the lake/);
});
