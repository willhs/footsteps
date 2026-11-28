import { MAX_SHADOW_PER_M, sunShadowAt } from './sunShadow';
import { dialInstant } from './timeOfDay';

describe('shadows from the sun clock', () => {
  it('fall away from the sun: north-west in a northern morning, north-east in the afternoon, short at noon', () => {
    const [lon, lat] = [10, 50];
    const morning = sunShadowAt(lon, lat, dialInstant(9, lon, lat));
    const noon = sunShadowAt(lon, lat, dialInstant(12, lon, lat));
    const afternoon = sunShadowAt(lon, lat, dialInstant(15, lon, lat));
    expect(morning.east).toBeLessThan(0);
    expect(morning.north).toBeGreaterThan(0);
    expect(afternoon.east).toBeGreaterThan(0);
    expect(noon.north).toBeGreaterThan(0);
    expect(Math.abs(noon.east)).toBeLessThan(0.05);
    expect(Math.hypot(noon.east, noon.north)).toBeLessThan(Math.hypot(morning.east, morning.north));
    expect(noon.strength).toBe(1);
  });

  it('point south in the southern hemisphere at noon', () => {
    const noon = sunShadowAt(150, -35, dialInstant(12, 150, -35));
    expect(noon.north).toBeLessThan(0);
  });

  it('are gone at night and never longer than the cap at a low sun', () => {
    expect(sunShadowAt(10, 50, dialInstant(1, 10, 50)).strength).toBe(0);
    for (let hour = 4; hour <= 20; hour += 0.25) {
      const s = sunShadowAt(10, 50, dialInstant(hour, 10, 50));
      expect(Math.hypot(s.east, s.north)).toBeLessThanOrEqual(MAX_SHADOW_PER_M + 1e-9);
    }
  });
});
