import { readFileSync } from 'fs';
import { join } from 'path';
import { OTHER_HUMANS, kaToYear, lastSeenLabel, otherHumansAt, presenceAt, siteAgeLabel } from './otherHumans';
import { facing, siteActive } from '@/components/footsteps/hooks/useOtherHumansLayer';

jest.mock('@deck.gl/layers', () => ({}));

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

  it('keeps the table sane: closed ranges in bounds, sites dated old to young, sources given', () => {
    for (const h of OTHER_HUMANS) {
      expect(h.lastKa.early).toBeGreaterThanOrEqual(h.lastKa.central);
      expect(h.lastKa.central).toBeGreaterThanOrEqual(h.lastKa.late);
      expect(h.source).not.toBe('');
      for (const r of h.ranges) {
        expect(r.polygon.length).toBeGreaterThanOrEqual(3);
        for (const [lon, lat] of r.polygon) {
          expect(Math.abs(lon)).toBeLessThanOrEqual(180);
          expect(Math.abs(lat)).toBeLessThanOrEqual(90);
        }
      }
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

describe('globe names', () => {
  it('hides names round the back of the globe', () => {
    expect(facing([30, 47], [40, 42])).toBe(true);
    expect(facing([30, 47], [-120, -10])).toBe(false);
  });
});
