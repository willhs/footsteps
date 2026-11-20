// Ages from modelled life-course profiles (research 0006, recommendation 6), tested through real people.
jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import { describePerson, peopleForGroups, type GroupInView } from './people';
import { UnitKind } from './units';
import { ageStructureFor, farmingOnsetYear, sampleLivingAge, type AgeStructureId } from '@/lib/demography';

const band: GroupInView = { lon: 35.5, lat: 32.1, kind: UnitKind.Band, people: 31 };
const PROFILES: Record<'forager' | 'early_farmer' | 'agrarian' | 'urban', number[]> = {
  forager: [0.14, 0.24, 0.26, 0.24, 0.12],
  early_farmer: [0.18, 0.27, 0.25, 0.21, 0.09],
  agrarian: [0.15, 0.24, 0.25, 0.24, 0.12],
  urban: [0.13, 0.2, 0.32, 0.25, 0.1],
};

/** Many independent groups of 150, so the ages are plenty without being one place's people. */
function manyPeople(ageStructure: AgeStructureId, groups = 500) {
  const out = [];
  for (let k = 0; k < groups; k++) {
    out.push(...peopleForGroups([{ lon: (k % 40) * 0.37 - 7, lat: Math.floor(k / 40) * 1.9 - 20, kind: UnitKind.Village, people: 150, ageStructure }], 1500));
  }
  return out;
}
const bin = (age: number) => (age < 5 ? 0 : age < 15 ? 1 : age < 30 ? 2 : age < 50 ? 3 : 4);

describe('age sampling from life-course profiles', () => {
  it('repeats exactly for a fixed group and profile', () => {
    const ages = (g: GroupInView) => peopleForGroups([g], 1500).map((p) => p.age);
    expect(ages({ ...band, people: 150 })).toEqual(ages({ ...band, people: 150 }));
  });

  it.each(Object.entries(PROFILES))('%s: five-bin frequencies match the profile over many non-anchor people', (name, shares) => {
    const people = manyPeople(name as AgeStructureId);
    // The first person of each group is the adult display anchor: left out of the statistics.
    const sample = people.filter((p) => p.id % 150 !== 0);
    const counts = [0, 0, 0, 0, 0];
    for (const p of sample) counts[bin(p.age)]++;
    expect(sample.length).toBeGreaterThan(70_000);
    shares.forEach((expected, b) => expect(Math.abs(counts[b] / sample.length - expected)).toBeLessThan(0.008));
  });

  it('still allows 80 and over, rarely, and never past 100 or below 0', () => {
    const ages = manyPeople('forager').map((p) => p.age);
    const old = ages.filter((a) => a >= 80).length;
    expect(old).toBeGreaterThan(300); // ~1% of ~75,000
    expect(old / ages.length).toBeLessThan(0.02);
    expect(Math.max(...ages)).toBeLessThanOrEqual(100);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(0);
    // a declining tail, not flat: far more people of 50-59 than of 80-89
    const decade = (lo: number) => ages.filter((a) => a >= lo && a < lo + 10).length;
    expect(decade(50)).toBeGreaterThan(3 * decade(80));
  });

  it('puts the band edges at 5, 15, 30 and 50 for the forager shares', () => {
    const e = 1e-6;
    // shares 0.14 / 0.24 / 0.26 / 0.24 / 0.12: cumulative edges at 0.14, 0.38, 0.64, 0.88
    expect([sampleLivingAge('forager', 0.14 - e, 0.9999), sampleLivingAge('forager', 0.14 + e, 0)]).toEqual([4, 5]);
    expect([sampleLivingAge('forager', 0.38 - e, 0.9999), sampleLivingAge('forager', 0.38 + e, 0)]).toEqual([14, 15]);
    expect([sampleLivingAge('forager', 0.64 - e, 0.9999), sampleLivingAge('forager', 0.64 + e, 0)]).toEqual([29, 30]);
    expect([sampleLivingAge('forager', 0.88 - e, 0.9999), sampleLivingAge('forager', 0.88 + e, 0)]).toEqual([49, 50]);
    expect(sampleLivingAge('forager', 0.9999, 0.9999999)).toBe(100);
  });

  it('leaves ids, places, sex and gait as they are when the profile changes', () => {
    const group = { ...band, people: 150 };
    const as = (ageStructure: AgeStructureId) => peopleForGroups([{ ...group, ageStructure }], 1500);
    const a = as('forager');
    const b = as('early_farmer');
    const c = as('generic');
    const frame = (people: ReturnType<typeof as>) => people.map((p) => [p.id, ...p.position, p.female, p.gait]);
    expect(frame(b)).toEqual(frame(a));
    expect(frame(c)).toEqual(frame(a));
    expect(b.map((p) => p.age)).not.toEqual(a.map((p) => p.age));
    // and the same holds for people two groups in, where a shifting stream would show first
    const two = (ageStructure: AgeStructureId) =>
      peopleForGroups([{ ...group, ageStructure }, { ...group, lon: 36.1, ageStructure }], 1500).map((p) => [p.id, ...p.position, p.female]);
    expect(two('agrarian')).toEqual(two('urban'));
  });

  it('keeps an adult first in every group, whatever the profile', () => {
    for (const name of Object.keys(PROFILES) as AgeStructureId[]) {
      for (let k = 0; k < 100; k++) {
        const first = peopleForGroups([{ lon: k / 7, lat: 10, kind: UnitKind.Band, people: 15, ageStructure: name }])[0];
        expect(first.age).toBeGreaterThanOrEqual(18);
      }
    }
  });

  it('draws a quantile once: a younger profile never makes the same person older within a band edge', () => {
    // Person i's two draws are the same under every profile, so moving from forager to early farmer
    // (more children, fewer old) can only move someone to a younger or equal band, never an older one.
    const a = manyPeople('forager', 60);
    const b = manyPeople('early_farmer', 60);
    expect(a.filter((p, i) => p.id % 150 !== 0 && bin(b[i].age) > bin(p.age))).toEqual([]);
  });
});

