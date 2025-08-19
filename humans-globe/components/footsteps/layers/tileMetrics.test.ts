import { featuresFromTile, aggregateTileMetrics } from './tileMetrics';

describe('tile metrics helpers', () => {
  it('extracts features from nested tile structures', () => {
    const tile = {
      data: {
        layers: {
          humans: {
            length: 1,
            positions: new Float32Array([0, 0]),
            properties: [{ population: 1 }],
          },
        },
      },
    };
    expect(featuresFromTile(tile)).toHaveLength(1);
  });

  it('aggregates count and population across tiles', () => {
    const tiles = [
      {
        data: {
          layers: {
            humans: {
              length: 2,
              positions: new Float32Array([0, 0, 1, 1]),
              properties: [{ population: 2 }, { population: 3 }],
            },
          },
        },
      },
      {
        data: {
          layers: {
            humans: {
              length: 1,
              positions: new Float32Array([2, 2]),
              properties: [{ population: 5 }],
            },
          },
        },
      },
    ];
    const result = aggregateTileMetrics(tiles);
    expect(result).toEqual({ count: 3, population: 10 });
  });
});
