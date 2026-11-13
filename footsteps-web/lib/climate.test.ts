import { seaLevelAt, seaLevelLabel } from './climate';
import { MOMENTS } from './moments';

test('sea level is about 0 today and about -120 m at the glacial maximum', () => {
  expect(Math.abs(seaLevelAt(1900))).toBeLessThan(1);
  expect(seaLevelAt(-18975)).toBeLessThan(-100);
  expect(seaLevelAt(-18975)).toBeGreaterThan(-140);
});

test('labels use a real minus sign', () => {
  expect(seaLevelLabel(-18975)).toMatch(/^sea −1\d\d m$/);
});

test('every moment has a note and source and sits inside the timeline', () => {
  for (const m of MOMENTS) {
    expect(m.note.length).toBeGreaterThan(10);
    expect(m.source.length).toBeGreaterThan(3);
    expect(m.year).toBeGreaterThanOrEqual(-100000);
  }
});
