import { gridChunks } from './gridChunks';
import type { PointBuffers } from './gridData';

test('chunks cover every point with stable zero-copy attribute views', () => {
  const positions = new Float32Array(32769 * 2);
  const radii = new Float32Array(32769);
  const colors = new Uint8ClampedArray(32769 * 4);
  positions.set([17, 23], 32768 * 2);
  radii[32768] = 600;
  colors.set([255, 190, 110, 60], 32768 * 4);
  const points: PointBuffers = {
    length: 32769,
    attributes: {
      getPosition: { value: positions, size: 2 },
      getRadius: { value: radii, size: 1 },
      getFillColor: { value: colors, size: 4 },
    },
  };
  const chunks = gridChunks(points);
  expect(chunks.map((chunk) => chunk.length)).toEqual([32768, 1]);
  expect(Array.from(chunks[1].attributes.getPosition.value)).toEqual([17, 23]);
  expect(Array.from(chunks[1].attributes.getRadius.value)).toEqual([600]);
  expect(Array.from(chunks[1].attributes.getFillColor.value)).toEqual([
    255, 190, 110, 60,
  ]);
  expect(chunks[1].attributes.getPosition.value.buffer).toBe(positions.buffer);
  expect(gridChunks(points)).toBe(chunks);
});
