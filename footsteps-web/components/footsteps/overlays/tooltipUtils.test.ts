import { formatCoordinates } from './tooltipUtils';
import { getPopulationScale } from '@/lib/format';

describe('getPopulationScale', () => {
  it('returns correct scale labels for population thresholds', () => {
    const cases = [
      [1500000, 'Megacity'],
      [600000, 'Metropolis'],
      [150000, 'City'],
      [60000, 'Large Town'],
      [20000, 'Town'],
      [5000, 'Village'],
      [1000, 'Hamlet'],
      [100, 'Outpost'],
    ] as const;

    cases.forEach(([pop, label]) => {
      expect(getPopulationScale(pop).scale).toBe(label);
    });
  });
});

describe('formatCoordinates', () => {
  it('formats latitude and longitude with cardinal directions', () => {
    expect(formatCoordinates([30.1234, -25.5678])).toBe('25.57°S, 30.12°E');
    expect(formatCoordinates([-45.6789, 20.1234])).toBe('20.12°N, 45.68°W');
  });
});
