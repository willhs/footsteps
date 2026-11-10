import { hairStylesFrom } from './Portrait';
import { atlasKey } from '../hooks/useAnthropology';

describe('portrait atlas mapping', () => {
  it('maps atlas hair phrases to drawable styles', () => {
    expect(hairStylesFrom(['long hair tied back', 'braided hair']).sort()).toEqual(['braid', 'tied']);
    expect(hairStylesFrom(['head covered with a wool cap'])).toEqual(['wrap']);
    expect(hairStylesFrom(['long loose hair'])).toEqual(['long']);
    expect(hairStylesFrom(['something else'])).toEqual([]);
  });

  it('keys records like the API buckets them', () => {
    expect(atlasKey(31.8, 35.5, -8000)).toBe('30,35,-8000');
    expect(atlasKey(31.8, 35.5, -2500)).toBe('30,35,-3000');
    expect(atlasKey(-12, -70, 1850)).toBe('-15,-70,1800');
    expect(atlasKey(50, 10, -30000)).toBe('50,10,-10000'); // clamped to the atlas range
    expect(atlasKey(50, 10, 2025)).toBe('50,10,1900');
  });
});

describe('atlas absence phrases', () => {
  it('treats "none recorded" as no body paint', () => {
    const { saysNone } = jest.requireActual('./Portrait');
    expect(saysNone('none recorded')).toBe(true);
    expect(saysNone('No evidence')).toBe(true);
    expect(saysNone(null)).toBe(true);
    expect(saysNone('ochre pigment on face')).toBe(false);
  });
});
