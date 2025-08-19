import { createLayerId, createOnTileLoadHandler } from './tileCache';
import { radiusStrategies } from './radiusStrategies';

describe('createLayerId', () => {
  it('returns provided instance id', () => {
    const id = createLayerId(2020, radiusStrategies.linear, 'instance');
    expect(id).toBe('instance');
  });

  it('generates unique ids when instance id not provided', () => {
    const id1 = createLayerId(2020, radiusStrategies.linear);
    const id2 = createLayerId(2020, radiusStrategies.linear);
    expect(id1).not.toBe(id2);
    expect(id1).toContain('human-tiles-2020-single-linear');
  });
});

describe('createOnTileLoadHandler', () => {
  it('patches byteLength and forwards call', () => {
    const extra = jest.fn();
    const handler = createOnTileLoadHandler(extra);
    const tile: { content?: unknown } = { content: { foo: 'bar' } };
    handler(tile);
    expect(
      (tile.content as { byteLength?: number }).byteLength,
    ).toBeGreaterThan(0);
    expect(extra).toHaveBeenCalledWith(tile);
  });
});
