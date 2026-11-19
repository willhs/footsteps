import { gaitAt, gaitSeed, newestPrint } from './gait';

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
