import { gaitAt, gaitSeed, newestPrint, routineGaitAt } from './gait';
import type { DayPlan } from './routine';

// These pin the TS port to the `gait` GLSL in components/footsteps/layers/people.ts. If you change
// either, change both and re-pin: a name tag stands where the shader draws the newest print.
describe('gaitAt', () => {
  const at = (h: number, clock: number, k = 0) => gaitAt(h, clock, k);

  it('pins a few values', () => {
    // A walker (h >= 0.7) mid-stride: the newest print and the two behind it are one step apart.
    const walker = [0, 1, 2].map((k) => at(0.75, 0, k));
    expect(walker[0]).toMatchObject({ moving: true, alpha: 1 });
    expect(walker[0].x).toBeCloseTo(8.5474, 3);
    expect(walker[0].y).toBeCloseTo(-6.5939, 3);
    expect(walker[1].alpha).toBeCloseTo(0.6856, 3);
    expect(walker[2].alpha).toBeCloseTo(0.1657, 3);
    // Another walker, later on the clock; and one who has stopped (both feet together).
    expect(at(0.93, 12.5).x).toBeCloseTo(-14.1282, 3);
    expect(at(0.93, 12.5).y).toBeCloseTo(10.3699, 3);
    expect(at(0.93, 61.3)).toMatchObject({ moving: false, alpha: 1 });
    expect(at(0.93, 61.3).x).toBeCloseTo(-1.3547, 3);
    expect(at(0.93, 61.3).y).toBeCloseTo(-12.6412, 3);
    // A stander (h < 0.7) stays within a couple of metres of their spot.
    expect(at(0.1, 0).x).toBeCloseTo(-1.9875, 3);
    expect(at(0.1, 0).y).toBeCloseTo(-1.5761, 3);
  });

  it('keeps standing people close and walkers within their loop', () => {
    for (let i = 0; i < 400; i++) {
      const h = i / 400;
      for (let clock = 0; clock < 300; clock += 7.3) {
        const g = at(h, clock);
        const limit = h < 0.7 ? 2.5 * 1.6 : 24 * 1.5; // reach * the sin/cos mix, with room
        expect(Math.hypot(g.x, g.y)).toBeLessThanOrEqual(limit);
        expect(Math.hypot(g.dirX, g.dirY)).toBeCloseTo(1, 6);
      }
    }
  });

  it('moves continuously: a step is under a metre and a half, and never jumps', () => {
    for (const h of [0.75, 0.8, 0.93, 0.99]) {
      let prev = at(h, 0);
      for (let clock = 0.05; clock < 120; clock += 0.05) {
        const g = at(h, clock);
        // The newest print hops to the next foot placement at each step: 0.7 m ahead, plus the bend.
        expect(Math.hypot(g.x - prev.x, g.y - prev.y)).toBeLessThan(1.5);
        prev = g;
      }
    }
  });

  it('shows two feet while standing and three prints while walking', () => {
    expect([0, 1, 2].map((k) => at(0.93, 61.3, k).alpha)).toEqual([1, 1, 0]);
    expect(at(0.93, 61.3, 0)).toMatchObject({ x: at(0.93, 61.3, 1).x, y: at(0.93, 61.3, 1).y });
    expect(at(0.75, 0, 0).alpha).toBeGreaterThan(at(0.75, 0, 1).alpha);
    expect(at(0.75, 0, 1).alpha).toBeGreaterThan(at(0.75, 0, 2).alpha);
  });
});

