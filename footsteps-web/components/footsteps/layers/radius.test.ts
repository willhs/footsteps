import { getBaseRadiusFromPopulation, getPointRadius } from './radius';
import { radiusStrategies } from './radiusStrategies';

describe('getBaseRadiusFromPopulation', () => {
  it('maps population ranges to expected radii', () => {
    expect(getBaseRadiusFromPopulation(2_000_000)).toBe(60000);
    expect(getBaseRadiusFromPopulation(150_000)).toBe(40000);
    expect(getBaseRadiusFromPopulation(60_000)).toBe(25000);
    expect(getBaseRadiusFromPopulation(25_000)).toBe(15000);
    expect(getBaseRadiusFromPopulation(10_000)).toBe(8000);
    expect(getBaseRadiusFromPopulation(2_000)).toBe(4000);
    expect(getBaseRadiusFromPopulation(500)).toBe(2000);
    expect(getBaseRadiusFromPopulation(50)).toBe(1000);
  });
});

describe('getPointRadius', () => {
  const feature = { properties: { population: 2_000 } };
  it('uses linear strategy without scaling', () => {
    const radius = getPointRadius(feature, 5, radiusStrategies.linear);
    expect(radius).toBe(4000);
  });
  it('applies zoom-adaptive strategy scaling', () => {
    const radius = getPointRadius(feature, 2, radiusStrategies.zoomAdaptive);
    // zoom 2 -> multiplier 6 according to strategy
    expect(radius).toBe(4000 * 6);
  });
});
