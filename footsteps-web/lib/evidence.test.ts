import { formatYearRange, nearbySites, referenceUrl, type EvidenceDoc } from './evidence';

const doc: EvidenceDoc = {
  meta: { dataset: 'test', licence: 'CC0', caveat: '' },
  sources: [],
  refs: ['Smith 2001. doi:10.1000/abc.def.'],
  sites: [
    // cal BP 12300..11800 = 10350..9850 BCE
    { id: 1, n: 'Near', la: 31.0, lo: 35.0, nd: 3, cal: [12300, 11800], m: 'AMS', r: 0 },
    { id: 2, n: 'Nearer', la: 31.1, lo: 35.0, nd: 1, cal: [12100, 12000], m: 'AMS', r: -1 },
    { id: 3, n: 'Wrong time', la: 31.0, lo: 35.0, nd: 1, cal: [5000, 4900], m: 'AMS', r: -1 },
    { id: 4, n: 'Far', la: 40.0, lo: 35.0, nd: 1, cal: [12100, 12000], m: 'AMS', r: -1 },
  ],
};

test('lists nearby sites in the time window, nearest first, skipping far or wrong-era ones', () => {
  const r = nearbySites(doc, 31.08, 35.0, -10150);
  expect(r.map((s) => s.name)).toEqual(['Nearer', 'Near']);
  expect(r[1].fromYear).toBe(-10350);
  expect(r[1].reference).toContain('Smith');
});

test('no sites when the window misses them', () => {
  expect(nearbySites(doc, 31.08, 35.0, 1000)).toEqual([]);
});

test('year ranges and doi links', () => {
  expect(formatYearRange(-10350, -9850)).toBe('10,350–9,850 BCE');
  expect(formatYearRange(-40, 100)).toBe('40 BCE – 100 CE');
  expect(referenceUrl(doc.refs[0])).toBe('https://doi.org/10.1000/abc.def');
  expect(referenceUrl('no doi here')).toBeNull();
});
