import { CLOUD_MPS, COVER_EASE_PER_S, GUST_MPS, advanceWeather, cloudCover, newWeatherClock, weatherFor, weatherParam, windToward } from './weather';

test('?weather=1 turns the weather on, nothing else does', () => {
  expect(weatherParam('')).toBe(false);
  expect(weatherParam('?weather=0')).toBe(false);
  expect(weatherParam('?ground=1')).toBe(false);
  expect(weatherParam('?weather=1')).toBe(true);
  expect(weatherParam('?year=-3000&weather=1&zoom=13')).toBe(true);
});

test('cloud cover rises with rainfall: arid places mostly clear, wet ones cloudier', () => {
  const nile = cloudCover(60); // Egypt, a few tens of mm
  const pampas = cloudCover(900);
  const britain = cloudCover(1000);
  const rainforest = cloudCover(3000);
  expect(nile).toBeLessThan(0.2);
  expect(britain).toBeGreaterThan(0.55);
  expect(britain).toBeGreaterThan(nile + 0.4);
  expect(rainforest).toBeGreaterThan(britain);
  expect(pampas).toBeGreaterThan(nile);
  expect(pampas).toBeLessThanOrEqual(britain);
});

test('cloud cover never falls below a few clouds or above a few gaps, and never goes backwards as rain grows', () => {
  expect(cloudCover(0)).toBeCloseTo(0.05, 6);
  expect(cloudCover(1e6)).toBeLessThanOrEqual(0.85 + 1e-9);
  let last = -1;
  for (let mm = 0; mm <= 6000; mm += 50) {
    const c = cloudCover(mm);
    expect(c).toBeGreaterThanOrEqual(last);
    last = c;
  }
});

test('a cell with no climate gets a mild middle cover, and a negative or non-finite one never breaks the range', () => {
  expect(cloudCover(null)).toBe(0.3);
  expect(cloudCover(NaN)).toBe(0.3);
  expect(cloudCover(-50)).toBeCloseTo(0.05, 6);
});

test('the wind follows the belts: easterly trades, westerlies in mid-latitudes, easterly polar, toward the pole with the westerlies', () => {
  const [tx, ty] = windToward(10); // trades, north
  expect(tx).toBeLessThan(-0.9);
  expect(ty).toBeLessThan(0); // toward the equator
  const [wx, wy] = windToward(50); // westerlies, north
  expect(wx).toBeGreaterThan(0.9);
  expect(wy).toBeGreaterThan(0); // toward the pole
  const [sx, sy] = windToward(-50); // westerlies, south: toward the south pole
  expect(sx).toBeGreaterThan(0.9);
  expect(sy).toBeLessThan(0);
  const [px] = windToward(85); // polar easterlies
  expect(px).toBeLessThan(0);
});

test('the wind is always a unit vector, even at the belt boundary and the poles', () => {
  for (let lat = -90; lat <= 90; lat += 1) {
    const [x, y] = windToward(lat);
    expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
  }
});

test('the weather of a place joins its rainfall and latitude', () => {
  const britain = weatherFor(1000, 54);
  const nile = weatherFor(60, 25.7);
  expect(britain.cover).toBeGreaterThan(nile.cover);
  expect(britain.wind[0]).toBeGreaterThan(0); // westerly at 54°N
  expect(nile.wind[0]).toBeLessThan(0); // trades at 25.7°N
});

test('the clock takes the first target at once, then eases cover and carries the patterns along the wind', () => {
  const clock = newWeatherClock();
  const east = { cover: 0.2, wind: [1, 0] as [number, number] };
  advanceWeather(clock, east, 100, false);
  expect(clock.cover).toBe(0.2);
  expect(clock.cloud).toEqual([0, 0]);
  advanceWeather(clock, { ...east, cover: 0.8 }, 102, false); // 2 s later, target far above
  expect(clock.cover).toBeCloseTo(0.2 + 2 * COVER_EASE_PER_S, 9);
  expect(clock.cloud[0]).toBeCloseTo(2 * CLOUD_MPS, 9);
  expect(clock.gust[0]).toBeCloseTo(2 * GUST_MPS, 9);
  expect(clock.cloud[1]).toBe(0);
  advanceWeather(clock, { cover: 0.8, wind: [0, 1] }, 103, false); // the wind turns north: the pattern already travelled stays
  expect(clock.cloud[0]).toBeCloseTo(2 * CLOUD_MPS, 9);
  expect(clock.cloud[1]).toBeCloseTo(CLOUD_MPS, 9);
});

test('a still page shows the target cover and never moves, however much time passes', () => {
  const clock = newWeatherClock();
  const target = { cover: 0.6, wind: [1, 0] as [number, number] };
  advanceWeather(clock, target, 5, true);
  advanceWeather(clock, target, 500, true);
  expect(clock.cover).toBe(0.6);
  expect(clock.cloud).toEqual([0, 0]);
  expect(clock.gust).toEqual([0, 0]);
});
