// The daily routine, tested through real people (peopleForGroups) the way the layer uses them.
jest.mock('@deck.gl/layers', () => ({ ScatterplotLayer: class {} }));
import fs from 'fs';
import path from 'path';
import { peopleForGroups, type Person } from '@/components/footsteps/layers/people';
import { UnitKind } from '@/components/footsteps/layers/units';
import {
  FOOD_GETTING_HOURS,
  TRIPS,
  WALK_MS,
  describeState,
  epochHour,
  localHourAt,
  planAttributes,
  planDay,
  routineLine,
  stateAt,
  styleOf,
  type DayPlan,
  type State,
} from './routine';

// The equinox, so day length is 12 h everywhere and the schedule is the same at every latitude.
const EQUINOX = Date.UTC(2026, 2, 20, 12);
const EPOCH = epochHour(EQUINOX);

/** Many groups at different spots (the seed is the spot), so shares are not one band's luck. */
function crowd(kind: number, lon0: number, lat0: number, groups = 30) {
  const out: Person[] = [];
  for (let i = 0; i < groups; i++) {
    out.push(...peopleForGroups([{ lon: lon0 + i * 0.013, lat: lat0 + (i % 5) * 0.011, kind, people: 150 }], 1500));
  }
  return out;
}
const kalahari = crowd(UnitKind.Band, 21.0, -24.0); // a forager band
const nile = crowd(UnitKind.Village, 31.1, 26.0); // a farming village
const steppe = crowd(UnitKind.Camp, 60.0, 47.0); // a herding camp

const adults = (ps: Person[]) => ps.filter((p) => p.age >= 15 && p.age < 55);
const plans = new WeakMap<Person, DayPlan>();
const planFor = (p: Person) => plans.get(p) ?? (plans.set(p, planDay(p, EPOCH)), plans.get(p)!);
const share = (ps: Person[], hour: number, test: (s: State) => boolean) =>
  ps.filter((p) => test(stateAt(planFor(p), hour))).length / ps.length;
const awayHours = (ps: Person[]) => {
  let total = 0;
  for (const p of ps) for (let h = 0; h < 24; h += 0.25) if (stateAt(planFor(p), h).activity === 'trip') total += 0.25;
  return total / ps.length;
};