describe('which age structure a group gets', () => {
  const levant = { lon: 35.5, lat: 32.1 };
  it('gives bands the forager profile whatever the year', () => {
    expect([-50000, -8000, 1900].map((y) => ageStructureFor(UnitKind.Band, levant.lon, levant.lat, y))).toEqual(['forager', 'forager', 'forager']);
  });
  it('gives villages early farmers for 2,000 years after crops reach their region, then agrarian', () => {
    const onset = farmingOnsetYear(levant.lon, levant.lat)!;
    expect(onset).toBeLessThan(-6000); // the Levant is among the first places: the model says so, not a calendar cut-off
    const at = (y: number) => ageStructureFor(UnitKind.Village, levant.lon, levant.lat, y);
    expect([at(onset), at(onset + 1999), at(onset + 2000), at(1900)]).toEqual(['early_farmer', 'early_farmer', 'agrarian', 'agrarian']);
    // another region, later onset: its villages are early farmers at a date the Levant's are already agrarian
    const britain = { lon: -1.5, lat: 52 };
    const lateOnset = farmingOnsetYear(britain.lon, britain.lat)!;
    expect(lateOnset).toBeGreaterThan(onset + 2000);
    const y = onset + 3000;
    expect([ageStructureFor(UnitKind.Village, levant.lon, levant.lat, y), ageStructureFor(UnitKind.Village, britain.lon, britain.lat, lateOnset + 100)]).toEqual(['agrarian', 'early_farmer']);
  });
  it('falls back to agrarian where the food model has no crop, and to the generic guess for herders', () => {
    expect(farmingOnsetYear(-100, 75)).toBeUndefined(); // Greenland ice
    expect(ageStructureFor(UnitKind.Village, -100, 75, -5000)).toBe('agrarian');
    expect(ageStructureFor(UnitKind.Camp, levant.lon, levant.lat, -3000)).toBe('generic');
  });
  it('is chosen per group in peopleForGroups, from its kind, place and year', () => {
    const early = peopleForGroups([{ ...levant, kind: UnitKind.Village, people: 300 }], -7000);
    const late = peopleForGroups([{ ...levant, kind: UnitKind.Village, people: 300 }], 1500);
    expect([early[0].ageStructure, late[0].ageStructure]).toEqual(['early_farmer', 'agrarian']);
    expect(peopleForGroups([band], -9000)[0].ageStructure).toBe('forager');
  });
});

describe('the person card', () => {
  it('says the age structure is modelled and the person speculative, and which scenario it used', () => {
    const forager = describePerson(peopleForGroups([band])[0]);
    expect(forager.detail).toContain('Age drawn from the forager scenario. Modelled age structure; individual speculative.');
    const herder = describePerson(peopleForGroups([{ ...band, kind: UnitKind.Camp, people: 60 }])[0]);
    expect(herder.detail).toContain('generic pre-modern guess; herders have no profile yet. Modelled age structure; individual speculative.');
  });
});
