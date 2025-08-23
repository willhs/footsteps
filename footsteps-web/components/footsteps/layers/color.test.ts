import { getFillColor, COLOR_SCHEMES } from './color';

describe('getFillColor', () => {
  it('returns orange color based on population by default', () => {
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

  it('returns cyan color scheme when specified', () => {
    expect(getFillColor({ properties: { population: 25000 } }, undefined, 'cyan')).toEqual([
      0, 255, 255, 240,
    ]);
    expect(getFillColor({ properties: { population: 6000 } }, undefined, 'cyan')).toEqual([
      0, 220, 255, 220,
    ]);
    expect(getFillColor({ properties: { population: 1500 } }, undefined, 'cyan')).toEqual([
      0, 180, 255, 200,
    ]);
    expect(getFillColor({ properties: { population: 500 } }, undefined, 'cyan')).toEqual([
      100, 200, 255, 180,
    ]);
  });

  it('returns white color scheme when specified', () => {
    expect(getFillColor({ properties: { population: 25000 } }, undefined, 'white')).toEqual([
      255, 255, 255, 240,
    ]);
    expect(getFillColor({ properties: { population: 500 } }, undefined, 'white')).toEqual([
      200, 200, 200, 180,
    ]);
  });

  it('applies debug tint to orange scheme', () => {
    const color = getFillColor(
      { properties: { population: 1500 } },
      [10, 20, 30],
      'orange'
    );
    expect(color).toEqual([255, 200, 30, 200]);
  });

  it('applies debug tint to cyan scheme', () => {
    const color = getFillColor(
      { properties: { population: 1500 } },
      [10, 20, 30],
      'cyan'
    );
    expect(color).toEqual([10, 200, 255, 200]);
  });
});
