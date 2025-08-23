import { getFillColor, COLOR_SCHEMES } from './color';

describe('getFillColor', () => {
  it('returns white color based on population by default', () => {
    expect(getFillColor({ properties: { population: 25000 } })).toEqual([
      255, 255, 255, 240,
    ]);
    expect(getFillColor({ properties: { population: 6000 } })).toEqual([
      240, 240, 240, 220,
    ]);
    expect(getFillColor({ properties: { population: 1500 } })).toEqual([
      220, 220, 220, 200,
    ]);
    expect(getFillColor({ properties: { population: 500 } })).toEqual([
      200, 200, 200, 180,
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

  it('returns violet color scheme when specified', () => {
    expect(getFillColor({ properties: { population: 25000 } }, undefined, 'violet')).toEqual([
      138, 43, 226, 240,
    ]);
    expect(getFillColor({ properties: { population: 500 } }, undefined, 'violet')).toEqual([
      180, 140, 240, 180,
    ]);
  });

  it('returns black color scheme when specified', () => {
    expect(getFillColor({ properties: { population: 25000 } }, undefined, 'black')).toEqual([
      0, 0, 0, 240,
    ]);
    expect(getFillColor({ properties: { population: 500 } }, undefined, 'black')).toEqual([
      120, 120, 120, 180,
    ]);
  });

  it('applies debug tint to white scheme', () => {
    const color = getFillColor(
      { properties: { population: 1500 } },
      [10, 20, 30],
      'white'
    );
    expect(color).toEqual([230, 240, 250, 200]);
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
