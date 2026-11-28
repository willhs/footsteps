import { PAST_WATER_SCENARIOS, epochLayersFrom, lakePlaneFor, lakeShareAt, pastWaterEpochs, pastWaterNote, pastWaterTerrainYear, type EpochMeta, type PastWaterLayers } from './pastWater';

const scenario = (id: string) => PAST_WATER_SCENARIOS.find((s) => s.id === id)!;

test('three scenarios; every epoch window is calendar BP from 1950 and every id is unique', () => {
  expect(PAST_WATER_SCENARIOS.map((s) => s.id)).toEqual(['mega_chad', 'lgm_europe', 'mesopotamia', 'texcoco']);
  const epochs = PAST_WATER_SCENARIOS.flatMap((s) => s.epochs);
  for (const e of epochs) expect([e.from_year, e.to_year]).toEqual([1950 - e.from_bp, 1950 - e.to_bp]);
  expect(new Set(epochs.map((e) => e.id)).size).toBe(epochs.length);
  expect(scenario('mega_chad').epochs.map((e) => [e.from_year, e.to_year])).toEqual([[-9550, -3050]]);
  expect(scenario('lgm_europe').epochs.map((e) => [e.from_year, e.to_year])).toEqual([[-24550, -17050]]);
  expect(scenario('mesopotamia').epochs.map((e) => [e.from_year, e.to_year])).toEqual([[-6050, -4551], [-4550, -3550], [-2550, -1550]]);
  expect(scenario('texcoco').epochs.map((e) => [e.from_year, e.to_year])).toEqual([[-2050, 1600]]);
});

test.each([
  [-26000, []], [-24550, [2]], [-20000, [2]], [-17050, [2]], [-17049, []], [-12000, []], [-9551, []], [-9550, [1]],
  [-6000, [1, 3]], [-4551, [1, 3]], [-4550, [1, 4]], [-4000, [1, 4]], [-3550, [1, 4]], [-3549, [1]], [-3050, [1]], [-3049, []],
  [-2051, [5]], [-2050, [5, 6]], [-2000, [5, 6]], [-1549, [6]], [0, [6]], [1600, [6]], [1601, []], [1900, []],
])('active epochs at %i: %j (the same table as past_water.active_epochs)', (year, ids) => {
  expect(pastWaterEpochs(year)).toEqual(ids);
});

test('epochs that hold at the same time never reach the same 5′ cell, so a cell sees at most one', () => {
  const reach = 3;
  const region = (e: EpochMeta) => {
    const boxes = [[Math.floor(e.mask.x0 / 2), Math.floor(e.mask.y0 / 2), Math.ceil((e.mask.x0 + e.mask.width) / 2), Math.ceil((e.mask.y0 + e.mask.height) / 2)]];
    if (e.distance) boxes.push([e.distance.x0, e.distance.y0, e.distance.x0 + e.distance.width, e.distance.y0 + e.distance.height]);
    return [Math.min(...boxes.map((b) => b[0])) - reach, Math.min(...boxes.map((b) => b[1])) - reach, Math.max(...boxes.map((b) => b[2])) + reach, Math.max(...boxes.map((b) => b[3])) + reach];
  };
  const epochs = PAST_WATER_SCENARIOS.flatMap((s) => s.epochs);
  for (const a of epochs)
    for (const b of epochs) {
      if (a.id >= b.id || a.to_year < b.from_year || b.to_year < a.from_year) continue;
      const [ax0, ay0, ax1, ay1] = region(a);
      const [bx0, by0, bx1, by1] = region(b);
      expect(ax1 <= bx0 || bx1 <= ax0 || ay1 <= by0 || by1 <= ay0).toBe(true);
    }
});

test('the terrain years are every scenario\'s', () => {
  for (const year of [-24000, -20000, -18000, -9000, -6000, -4000, -3000, -2000]) expect(pastWaterTerrainYear(year)).toBe(true);
  for (const year of [-25000, -17000, -12000, -10000, -1000, 0]) expect(pastWaterTerrainYear(year)).toBe(false);
});