describe('gaitSeed', () => {
  it('is a stable float32 in [0, 1) for a place', () => {
    const h = gaitSeed(31.131, 30.8885);
    expect(h).toBe(gaitSeed(31.131, 30.8885));
    expect(h).toBeCloseTo(0.1147, 3);
    expect(Math.fround(h)).toBe(h);
    for (let i = 0; i < 500; i++) {
      const s = gaitSeed(i * 0.37 - 90, i * 0.11 - 30);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
  });

  it('gives a spread of walkers and standers (about three in ten walk)', () => {
    let walkers = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (gaitSeed(30 + i * 0.00031, 31 + i * 0.00017) >= 0.7) walkers++;
    expect(walkers / n).toBeGreaterThan(0.2);
    expect(walkers / n).toBeLessThan(0.4);
  });
});

describe('newestPrint', () => {
  it('turns metres into degrees at the person latitude', () => {
    const [lon, lat] = newestPrint([31, 60], 0.75, 0);
    // 8.5474 m east and -6.5939 m north; at 60°N a degree of longitude is half as long.
    expect(lat).toBeCloseTo(60 - 6.5939 / 111_320, 8);
    expect(lon).toBeCloseTo(31 + 8.5474 / (111_320 * Math.cos(Math.PI / 3)), 8);
  });
});

// The routine's styles, pinned to the shader's (people.ts `gait`: style 1 asleep, 2 playing, 3 working away, and
// the transit branch). Hours are local sun hours; the plan below wakes at 5, bed at 21, is out 8 to 14.
describe('routineGaitAt', () => {
  const trip = (bearing = 0): DayPlan => ({
    wake: 5,
    bed: 21,
    from: 8,
    to: 14,
    away: { kind: 'trip', trip: 'gathering', dist: 2000, bearing },
    lonHours: 0,
  });
  const play: DayPlan = { wake: 5, bed: 21, from: 6, to: 19.5, away: { kind: 'play' }, lonHours: 0 };

  it('is the old gait at the hearth', () => {
    for (const h of [0.1, 0.75, 0.93]) expect(routineGaitAt(trip(), h, 12.5, 7)).toEqual(gaitAt(h, 12.5, 0));
  });

  it('keeps the sleeper on the spot with both feet together, whoever they are', () => {
    for (const h of [0.1, 0.75, 0.93]) {
      const feet = [0, 1, 2].map((k) => routineGaitAt(trip(), h, 40 + k, 2, k));
      expect(feet.map((g) => g.alpha)).toEqual([1, 1, 0]);
      expect(feet.every((g) => !g.moving)).toBe(true);
      // The same place whatever the clock: no stepping while asleep, and within a couple of metres of the spot.
      const later = routineGaitAt(trip(), h, 4321, 2);
      expect(later.x).toBeCloseTo(feet[0].x, 9);
      expect(later.y).toBeCloseTo(feet[0].y, 9);
      expect(Math.hypot(later.x, later.y)).toBeLessThan(2.5 * 1.6);
    }
  });

  it('walks a straight road at 1.2 m/s on the way out: prints 0.7 m apart along the bearing', () => {
    // 8:00 + 10 s: 10 s * 1.2 m/s = 12 m walked, 17 steps of 0.7/1.2 s taken; the newest print is at (17 + 0.5) * 0.7 m.
    const hour = 8 + 10 / 3600;
    const g = [0, 1, 2].map((k) => routineGaitAt(trip(0), 0.4, 99, hour, k));
    expect(g[0].x).toBeCloseTo(12.25, 6);
    expect(g[1].x).toBeCloseTo(11.55, 6);
    expect(g[2].x).toBeCloseTo(10.85, 6);
    expect(g.every((q) => Math.abs(q.y) < 1e-9 && q.moving && q.dirX === 1 && q.dirY === 0)).toBe(true);
    // Turn the road north-east and the prints follow it.
    const ne = routineGaitAt(trip(Math.PI / 4), 0.4, 99, hour, 0);
    expect(ne.x).toBeCloseTo(12.25 * Math.SQRT1_2, 6);
    expect(ne.y).toBeCloseTo(12.25 * Math.SQRT1_2, 6);
  });

  it('walks the same road back, facing home, and arrives at the spot', () => {
    // 14:00 is the end; the walk takes 2000 / 1.2 s = 1666.7 s, so 14 h - that is the start of the way back.
    const backStart = 14 - 2000 / 1.2 / 3600;
    const first = routineGaitAt(trip(0), 0.4, 0, backStart + 0.5 / 3600, 0);
    expect(first.x).toBeCloseTo(2000 - 0.35 - 0.7 * Math.floor(0.5 / (0.7 / 1.2)), 6);
    expect(first.dirX).toBe(-1);
    const nearHome = routineGaitAt(trip(0), 0.4, 0, 13.9999, 0);
    expect(nearHome.x).toBeLessThan(3);
    expect(nearHome.x).toBeGreaterThanOrEqual(0);
  });

  it('never jumps along the road: each print moves by one step or less between frames', () => {
    let prev = routineGaitAt(trip(1), 0.4, 0, 8, 0);
    for (let sec = 0.1; sec < 1600; sec += 0.1) {
      const g = routineGaitAt(trip(1), 0.4, 0, 8 + sec / 3600, 0);
      expect(Math.hypot(g.x - prev.x, g.y - prev.y)).toBeLessThanOrEqual(0.7 + 1e-6);
      prev = g;
    }
  });

  it('works in a small loop at the far end of the trip, 2 km out', () => {
    for (const h of [0.1, 0.75, 0.93]) {
      for (let clock = 0; clock < 200; clock += 11.3) {
        const g = routineGaitAt(trip(0), h, clock, 11);
        expect(Math.hypot(g.x - 2000, g.y)).toBeLessThanOrEqual(12 * 1.6);
      }
    }
  });

  it('has children playing on the move, over a wide loop', () => {
    let moving = 0;
    let samples = 0;
    for (const h of [0.1, 0.3, 0.5, 0.75]) {
      for (let clock = 0; clock < 300; clock += 1.7) {
        const g = routineGaitAt(play, h, clock, 10);
        samples++;
        if (g.moving) moving++;
        expect(Math.hypot(g.x, g.y)).toBeLessThanOrEqual(24 * 1.6);
      }
    }
    // Even a child who would stand when idle plays (moving between a half and nine in ten of the time).
    expect(moving / samples).toBeGreaterThan(0.45);
    expect(moving / samples).toBeLessThan(0.95);
    // Before the play window opens they are at the hearth, as ever.
    expect(routineGaitAt(play, 0.1, 5, 5.5)).toEqual(gaitAt(0.1, 5, 0));
  });
});

describe('newestPrint with a routine', () => {
  it('puts the print on the road, in degrees', () => {
    const plan: DayPlan = { wake: 5, bed: 21, from: 8, to: 14, away: { kind: 'trip', trip: 'hunting', dist: 5000, bearing: Math.PI / 2 }, lonHours: 0 };
    // Noon: at the far end, 5 km due north (plus a few metres of working about).
    const [lon, lat] = newestPrint([20, -24], 0.4, 100, { plan, localHour: 12 });
    expect(lat - -24).toBeCloseTo(5000 / 111_320, 3);
    expect(Math.abs(lon - 20)).toBeLessThan(0.0005);
  });
});
