import { featuresFromTile, aggregateTileMetrics } from './tileMetrics';

describe('tile metrics helpers', () => {
  it('extracts features from nested tile structures', () => {
    const tile = { data: { features: [{ properties: { population: 1 } }] } };
    expect(featuresFromTile(tile)).toHaveLength(1);
  });

  it('aggregates count and population across tiles', () => {
    const tiles = [
      {
        data: {
          features: [
            { properties: { population: 2 } },
            { properties: { population: 3 } },
          ],
        },
      },
      { content: { features: [{ properties: { population: 5 } }] } },
    ];
    const result = aggregateTileMetrics(tiles);
    expect(result).toEqual({ count: 3, population: 10 });
  });
});
