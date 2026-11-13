import { HYDE_MIN, TIME_MAX, TIME_MIN } from './time';
import {
  BAR_LABELS,
  FINE_GAIN,
  dragMove,
  dragStart,
  keyStep,
  parseYear,
  posAt,
  stepTime,
  timeAt,
} from './timeScale';

describe('time bar scale', () => {
  it('spans the whole slider range, oldest on the left', () => {
    expect(posAt(TIME_MIN)).toBeCloseTo(0, 9);
    expect(posAt(TIME_MAX)).toBeCloseTo(1, 9);
    expect(timeAt(0)).toBeCloseTo(TIME_MIN, 6);
    expect(timeAt(1)).toBeCloseTo(TIME_MAX, 6);
  });

  it('round-trips and only ever increases', () => {
    let last = -1;
    for (let t = TIME_MIN; t <= TIME_MAX; t += 137) {
      const p = posAt(t);
      expect(p).toBeGreaterThan(last);
      expect(timeAt(p)).toBeCloseTo(t, 4);
      last = p;
    }
  });

  it('compresses the deep past and gives recorded history room', () => {
    // 90,000 years before HYDE share the left part; the ~2,000 CE years still get a good slice.
    expect(posAt(HYDE_MIN)).toBeGreaterThan(0.3);
    expect(posAt(HYDE_MIN)).toBeLessThan(0.45);
    expect(1 - posAt(0)).toBeGreaterThan(0.25);
  });

  it('labels the bar in order inside the range', () => {
    const ps = BAR_LABELS.map((l) => posAt(l.time));
    expect(ps).toEqual([...ps].sort((a, b) => a - b));
    expect(BAR_LABELS.map((l) => l.text)).toContain('10k');
  });
});

describe('arrow-key steps', () => {
  it('lands on round years and moves both ways', () => {
    const up = stepTime(1347, 1, false);
    expect(up).toBeGreaterThan(1347);
    expect(up % keyStep(1347, false)).toBe(0);
    const down = stepTime(up, -1, false);
    expect(down).toBeLessThan(up);
    expect(stepTime(down, 1, false)).toBe(up);
  });

  it('is a few years in recent history and centuries in the deep past', () => {
    expect(keyStep(1500, false)).toBeLessThanOrEqual(20);
    expect(keyStep(-60000, false)).toBeGreaterThanOrEqual(200);
    expect(keyStep(1500, true)).toBe(keyStep(1500, false) * 10);
  });

  it('stops at the ends', () => {
    expect(stepTime(TIME_MAX, 1, true)).toBe(TIME_MAX);
    expect(stepTime(TIME_MIN, -1, true)).toBe(TIME_MIN);
  });
});

describe('typed years', () => {
  it.each([
    ['1347', 1347],
    ['1347 CE', 1347],
    ['AD 800', 800],
    ['800 ad', 800],
    ['-500', -500],
    ['500 BC', -500],
    ['10,000 BCE', -10000],
    ['12k BCE', -12000],
    ['  50000 bce ', -50000],
    ['12000 years ago', 2025 - 12000],
    ['50 ka', 2025 - 50000],
  ])('%s → %d', (text, year) => {
    expect(parseYear(text)).toBe(year);
  });

  it('clamps to the range', () => {
    expect(parseYear('2020')).toBe(TIME_MAX);
    expect(parseYear('200000 BCE')).toBe(TIME_MIN);
  });

  it.each(['', 'soon', '12 34', '-500 BCE', 'AD 12 ago'])('rejects %p', (text) => {
    expect(parseYear(text)).toBeNull();
  });
});

describe('dragging', () => {
  const W = 400;

  it('a quick drag keeps the needle under the finger (rough seek)', () => {
    let d = dragStart(TIME_MIN, 0, 0);
    for (let i = 1; i <= 10; i++) d = dragMove(d, i * 40, i * 16, W, (i * 40) / W);
    expect(d.pos).toBeCloseTo(1, 2);
    expect(timeAt(d.pos)).toBeCloseTo(TIME_MAX, -1);
  });

  it('a slow drag moves the needle a small fraction of the finger', () => {
    const start = posAt(HYDE_MIN);
    let d = dragStart(HYDE_MIN, 100, 0);
    for (let i = 1; i <= 20; i++) d = dragMove(d, 100 + i, i * 50, W, start + i / W);
    const moved = d.pos - start;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan((20 / W) * FINE_GAIN * 1.5);
    // a few years per pixel, not hundreds
    expect(timeAt(d.pos) - HYDE_MIN).toBeLessThan(400);
  });

  it('after fine work, a fast move re-anchors to the finger', () => {
    let d = dragStart(0, 200, 0);
    for (let i = 1; i <= 30; i++) d = dragMove(d, 200 + i, i * 60, W, (200 + i) / W);
    expect(Math.abs(d.pos - 230 / W)).toBeGreaterThan(0.03); // drifted
    for (let i = 1; i <= 6; i++) d = dragMove(d, 230 - i * 30, 1800 + i * 16, W, (230 - i * 30) / W);
    expect(d.pos).toBeCloseTo(50 / W, 2);
  });
});
