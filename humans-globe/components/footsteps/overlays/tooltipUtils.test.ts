import { getTooltipPosition, formatCoordinates } from './tooltipUtils';
import { getPopulationScale } from '@/lib/format';

describe('getTooltipPosition', () => {
  it('positions tooltip to the left when near the right edge', () => {
    const pos = getTooltipPosition(
      { x: 390, y: 150 },
      { innerWidth: 400, innerHeight: 300 },
    );
    expect(pos.left).toBe(390 - 260 - 16);
  });

  it('positions tooltip below the cursor when near the top edge', () => {
    const pos = getTooltipPosition(
      { x: 200, y: 20 },
      { innerWidth: 400, innerHeight: 300 },
    );
    expect(pos.top).toBe(20 + 16);
  });

  it('clamps tooltip within viewport on small screens', () => {
    const pos = getTooltipPosition(
      { x: 190, y: 110 },
      { innerWidth: 200, innerHeight: 120 },
    );
    expect(pos.left).toBe(16);
    expect(pos.top).toBe(120 - 100 - 16);
  });
});

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