describe('the schedule', () => {
  it('is deterministic: the same person and hour give the same day, a different day a different one', () => {
    const p = kalahari[7];
    expect(planDay(p, EPOCH)).toEqual(planDay({ ...p }, EPOCH));
    const days = new Set(Array.from({ length: 10 }, (_, d) => JSON.stringify(planDay(p, EPOCH + 24 * d))));
    expect(days.size).toBeGreaterThan(5);
    // The local day is what counts: an hour later, same day, same plan.
    expect(planDay(p, EPOCH + 1)).toEqual(planDay(p, EPOCH));
  });

  it.each([
    ['forager band', kalahari],
    ['farming village', nile],
    ['herding camp', steppe],
  ])('has almost everyone asleep at 3 am and almost no one at noon (%s)', (_, ps) => {
    expect(share(ps, 3, (s) => s.activity === 'asleep')).toBeGreaterThan(0.97);
    expect(share(ps, 12, (s) => s.activity === 'asleep')).toBeLessThan(0.01);
    // At 9 pm most have gone to bed or are about to: well under half are still up at 11 pm.
    expect(share(ps, 23, (s) => s.activity === 'asleep')).toBeGreaterThan(0.6);
  });

  it('keeps adults away on trips for roughly the hours time_use.yaml gives for food getting', () => {
    // Foragers: ~65-75% of adults go out on a given day for 2.2-6.0 h (walking included), so 1.5-3.5 h a day on average.
    const forager = awayHours(adults(kalahari));
    expect(forager).toBeGreaterThan(1.5);
    expect(forager).toBeLessThan(3.8);
    // Farmers: most go to the fields for 3.0-5.5 h, so a little more.
    const farmer = awayHours(adults(nile));
    expect(farmer).toBeGreaterThan(2);
    expect(farmer).toBeLessThan(4.5);
    // Herders on the steppe are out longest.
    expect(awayHours(adults(steppe))).toBeGreaterThan(3.5);
  });

  it('puts the trips in the day: a third or more of adults are out at midday, none before dawn or after supper', () => {
    for (const ps of [adults(kalahari), adults(nile), adults(steppe)]) {
      const out = (h: number) => share(ps, h, (s) => s.activity === 'trip');
      expect(Math.max(out(10), out(11), out(12), out(13))).toBeGreaterThan(0.33);
      expect(out(5)).toBe(0);
      expect(out(21)).toBe(0);
    }
  });

  it('gives each trip kind to the roles and sexes it is tilted to', () => {
    const kinds = (ps: Person[], pred: (p: Person) => boolean) => {
      const count: Record<string, number> = {};
      for (const p of ps.filter(pred)) {
        const a = planDay(p, EPOCH).away;
        if (a?.kind === 'trip') count[a.trip] = (count[a.trip] ?? 0) + 1;
      }
      return count;
    };
    const huntersM = kinds(kalahari, (p) => p.role === 'hunter' && !p.female);
    const huntersF = kinds(kalahari, (p) => p.role === 'hunter' && p.female);
    expect(huntersM.hunting).toBeGreaterThan((huntersM.gathering ?? 0) * 5);
    expect(huntersF.gathering).toBeGreaterThan(huntersF.hunting ?? 0);
    const farmers = kinds(nile, (p) => p.role === 'farmer');
    expect(farmers['working the fields']).toBeGreaterThan((farmers['fetching water and wood'] ?? 0) * 2);
    expect(Object.keys(kinds(nile, () => true))).not.toContain('hunting');
    const herders = kinds(steppe, (p) => p.role === 'herder' || p.role === 'shepherd');
    expect(herders.herding).toBeGreaterThan(20);
  });

  it('keeps children at play and infants at the hearth, and elders off the long trips', () => {
    const kids = kalahari.filter((p) => p.age >= 5 && p.age < 13);
    expect(share(kids, 10, (s) => s.activity === 'playing')).toBe(1);
    expect(share(kids, 3, (s) => s.activity === 'asleep')).toBe(1);
    expect(share(kalahari.filter((p) => p.age < 5), 10, (s) => s.activity === 'hearth')).toBe(1);
    const elders = kalahari.filter((p) => p.age >= 55);
    for (const p of elders) {
      const a = planDay(p, EPOCH).away;
      expect(a?.kind === 'trip' ? a.trip : 'fetching water and wood').toBe('fetching water and wood');
    }
  });

  it('is a day that fits: back before bed, each way within the window, bed after waking', () => {
    const broken: string[] = [];
    for (const p of [...kalahari, ...nile, ...steppe]) {
      const plan = planFor(p);
      if (plan.bed < plan.wake + 8 || plan.bed > plan.wake + 18) broken.push(`sleep ${p.id}`);
      if (plan.away?.kind !== 'trip') continue;
      const walk = plan.away.dist / WALK_MS / 3600;
      const spec = TRIPS[plan.away.trip];
      if (plan.to - plan.from < 2 * walk + 0.25 - 1e-9) broken.push(`too short ${p.id}`);
      if (plan.to > plan.bed - 0.75 + 1e-9) broken.push(`late ${p.id}`);
      if (plan.from <= plan.wake) broken.push(`early ${p.id}`);
      if (plan.away.dist < spec.km[0] * 1000 - 1e-6 || plan.away.dist > spec.km[1] * 1000 + 1e-6) broken.push(`far ${p.id}`);
    }
    expect(broken).toEqual([]);
  });

  it('follows the season: at 50°N people wake later and go to bed earlier in December than in June', () => {
    const p = { ...kalahari[0], position: [0, 50] as [number, number] };
    const june = planDay(p, epochHour(Date.UTC(2026, 5, 21, 12)));
    const dec = planDay(p, epochHour(Date.UTC(2026, 11, 21, 12)));
    expect(dec.wake - june.wake).toBeGreaterThan(1.5);
    // Same sleep need, so the whole day shifts rather than shrinks.
    expect(dec.bed - dec.wake).toBeCloseTo(june.bed - june.wake, 0);
  });

  it('runs on each place’s own sun clock', () => {
    const noonUtc = Date.UTC(2026, 2, 20, 12);
    expect(localHourAt(noonUtc, 0)).toBeCloseTo(12);
    expect(localHourAt(noonUtc, 90)).toBeCloseTo(18);
    expect(localHourAt(noonUtc, -90)).toBeCloseTo(6);
    expect(localHourAt(noonUtc, 180)).toBeCloseTo(0);
  });
});

