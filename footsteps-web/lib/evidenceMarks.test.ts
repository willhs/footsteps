import { homininLabel, sampleCaveats } from './aadr';
import type { EvidenceDoc } from '@/lib/evidence';
import {
  binDegrees,
  fadeWindow,
  marksAt,
  prepareSites,
  prepareSamples,
} from './evidenceMarks';

const site = (
  id: number,
  lo: number,
  la: number,
  oldBP: number,
  youngBP: number,
) => ({
  id,
  n: `s${id}`,
  la,
  lo,
  nd: 1,
  cal: [oldBP, youngBP] as [number, number],
  m: 'x',
  r: -1,
});
const doc: EvidenceDoc = {
  meta: { dataset: '', licence: '', caveat: '' },
  sources: [],
  refs: [],
  sites: [
    site(1, 10, 10, 12000, 11000), // 10,050 BCE to 9,050 BCE
    site(2, 10.1, 10.1, 12000, 11000),
    site(3, 100, -20, 5000, 4000),
    { ...site(4, 0, 0, 0, 0), cal: null },
  ],
};
const p = prepareSites(doc);

describe('marksAt', () => {
  it('shows sites whose range covers the year at full strength', () => {
    const m = marksAt(p, -9500, 6);
    expect(m).toHaveLength(2);
    expect(m.every((x) => x.alpha === 1 && x.count === 1)).toBe(true);
  });
  it('fades sites just outside the range and hides distant ones', () => {
    const w = fadeWindow(-10050);
    const m = marksAt(p, -10050 - w / 2, 6);
    expect(m[0].alpha).toBeCloseTo(0.5, 1);
    expect(marksAt(p, -10050 - 2 * w, 6)).toHaveLength(0);
  });
  it('bunches nearby sites when zoomed out and keeps counts', () => {
    const m = marksAt(p, -9500, 2);
    expect(m).toHaveLength(1);
    expect(m[0].count).toBe(2);
    expect(binDegrees(6)).toBe(0);
  });
  it('skips sites without a calibrated range', () => {
    expect(p.from.length).toBe(3);
  });
});

describe('ancient DNA marks', () => {
  const sample = {
    id: 'a',
    la: 50,
    lo: 10,
    dp: 2,
    r: [43000, 41000] as [number, number],
    n: 'Cave',
    c: 'Germany',
    p: 0,
    t: 'd' as const,
  };
  const dna = {
    meta: { dataset: 'AADR', caveat: '' },
    refs: ['Paper'],
    samples: [
      sample,
      { ...sample, id: 'b', lo: 10.01, h: 'neanderthal' as const },
    ],
  };
  it('converts BP ranges and retains individual indices for hover', () => {
    const prepared = prepareSamples(dna);
    expect(marksAt(prepared, -40000, 6).map((m) => [m.site, m.alpha])).toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(prepared.from[0]).toBe(-41050);
    expect(prepared.to[0]).toBe(-39050);
  });
  it('fades and hides DNA at the same boundaries as radiocarbon', () => {
    const prepared = prepareSamples(dna);
    expect(marksAt(prepared, -41550, 6)[0].alpha).toBe(0.5);
    expect(marksAt(prepared, -42050, 6)).toEqual([]);
    expect(marksAt(prepared, -3000, 6)).toEqual([]);
  });
  it('bunches DNA independently and releases individuals when zoomed in', () => {
    const prepared = prepareSamples(dna);
    expect(marksAt(prepared, -40000, 2)).toEqual([
      expect.objectContaining({ count: 2, site: -1 }),
    ]);
    expect(marksAt(prepared, -40000, 6)).toHaveLength(2);
  });
  it('labels every hominin including hybrids and dating uncertainty', () => {
    expect(homininLabel(sample)).toContain('Modern human');
    expect(homininLabel({ ...sample, h: 'neanderthal' })).toBe('Neanderthal');
    expect(homininLabel({ ...sample, h: 'denisovan' })).toBe('Denisovan');
    expect(homininLabel({ ...sample, h: 'neanderthal_denisovan' })).toContain(
      'hybrid',
    );
    expect(
      sampleCaveats({ ...sample, dp: 0, rs: 'conflict' }).join(' '),
    ).toContain('do not trust');
    expect(sampleCaveats({ ...sample, rs: 'mean_sd' }).join(' ')).toContain(
      '2 standard deviations',
    );
  });
});
