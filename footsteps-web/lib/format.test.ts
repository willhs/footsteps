import { formatPopulation } from './format';

describe('formatPopulation', () => {
  it('keeps two significant figures below ten of a unit', () => {
    expect(formatPopulation(4_600_000)).toBe('4.6M people');
    expect(formatPopulation(5_000_000)).toBe('5M people');
    expect(formatPopulation(14_200_000)).toBe('14M people');
    expect(formatPopulation(1_234_000_000)).toBe('1.2B people');
    expect(formatPopulation(9_980)).toBe('10K people');
    expect(formatPopulation(812)).toBe('812 people');
  });
});
