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
    const info: PickingInfo = { x: 1, y: 2 };
    expect(buildTooltipData(info, 1500)).toBeNull();
  });
});
