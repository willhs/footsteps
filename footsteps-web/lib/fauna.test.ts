import { blockKey, faunaCell, notableAnimals, presentAt, type FaunaBlock, type Species } from './fauna';

const sp = (common: string, kg: number, role: Species['role'] = 'herd'): Species => ({ common, kg, role, extinct: false });

describe('fauna cells', () => {
  test('cell ids run from 90N, 180W; blocks are 30°', () => {
    expect(faunaCell(-179.5, 89.5)).toBe(0);
    expect(faunaCell(100.2, 65.4)).toBe(24 * 360 + 280);
    expect(faunaCell(0, -61)).toBe(151 * 360 + 180);
    expect(faunaCell(0, -91)).toBeNull();
    expect(blockKey(24 * 360 + 280)).toBe('0_9');
    expect(blockKey(151 * 360 + 180)).toBe('5_6');
  });
});

describe('presentAt', () => {
  const block: FaunaBlock = { c: { 7: [0, 3, 1, 0] }, i: { 7: [5] } };
  test('a species shows from its first step on, and nothing shows under ice', () => {
    expect(presentAt(block, 7, 4)).toEqual([0, 1]);
    expect(presentAt(block, 7, 2)).toEqual([1]);
    expect(presentAt(block, 7, 5)).toEqual([]);
    expect(presentAt(block, 8, 1)).toEqual([]);
  });
});

describe('notableAnimals', () => {
  const species = [sp('Woolly mammoth', 6000), sp('Reindeer', 100), sp('Wolf', 40, 'predator'), sp('Cave lion', 300, 'predator'), sp('Woolly rhino', 2000), sp('Saiga', 40), sp('Reindeer', 90)];
  test('three biggest plant eaters plus the biggest predator, biggest first, each name once', () => {
    expect(notableAnimals(species, [0, 1, 2, 3, 4, 5, 6])).toEqual(['woolly mammoth', 'woolly rhino', 'cave lion', 'reindeer']);
  });
  test('short lists are filled and capped', () => {
    expect(notableAnimals(species, [2, 3])).toEqual(['cave lion', 'wolf']);
    expect(notableAnimals(species, [])).toEqual([]);
  });
});
