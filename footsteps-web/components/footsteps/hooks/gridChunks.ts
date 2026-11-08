import type { PointBuffers } from './gridData';

// Bound each GPU upload instead of sending millions of points in one call.
export const POINTS_PER_CHUNK = 32_768;
const cache = new WeakMap<PointBuffers, PointBuffers[]>();

export function gridChunks(points: PointBuffers): PointBuffers[] {
  const cached = cache.get(points);
  if (cached) return cached;
  const chunks: PointBuffers[] = [];
  for (let start = 0; start < points.length; start += POINTS_PER_CHUNK) {
    const end = Math.min(start + POINTS_PER_CHUNK, points.length);
    chunks.push({
      length: end - start,
      attributes: {
        getPosition: {
          value: points.attributes.getPosition.value.subarray(
            start * 2,
            end * 2,
          ),
          size: 2,
        },
        getRadius: {
          value: points.attributes.getRadius.value.subarray(start, end),
          size: 1,
        },
        getFillColor: {
          value: points.attributes.getFillColor.value.subarray(
            start * 4,
            end * 4,
          ),
          size: 4,
        },
      },
    });
  }
  cache.set(points, chunks);
  return chunks;
}
