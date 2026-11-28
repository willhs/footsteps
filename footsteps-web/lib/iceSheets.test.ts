import { pastWaterNote } from './pastWater';
import { ICE, iceBounds, iceEpochAt, iceHoverRow, iceIds, iceMaskAt, iceNote, iceOverlayPixels, iceParam, iceShareAt, ICE_EDGE, ICE_FILL, type IceMask } from './iceSheets';
import { PAST_WATER_SCENARIOS } from './pastWater';

test('on unless ?ice=0', () => {
  expect(iceParam('')).toBe(true);
  expect(iceParam('?year=-3000&ice=1')).toBe(true);
  expect(iceParam('?ice=0')).toBe(false);
});

test('a year shows its nearest 2.5 ka epoch (calendar BP from 1950), with no gaps, and nothing before 80 ka', () => {
  expect(iceEpochAt(-20000)?.bp).toBe(22500); // 21,950 BP
  expect(iceEpochAt(-25000)?.bp).toBe(27500);
  expect(iceEpochAt(-15000)?.bp).toBe(17500);
  expect(iceEpochAt(-10000)?.bp).toBe(12500);
  expect(iceEpochAt(1900)?.bp).toBe(0);
  expect(iceEpochAt(-79299)?.bp).toBe(80000);
  expect(iceEpochAt(-79300)).toBeNull();
  for (let year = -79299; year <= 1900; year += 97) expect(iceEpochAt(year)).not.toBeNull();
  const sorted = [...ICE.epochs].sort((a, b) => a.from_year - b.from_year);
  sorted.slice(1).forEach((e, i) => expect(e.from_year).toBe(sorted[i].to_year + 1));
});

test('ice patch ids are unique, fit a byte and never clash with a past-water epoch', () => {
  const ids = ICE.epochs.flatMap((e) => e.patches.map((p) => p.id));
  expect(new Set(ids).size).toBe(ids.length);
  expect(Math.max(...ids)).toBeLessThan(256);
  const water = PAST_WATER_SCENARIOS.flatMap((s) => s.epochs.map((e) => e.id));
  expect(ids.some((id) => water.includes(id))).toBe(false);
  expect(iceIds(-20000)).toEqual(iceEpochAt(-20000)!.patches.map((p) => p.id));
  expect(iceIds(-90000)).toEqual([]);
});

test('25,000 to 10,000 BCE has every region drawn', () => {
  for (let year = -25000; year <= -10000; year += 1000) {
    expect(new Set(iceEpochAt(year)!.patches.map((p) => p.region))).toEqual(new Set(['Eurasia', 'North_America', 'Patagonia']));
  }
});

// a 4 x 3 patch at column 100, row 200 of the 2.5′ grid: ice in the left two columns
const mask: IceMask = { id: 150, region: 'Eurasia', x0: 100, y0: 200, width: 4, height: 3, wet: Uint8Array.from([1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]) };
const deg = 360 / 8640;
const centre = (x: number, y: number): [number, number] => [-180 + (x + 0.5) * deg, 90 - (y + 0.5) * deg];

test('ice share is bilinear on the 2.5′ grid and zero off the patches', () => {
  expect(iceShareAt([mask], ...centre(100, 201))).toBeCloseTo(1);
  expect(iceShareAt([mask], ...centre(103, 201))).toBe(0);
  const [lonA, lat] = centre(101, 201);
  const [lonB] = centre(102, 201);
  expect(iceShareAt([mask], (lonA + lonB) / 2, lat)).toBeCloseTo(0.5);
  expect(iceShareAt([mask], 0, 0)).toBe(0);
  expect(iceMaskAt([mask], ...centre(101, 202))).toBe(mask);
  expect(iceMaskAt([mask], ...centre(102, 202))).toBeNull();
});

test('the overlay is white inside, a solid edge line along the margin, and clear off the ice', () => {
  const big: IceMask = { ...mask, width: 9, height: 9, wet: Uint8Array.from({ length: 81 }, (_, i) => (i % 9 < 7 ? 1 : 0)) };
  const px = iceOverlayPixels(big);
  const at = (x: number, y: number) => Array.from(px.slice((y * 9 + x) * 4, (y * 9 + x) * 4 + 4));
  expect(at(0, 4)).toEqual([...ICE_FILL]); // 6 pixels from open ground
  expect(at(6, 4)).toEqual([...ICE_EDGE]); // beside it
  expect(at(5, 4)).toEqual([...ICE_EDGE]); // two pixels in
  expect(at(4, 4)).toEqual([...ICE_FILL]);
  expect(at(7, 4)).toEqual([0, 0, 0, 0]);
  expect(iceBounds(mask)).toEqual([-180 + 100 * deg, 90 - 203 * deg, -180 + 104 * deg, 90 - 200 * deg]);
});

test('the hover line names the source, the epoch and the region\'s basis', () => {
  const row = iceHoverRow(iceEpochAt(-20000)!, 'Eurasia');
  expect(row.text).toBe('Ice sheet (PaleoMIST 1.0, 22.5 ka)');
  expect(row.detail).toContain('DATED-1, most credible');
  expect(iceHoverRow(iceEpochAt(-15000)!, 'North_America').text).toBe('Ice sheet (PaleoMIST 1.0, 17.5 ka)');
});

test('the note names the epoch, says what the groups did, and is honest about Dots and Grid; none before 80 ka', () => {
  expect(iceNote(-20000, 'units', { groups: 0, people: 0 })!.label).toBe('Ice sheets: PaleoMIST 1.0, 22.5 ka · groups kept off the ice');
  expect(iceNote(-20000, 'units', { groups: 3, people: 40 })!.label).toContain('3 groups unplaced');
  expect(iceNote(-20000, 'units', { groups: 3, people: 40 })!.title).toContain('still counted in the totals');
  expect(iceNote(-20000, 'dots', undefined)!.label).toContain('not applied to Dots');
  expect(iceNote(-20000, 'grid', undefined)!.title).toContain('places nobody');
  expect(iceNote(-20000, 'units', undefined)!.title).toContain('not being kept off the ice yet');
  expect(iceNote(-90000, 'units', undefined)).toBeNull(); // no reconstruction before 80 ka: no note
  expect(iceNote(-20000, 'units', { groups: 0, people: 0 })!.title).toContain('CC BY 4.0');
});

describe('iceNote and pastWaterNote blame only their own layer', () => {
  it('counts the ice and the water groups apart', () => {
    const u = { groups: 10, people: 500, ice: { groups: 7, people: 300 }, water: { groups: 4, people: 250 } };
    const ice = iceNote(-20000, 'units', u);
    expect(ice?.label).toContain('7 groups unplaced');
    const water = pastWaterNote(-20000, 'units', u);
    expect(water?.label).toContain('4 groups unplaced');
  });
});