// the centre of pixel (col, row) of the 8640 × 4320 world grid
const centre = (col: number, row: number): [number, number] => [-180 + ((col + 0.5) / 8640) * 360, 90 - ((row + 0.5) / 4320) * 180];
const rgba = (width: number, height: number, px: [number, number, number][]) => ({ width, height, data: Uint8ClampedArray.from(px.flatMap(([r, g, b]) => [r, g, b, 255])) });
/** Three test epochs, patch for patch like the real ones but tiny: Mega-Chad (plane 329), the LGM (a level per pixel), Mesopotamia ~6 ka (sea). */
function testLayers(): PastWaterLayers {
  const meta = (id: number) => PAST_WATER_SCENARIOS.flatMap((s) => s.epochs).find((e) => e.id === id)!;
  const at = (e: EpochMeta, x0: number, y0: number): EpochMeta => ({ ...e, mask: { ...e.mask, x0, y0, width: 2, height: 2 }, distance: null });
  const lvl = (m: number): [number, number, number] => [255, (m + 32768) >> 8, (m + 32768) & 255];
  return {
    epochs: [
      epochLayersFrom(at(meta(1), 100, 50), rgba(2, 2, [[255, 255, 255], [255, 255, 255], [0, 0, 0], [0, 0, 0]]), null),
      epochLayersFrom(at(meta(2), 300, 50), rgba(2, 2, [lvl(9), lvl(-263), [0, 0, 0], [0, 0, 0]]), null),
      epochLayersFrom(at(meta(4), 500, 50), rgba(2, 2, [[255, 255, 255], [255, 255, 255], [0, 0, 0], [0, 0, 0]]), null),
    ],
  };
}

test('lake share is bilinear on the 2.5′ grid and zero outside the patch', () => {
  const lake = testLayers().epochs[0].lake;
  expect(lakeShareAt(lake, ...centre(100, 50))).toBeCloseTo(1);
  expect(lakeShareAt(lake, ...centre(100, 51))).toBeCloseTo(0);
  const [lon, lat] = centre(100, 50);
  expect(lakeShareAt(lake, lon, lat - 90 / 4320)).toBeCloseTo(0.5, 1); // half way between the wet row and the dry one
  expect(lakeShareAt(lake, ...centre(5000, 3000))).toBe(0);
});

test('a mask whose level is per pixel decodes green and blue as metres; others carry none', () => {
  const layers = testLayers();
  expect(Array.from(layers.epochs[1].lake.level!.slice(0, 2))).toEqual([9, -263]);
  expect(layers.epochs[0].lake.level).toBeUndefined();
  expect(() => epochLayersFrom(PAST_WATER_SCENARIOS[0].epochs[0], rgba(1, 1, [[0, 0, 0]]), null)).toThrow(/do not match/);
});

test('the water exists only in its epochs, at each epoch\'s own level', () => {
  const layers = testLayers();
  expect(lakePlaneFor(null, -6000, 0)).toBeNull();
  expect(lakePlaneFor(layers, -12000, -60)).toBeNull();
  expect(lakePlaneFor(layers, 0, 0)).toBeNull();
  // -4000: Mega-Chad (329 m, only below its plane) and Mesopotamia's ~6 ka bay (the year's sea)
  const plane = lakePlaneFor(layers, -4000, -2.5)!;
  expect(plane.levelAt(...centre(100, 50), 300)).toBe(329);
  expect(plane.levelAt(...centre(100, 50), 340)).toBeNull(); // in the mask but above the plane: shore
  expect(plane.levelAt(...centre(101, 51), 300)).toBeNull();
  expect(plane.levelAt(...centre(500, 50), 6)).toBe(-2.5); // the bay stands at the sea, over the later delta's 6 m
  expect(plane.levelAt(...centre(300, 50), 0)).toBeNull(); // the LGM is not active at -4000
  expect(plane.key).toContain(scenario('mega_chad').digest);
  expect(plane.key).not.toBe(lakePlaneFor(layers, -4000, -3)!.key); // a marine epoch's water follows the sea
  // -20000: the LGM lakes, each at its own level, wherever its outline is
  const lgm = lakePlaneFor(layers, -20000, -120)!;
  expect(lgm.levelAt(...centre(300, 50), 500)).toBe(9);
  expect(lgm.levelAt(...centre(301, 50), -500)).toBe(-263);
  expect(lgm.levelAt(...centre(100, 50), 0)).toBeNull();
});

