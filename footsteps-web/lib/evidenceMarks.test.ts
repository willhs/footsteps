import type { EvidenceDoc } from '@/lib/evidence';
import { binDegrees, fadeWindow, marksAt, prepareSites } from './evidenceMarks';

const site = (id: number, lo: number, la: number, oldBP: number, youngBP: number) => ({
  id, n: `s${id}`, la, lo, nd: 1, cal: [oldBP, youngBP] as [number, number], m: 'x', r: -1,
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
