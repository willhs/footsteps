import { readFileSync } from 'fs';
import { join } from 'path';
import { OTHER_HUMANS, kaToYear, lastSeenLabel, otherHumansAt, presenceAt, siteAgeLabel } from './otherHumans';
import { bandShare, siteActive } from '@/components/footsteps/hooks/useOtherHumansLayer';
import { bandStepKa, bandsAt, type BandsFile } from './otherHumanBands';

jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));

const byId = (id: string) => OTHER_HUMANS.find((h) => h.id === id)!;

describe('other kinds of human', () => {
  it('all four are present when the slider starts and gone by 30,000 BCE', () => {
    expect(otherHumansAt(-100000).map((d) => d.human.id)).toEqual([
      'neanderthals',
      'denisovans',
      'floresiensis',
      'luzonensis',
    ]);
    expect(otherHumansAt(-30000)).toEqual([]);
    expect(otherHumansAt(1900)).toEqual([]);
  });

  it('fades each one out between its earliest and latest last date', () => {
    const n = byId('neanderthals');
    expect(presenceAt(n, kaToYear(41))).toBe(1);
    expect(presenceAt(n, kaToYear(40))).toBeCloseTo(0.5);
    expect(presenceAt(n, kaToYear(39))).toBe(0);
    const d = byId('denisovans');
    expect(presenceAt(d, -50000)).toBeGreaterThan(0);
    expect(presenceAt(d, -50000)).toBeLessThan(1);
  });

  it('keeps the table sane: sites dated old to young, sources given', () => {
    for (const h of OTHER_HUMANS) {
      expect(h.lastKa.early).toBeGreaterThanOrEqual(h.lastKa.central);
      expect(h.lastKa.central).toBeGreaterThanOrEqual(h.lastKa.late);
      expect(h.source).not.toBe('');
      expect(h.sites.length).toBeGreaterThan(0);
      for (const s of h.sites) {
        expect(s.ka[0]).toBeGreaterThanOrEqual(s.ka[1]);
        expect(s.source).not.toBe('');
      }
    }
  });

  it('has every entry checked against a source or says why it could not be', () => {
    const entries = OTHER_HUMANS.flatMap((h) => [h, ...h.sites]);
    expect(OTHER_HUMANS.reduce((n, h) => n + h.sites.length, 0)).toBe(24);
    for (const e of entries) {
      if (e.checked) expect(e).not.toHaveProperty('couldNotVerify');
      else expect(e.couldNotVerify.length).toBeGreaterThan(20);
      expect(e.doi.length).toBeGreaterThan(0);
      for (const d of e.doi) expect(d).toMatch(/^10\.\d{4,9}\/\S+$/);
    }
  });

  it('keeps the species end dates in step with arrivals.yaml other_hominins', () => {
    const yaml = readFileSync(join(__dirname, '../../footstep-generator/prehistory/arrivals.yaml'), 'utf8');
    for (const id of ['neanderthals', 'denisovans', 'floresiensis']) {
      const m = yaml.match(new RegExp(`- id: ${id}\\n(?:.*\\n)*?\\s+last_ka_bp: \\{central: (\\d+), early: (\\d+), late: (\\d+)\\}`));
      expect(m).not.toBeNull();
      expect(byId(id).lastKa).toEqual({ central: Number(m![1]), early: Number(m![2]), late: Number(m![3]) });
    }
  });

  it('marks a site active only around its dates', () => {
    const feldhofer = byId('neanderthals').sites.find((s) => s.name.startsWith('Feldhofer'))!;
    expect(siteActive(feldhofer, kaToYear(40))).toBe(true);
    expect(siteActive(feldhofer, kaToYear(60))).toBe(false);
    const harbin = byId('denisovans').sites.find((s) => s.name.startsWith('Harbin'))!;
    expect(siteActive(harbin, -150000)).toBe(true);
    expect(siteActive(harbin, -100000)).toBe(false);
  });

  it('writes plain labels', () => {
    expect(lastSeenLabel(byId('neanderthals'))).toBe('last seen about 40,000 years ago');
    const harbin = byId('denisovans').sites.find((s) => s.name.startsWith('Harbin'))!;
    expect(siteAgeLabel(harbin)).toBe('at least 146,000 years ago');
    expect(siteAgeLabel(byId('floresiensis').sites[0])).toBe('~100,000–60,000 years ago');
  });
});

describe('guessed bands', () => {
  const file: BandsFile = JSON.parse(readFileSync(join(__dirname, '../public/other_humans/bands.json'), 'utf8'));

  it('has bands for every kind of human, near each guessed number, on the slider span', () => {
    expect(file.first_ka).toBe(100);
    for (const h of OTHER_HUMANS) {
      const { people, bands } = file.species[h.id];
      const target = people / file.band_people;
      for (const ka of [100, 70, h.lastKa.early]) {
        const n = bandsAt(bands, ka, 1).length;
        expect(n).toBeGreaterThan(target * 0.6);
        expect(n).toBeLessThan(target * 1.4);
      }
    }
  });

  it('places Neanderthal bands in western Eurasia and Flores bands on Flores', () => {
    for (const b of bandsAt(file.species.neanderthals.bands, 60, 1)) {
      expect(b.position[0]).toBeGreaterThan(-12);
      expect(b.position[0]).toBeLessThan(92);
      expect(b.position[1]).toBeGreaterThan(28);
    }
    for (const b of bandsAt(file.species.floresiensis.bands, 70, 1)) {
      expect(b.position[0]).toBeGreaterThan(119);
      expect(b.position[0]).toBeLessThan(123.5);
      expect(b.position[1]).toBeLessThan(-7.5);
    }
  });

  it('thins a fading species out band by band', () => {
    const rows = file.species.neanderthals.bands;
    const full = bandsAt(rows, 40, 1);
    const half = bandsAt(rows, 40, 0.5);
    expect(half.length).toBeLessThan(full.length * 0.65);
    expect(half.length).toBeGreaterThan(full.length * 0.35);
    expect(bandsAt(rows, 40, 0)).toEqual([]);
  });

  it('thins bands far out by the same people-per-fire rule as our own people, and shows all close in', () => {
    // 60,000 BCE: our own fires stand for a few hundred people each, so a band of 15 shows a few percent of the time.
    const far = bandShare(15, -60000, 4, 1);
    expect(far).toBeGreaterThan(0.02);
    expect(far).toBeLessThan(0.2);
    expect(bandShare(15, -60000, 2, 1)).toBeLessThan(far);
    expect(bandShare(15, -60000, 6, 0)).toBe(1);
  });

  it('picks the 1 ka step for a year, clamped to the file', () => {
    expect(bandStepKa(file, -100000)).toBe(100);
    expect(bandStepKa(file, kaToYear(41))).toBe(41);
    expect(bandStepKa(file, -10000)).toBe(30);
  });
});