test('outside every window there is no note (the scenarios say nothing there)', () => {
  for (const year of [-26000, -12000, -2700, 1700]) { // -2700: after Mega-Chad and the ~6 ka stage, before the ~4 ka one; 1700: after the Basin of Mexico's
    expect(pastWaterEpochs(year)).toEqual([]);
    expect(pastWaterNote(year, 'units', undefined)).toBeNull();
    expect(pastWaterNote(year, 'dots', undefined)).toBeNull();
  }
});

test('in an epoch the note names the scenarios, their datum and dates, and reports what could not be placed', () => {
  const none = pastWaterNote(-6000, 'units', { groups: 0, people: 0 })!;
  expect(none.label).toContain('Mega-Chad lake, 11.5–5 ka BP');
  expect(none.label).toContain('Mesopotamian coast');
  expect(none.title).toContain('329 m');
  expect(none.title).toMatch(/geoid/);
  expect(none.title).toMatch(/fresh/);
  expect(none.title).toMatch(/interpreted/);
  expect(none.title).toMatch(/none is in modelled water/);
  const some = pastWaterNote(-20000, 'units', { groups: 12, people: 3400 })!;
  expect(some.label).toContain('LGM lakes and rivers, 26.5–19 ka BP');
  expect(some.label).toContain('12 groups unplaced');
  expect(some.title).toContain('3,400 people');
  expect(some.title).toMatch(/still counted in the totals/);
  expect(some.title).toMatch(/No Black Sea/);
});

test('Dots says the experimental model does not apply there; Grid says it places nobody', () => {
  expect(pastWaterNote(-6000, 'dots', undefined)!.label).toMatch(/not applied to Dots/);
  expect(pastWaterNote(-6000, 'dots', undefined)!.title).toMatch(/static archive/);
  expect(pastWaterNote(-6000, 'grid', undefined)!.title).toMatch(/places nobody/);
});

test('with the model not running the note does not claim groups are kept dry', () => {
  expect(pastWaterNote(-6000, 'units', undefined)!.title).toMatch(/not being kept out of the modelled water/);
});

test('a finer shore decides the close-up water on its own: flat at its level, on its own grid, whatever the ground', () => {
  const tex = PAST_WATER_SCENARIOS.flatMap((s) => s.epochs).find((e) => e.id === 6)!;
  expect(tex.shore?.scale).toBe(20);
  const e: EpochMeta = { ...tex, mask: { ...tex.mask, x0: 700, y0: 50, width: 2, height: 2 }, distance: null, shore: { ...tex.shore!, x0: 14000, y0: 1000, width: 2, height: 1, m: 2250 } };
  const layers = { epochs: [epochLayersFrom(e, rgba(2, 2, [[255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255]]), null, rgba(2, 1, [[255, 255, 255], [0, 0, 0]]))] };
  const fine = (col: number, row: number): [number, number] => [-180 + ((col + 0.5) / (8640 * 20)) * 360, 90 - ((row + 0.5) / (4320 * 20)) * 180];
  const plane = lakePlaneFor(layers, 1000, 0)!;
  expect(plane.levelAt(...fine(14000, 1000), 2235)).toBe(2250);
  expect(plane.levelAt(...fine(14000, 1000), 2290)).toBe(2250); // a building or fill in the lake is water, not a fragment
  expect(plane.levelAt(...fine(14001, 1000), 2235)).toBeNull(); // dry on the shore grid, though wet on the coarse mask
  expect(() => epochLayersFrom(e, rgba(2, 2, Array(4).fill([255, 255, 255])), null, rgba(1, 1, [[0, 0, 0]]))).toThrow(/shore/);
});
