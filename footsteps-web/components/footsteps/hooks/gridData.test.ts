import { decodeYearGrid, gridUrl } from './gridData';

// Pins the browser side of the encoding in footstep-generator/grid_image.py
// (tests/test_grid_image.py checks the same levels): level 0 is empty, level q
// is expm1(q / 1023 * log1p(5e6)) people, R is the high byte and G the low byte.
test('decodes population levels exactly as grid_image.py defines them', async () => {
  const levels = [0, 1, 512, 1023];
  const pixels = levels.flatMap((q) => [q >> 8, q & 255, 0, 255]);
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() });
  global.fetch = fetchMock;
  global.createImageBitmap = jest
    .fn()
    .mockResolvedValue({ width: 4, height: 1, close() {} });
  global.OffscreenCanvas = class {
    getContext() {
      return {
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
      };
    }
  } as unknown as typeof OffscreenCanvas;

  const grid = await decodeYearGrid(-1000);
  expect(fetchMock).toHaveBeenCalledWith('/grid/humans_-1000.webp');
  expect(grid.data.length).toBe(3); // the level-0 cell has no people
  expect(Array.from(grid.data.cellIds)).toEqual([1, 2, 3]);
  const logMax = Math.log1p(5_000_000);
  const expected = [1, 512, 1023].map((q) => Math.expm1((q / 1023) * logMax));
  expect(Array.from(grid.data.people)).toEqual(Array.from(new Float32Array(expected)));
  expect(grid.data.people[2]).toBeCloseTo(5_000_000, -1);
  expect(grid.data.total).toBeCloseTo(expected.reduce((a, b) => a + b), 6);
});

test('serves population from WebP', () => {
  expect(gridUrl(-1000)).toBe('/grid/humans_-1000.webp');
});
