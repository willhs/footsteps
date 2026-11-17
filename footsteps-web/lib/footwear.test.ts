import { FOOT, FOOTWEAR, footwearFor } from './footwear';
import { UnitKind } from '@/components/footsteps/layers/units';

const person = (over: Partial<Parameters<typeof footwearFor>[0]>) =>
  footwearFor({ year: 1500, lat: 30, lon: 31, kind: UnitKind.Village, age: 30, roll: 0.1, ...over });

describe('footwear', () => {
  it('names one kind per shape the shader draws', () => {
    expect(FOOTWEAR).toHaveLength(Object.keys(FOOT).length);
  });

  it('draws everyone barefoot before ~40,000 years ago, and small children always', () => {
    expect(person({ year: -50_000, lat: 55, roll: 0.1 })).toBe(FOOT.barefoot);
    expect(person({ age: 2, lat: 60 })).toBe(FOOT.barefoot);
  });

  it('covers feet in cold country: hide wraps for Ice Age foragers, shoes for later Eurasian villagers', () => {
    expect(person({ year: -20_000, lat: 50, lon: 10, kind: UnitKind.Band })).toBe(FOOT.wraps);
    expect(person({ year: 1200, lat: 50, lon: 10, kind: UnitKind.Village })).toBe(FOOT.shoes);
    expect(person({ year: 1200, lat: 50, lon: -100, kind: UnitKind.Village })).toBe(FOOT.wraps);
  });

  it('keeps warm-country foragers mostly barefoot and gives farmers a mix after Fort Rock', () => {
    expect(person({ lat: 5, kind: UnitKind.Band, roll: 0.5 })).toBe(FOOT.barefoot);
    expect(person({ year: -12_000, lat: 30, kind: UnitKind.Village, roll: 0.1 })).toBe(FOOT.barefoot);
    expect(person({ year: -3000, lat: 30, roll: 0.3 })).toBe(FOOT.sandals);
    expect(person({ year: -3000, lat: 30, roll: 0.9 })).toBe(FOOT.barefoot);
  });

  it('gives a place a mix, not one kind for everyone', () => {
    const kinds = new Set(Array.from({ length: 50 }, (_, i) => person({ roll: i / 50 })));
    expect(kinds.size).toBeGreaterThan(1);
  });
});
