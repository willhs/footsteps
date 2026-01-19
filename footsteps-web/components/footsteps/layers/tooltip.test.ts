import { buildTooltipData, type PickingInfo } from './tooltip';

describe('buildTooltipData', () => {
  it('returns tooltip data when object exists', () => {
    const info: PickingInfo = {
      object: {
        properties: { population: 123 },
      },
      coordinate: [1, 2],
      x: 10,
      y: 20,
      // Required deck.gl PickingInfo fields
      color: null,
      layer: null,
      index: 0,
      picked: true,
      pixelRatio: 1,
    };
    const result = buildTooltipData(info, 1500);
    expect(result).toEqual({
      population: 123,
      coordinates: [1, 2],
      year: 1500,
      clickPosition: { x: 10, y: 20 },
    });
  });

  it('returns null when no object', () => {
    const info: PickingInfo = {
      x: 1,
      y: 2,
      // Required deck.gl PickingInfo fields
      color: null,
      layer: null,
      index: -1,
      picked: false,
      pixelRatio: 1,
    };
    expect(buildTooltipData(info, 1500)).toBeNull();
  });

  it('extracts population from nested feature objects', () => {
    const info: PickingInfo = {
      object: {
        feature: {
          properties: { population: '456.7' },
          geometry: { coordinates: [3, 4] },
        },
      },
      coordinate: undefined,
      x: 30,
      y: 40,
      color: null,
      layer: null,
      index: 0,
      picked: true,
      pixelRatio: 1,
    } as unknown as PickingInfo;

    expect(buildTooltipData(info, 900)).toEqual({
      population: 456.7,
      coordinates: [3, 4],
      year: 900,
      clickPosition: { x: 30, y: 40 },
    });
  });
});