describe('a trip', () => {
  const walkers = adults(kalahari).filter((p) => planDay(p, EPOCH).away?.kind === 'trip');

  it('goes out along its road, works at the far end, and comes back', () => {
    const p = walkers[0];
    const plan = planDay(p, EPOCH);
    if (plan.away?.kind !== 'trip') throw new Error('expected a trip');
    const walk = plan.away.dist / WALK_MS / 3600;
    const at = (h: number) => stateAt(plan, h);
    const leg = (s: State) => (s.activity === 'trip' ? s.leg : s.activity);
    expect(leg(at(plan.from - 0.01))).toBe('hearth');
    expect(leg(at(plan.from + 0.001))).toBe('out');
    expect(leg(at(plan.from + walk + 0.001))).toBe('there');
    expect(leg(at(plan.to - walk + 0.001))).toBe('back');
    expect(leg(at(plan.to + 0.001))).toBe('hearth');
    // The distance from camp rises to the destination and falls back to nothing.
    const distance = (h: number) => {
      const s = at(h);
      return s.activity === 'trip' ? s.distance : 0;
    };
    let prev = 0;
    for (let h = plan.from; h <= plan.from + walk; h += walk / 20) {
      expect(distance(h)).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = distance(h);
    }
    expect(distance(plan.from + walk / 2)).toBeCloseTo(plan.away.dist / 2, -1);
    expect(distance(plan.from + walk + 0.01)).toBeCloseTo(plan.away.dist, 6);
    expect(distance(plan.to - 0.0001)).toBeLessThan(5);
  });

  it('pins the gait style the shader draws', () => {
    const p = walkers[0];
    const plan = planDay(p, EPOCH);
    expect(styleOf(stateAt(plan, plan.wake - 1))).toBe(1);
    expect(styleOf(stateAt(plan, (plan.from + plan.to) / 2))).toBe(3);
    expect(styleOf(stateAt(plan, plan.wake + 0.01))).toBe(0);
    const child = kalahari.find((q) => q.age >= 5 && q.age < 13)!;
    const cp = planDay(child, EPOCH);
    expect(styleOf(stateAt(cp, cp.from + 1))).toBe(2);
  });

  it('is packed for the shader as [wake, bed, from, to] and [dist, bearing, plays, lonHours]', () => {
    const p = walkers[0];
    const plan = planDay(p, EPOCH);
    if (plan.away?.kind !== 'trip') throw new Error('expected a trip');
    const a = planAttributes(plan);
    expect(a.day).toEqual([plan.wake, plan.bed, plan.from, plan.to]);
    expect(a.trip).toEqual([plan.away.dist, plan.away.bearing, 0, p.position[0] / 15]);
    const child = kalahari.find((q) => q.age >= 5 && q.age < 13)!;
    expect(planAttributes(planDay(child, EPOCH)).trip.slice(0, 3)).toEqual([0, 0, 1]);
  });
});

describe('words', () => {
  const trip = adults(kalahari).find((p) => {
    const a = planDay(p, EPOCH).away;
    return a?.kind === 'trip' && a.trip === 'gathering';
  })!;
  const plan = planDay(trip, EPOCH);
  const mid = (plan.from + plan.to) / 2;

  it('says what they are doing and how far from camp', () => {
    const s = stateAt(plan, mid);
    expect(describeState(trip, s, mid)).toMatch(/^gathering, about (\d+ m|[\d.]+ km) from camp$/);
    expect(describeState(trip, stateAt(plan, plan.wake - 2), plan.wake - 2)).toBe('asleep in the camp');
    const village = nile.find((p) => p.age >= 15 && p.age < 55)!;
    const vp = planDay(village, EPOCH);
    expect(describeState(village, stateAt(vp, vp.wake - 2), vp.wake - 2)).toBe('asleep in the village');
  });

  it('says it is imagined on the card', () => {
    const ms = EQUINOX - 12 * 3_600_000 + (mid - trip.position[0] / 15) * 3_600_000;
    const line = routineLine(trip, ms);
    expect(line).toMatch(/^Now: gathering, about/);
    expect(line).toContain('Imagined: the pattern is modelled from time-use studies');
  });

  it('chooses the hearth word from the role and the half hour', () => {
    const potter = nile.find((p) => p.role === 'potter' && p.age >= 15 && p.age < 55)!;
    const words = new Set<string>();
    for (let h = 8; h < 20; h += 0.5) words.add(describeState(potter, { activity: 'hearth' }, h));
    expect(words.size).toBeGreaterThan(2);
    expect([...words].every((w) => w.endsWith(' in the village'))).toBe(true);
  });
});

describe('time_use.yaml', () => {
  it('has the food-getting hours the trips use (deploy/budgie/api/time_use.json is its export)', () => {
    const file = path.join(__dirname, '../../deploy/budgie/api/time_use.json');
    const tu = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(tu.ways_of_life.foraging.figures.food_getting.range).toEqual([...FOOD_GETTING_HOURS.foraging]);
    expect(tu.ways_of_life.farming.figures.food_getting.range).toEqual([...FOOD_GETTING_HOURS.farming]);
  });
});
