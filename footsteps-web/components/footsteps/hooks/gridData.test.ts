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

// Modelled years are 720 × 360 images; the decoder shares each cell's people
// among 6 × 6 sub-cells so they sit on the same 4320-wide cell grid as HYDE.
test('upsamples a modelled 0.5° cell to 36 cells of the HYDE grid, keeping its people', async () => {
  const level = 700;
  const w = 720;
  const h = 360;
  const pixels = new Uint8ClampedArray(w * h * 4);
  const cell = 100 * w + 400; // row 100, column 400
  pixels[cell * 4] = level >> 8;
  pixels[cell * 4 + 1] = level & 255;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() });
  global.createImageBitmap = jest.fn().mockResolvedValue({ width: w, height: h, close() {} });
  global.OffscreenCanvas = class {
    getContext() {
      return { drawImage() {}, getImageData: () => ({ data: pixels }) };
    }
  } as unknown as typeof OffscreenCanvas;

  const grid = await decodeYearGrid(-50000);
  expect(grid.data.cellDeg).toBeCloseTo(360 / 4320);
  expect(grid.data.length).toBe(36);
  expect(Math.round(grid.glow.width)).toBe(4320);
  expect(Array.from(grid.data.cellIds)).toEqual(
    Array.from({ length: 36 }, (_, k) => (600 + Math.floor(k / 6)) * 4320 + 2400 + (k % 6)),
  );
  const original = Math.expm1((level / 1023) * Math.log1p(5_000_000));
  expect(Math.abs(grid.data.total / original - 1)).toBeLessThan(0.02);
});
