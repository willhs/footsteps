import { getFillColor } from './color';

describe('getFillColor', () => {
  it('returns base color based on population', () => {
    expect(getFillColor({ properties: { population: 25000 } })).toEqual([
      255, 100, 0, 240,
    ]);
    expect(getFillColor({ properties: { population: 6000 } })).toEqual([
      255, 140, 0, 220,
    ]);
    expect(getFillColor({ properties: { population: 1500 } })).toEqual([
      255, 180, 0, 200,
    ]);
    expect(getFillColor({ properties: { population: 500 } })).toEqual([
      255, 200, 100, 180,
    ]);
  });

  it('applies debug tint', () => {
    const color = getFillColor(
      { properties: { population: 1500 } },
      [10, 20, 30],
    );
    expect(color).toEqual([255, 200, 30, 200]);
  });
});
