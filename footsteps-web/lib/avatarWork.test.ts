import { LOOPS, routineWork, workFor, workPose, workWeight, type Loop, type WorkQuery } from './avatarWork';

const q = (over: Partial<WorkQuery>): WorkQuery => ({ role: 'farmer', year: 0, region: 'europe', female: false, roll: 0.5, ...over });

describe('work by role', () => {
  it('gives each role its tool and loop', () => {
    expect(workFor(q({ role: 'toolmaker' }))).toEqual({ tool: 'hammerstone', loop: 'knap' });
    expect(workFor(q({ role: 'herder' }))).toEqual({ tool: 'crook', loop: 'herd' });
    expect(workFor(q({ role: 'hunter' }))).toEqual({ tool: 'spear', loop: 'hold' });
    expect(workFor(q({ role: 'weaver' }))).toEqual({ tool: 'spindle', loop: 'spin' });
    expect(workFor(q({ role: 'fire-keeper' }))).toEqual({ tool: 'torch', loop: 'hold' });
    expect(workFor(q({ role: 'young child' })).tool).toBe('none');
  });

  it('gates tools by era: no pot before pottery, no spindle before ~7000 BCE', () => {
    expect(workFor(q({ role: 'potter', year: -8000 })).tool).toBe('basket');
    expect(workFor(q({ role: 'potter', year: -8000, region: 'east-asia' })).tool).toBe('pot');
    expect(workFor(q({ role: 'potter', year: -5000 })).tool).toBe('pot');
    expect(workFor(q({ role: 'weaver', year: -9000 })).tool).toBe('basket');
    expect(workFor(q({ role: 'milker', year: -9000 })).tool).toBe('basket');
  });

  it('farmers reap, grind or dig', () => {
    const loops = new Set([0.1, 0.5, 0.9].map((roll) => workFor(q({ roll })).loop));
    expect(loops).toEqual(new Set(['reap', 'grind', 'dig']));
  });
});

describe('with the routine', () => {
  it('follows the state where it maps cleanly', () => {
    expect(routineWork({ activity: 'asleep' }, q({}))).toEqual({ tool: 'none', loop: 'doze' });
    expect(routineWork({ activity: 'playing' }, q({ role: 'child' })).loop).toBe('play');
    expect(routineWork({ activity: 'hearth' }, q({ role: 'toolmaker' }))).toEqual(workFor(q({ role: 'toolmaker' })));
    const trip = { activity: 'trip', trip: 'hunting', distance: 100, legSeconds: 10, dist: 2000, bearing: 0 } as const;
    expect(routineWork({ ...trip, leg: 'there' }, q({ role: 'hunter' }))).toEqual({ tool: 'spear', loop: 'hold' });
    expect(routineWork({ ...trip, leg: 'out' }, q({ role: 'hunter' }))).toEqual({ tool: 'spear', loop: 'walk' });
    expect(routineWork({ ...trip, trip: 'herding', leg: 'there' }, q({})).loop).toBe('herd');
  });
});

describe('keyframes', () => {
  it('stay within a joint-safe range and only name the rig bones', () => {
    const rig = new Set(['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r']);
    for (const loop of Object.keys(LOOPS) as Loop[])
      for (let t = 0; t < 6; t += 0.13)
        for (const turn of workPose(loop, t)) {
          expect(rig.has(turn.bone)).toBe(true);
          expect(Math.abs(turn.angle)).toBeLessThanOrEqual(2.5);
        }
  });

  it('moves while working (a loop, not a pose)', () => {
    for (const loop of ['knap', 'grind', 'spin', 'dig', 'reap', 'scrape'] as Loop[]) {
      const sum = (t: number) => workPose(loop, t).reduce((a, x) => a + x.angle, 0);
      expect(new Set([0.1, 0.4, 0.7, 1.0].map((t) => sum(t).toFixed(3))).size).toBeGreaterThan(1);
    }
  });

  it('alternates work and rest, deterministically', () => {
    const ws = Array.from({ length: 600 }, (_, i) => workWeight('knap', 42, i * 0.1));
    expect(ws.some((w) => w === 1)).toBe(true);
    expect(ws.some((w) => w === 0)).toBe(true);
    expect(ws.every((w) => w >= 0 && w <= 1)).toBe(true);
    expect(workWeight('knap', 42, 17.3)).toBe(workWeight('knap', 42, 17.3));
    expect(workWeight('hold', 42, 17.3)).toBe(1);
  });
});
