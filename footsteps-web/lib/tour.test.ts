import { readFileSync } from 'fs';
import { join } from 'path';
import { ARRIVAL_KA, TOUR_STOPS, flyFrame, neanderthalFade, stepTour, tourKeyAction, tourParam, type TourStop } from './tour';
import { HYDE_MIN, HYDE_TOTALS, PEOPLE_TOTALS, TIME_MAX, TIME_MIN, evidenceAt } from './time';
import { PEOPLE_YEARS } from './constants';
import { OTHER_HUMANS } from './otherHumans';
import { seaLevelAt } from './climate';
import prehistory from '../public/prehistory_totals.json';

const yaml = readFileSync(join(__dirname, '../../footstep-generator/prehistory/arrivals.yaml'), 'utf8');
/** A region's block in arrivals.yaml, from its `- id:` line to the next one. */
const region = (id: string) => {
  const m = yaml.match(new RegExp(`- id: ${id}\\n((?:(?!  - id:).*\\n)*)`));
  if (!m) throw new Error(`no region ${id} in arrivals.yaml`);
  return m[1];
};
const arrival = (id: string) => {
  const m = region(id).match(/arrival_ka_bp: \{central: ([\d.]+), early: ([\d.]+), late: ([\d.]+)\}/);
  return { central: Number(m![1]), early: Number(m![2]), late: Number(m![3]) };
};
const alt = (id: string) => Number(region(id).match(/alt: \{ka_bp: ([\d.]+)/)![1]);

const stop = (id: string) => TOUR_STOPS.find((s) => s.id === id)!;
const words = (s: TourStop) => s.text.join(' ');
/** Every number in the wording, as written ("4.6", "100,000", "1900"). */
const numbersIn = (s: TourStop) => (words(s).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n: string) => n.replace(/,/g, ''));

const prehistoryAt = (year: number) => {
  const i = prehistory.years.indexOf(year);
  return { low: prehistory.low[i], central: prehistory.central[i], high: prehistory.high[i] };
};
const ka = (k: number) => String(k * 1000);
/** The digits the time bar would print for `n` people (thousands, millions or billions). */
const counted = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) : n < 1e6 ? String(Number((n / 1e3).toPrecision(2))) : (n / 1e6).toFixed(n < 1e7 ? 1 : 0);

describe('tour stops', () => {
  it('has 8 to 10 stops in time order, each on a people-image year inside the slider', () => {
    expect(TOUR_STOPS.length).toBeGreaterThanOrEqual(8);
    expect(TOUR_STOPS.length).toBeLessThanOrEqual(10);
    TOUR_STOPS.forEach((s, i) => {
      expect(s.year).toBeGreaterThanOrEqual(TIME_MIN);
      expect(s.year).toBeLessThanOrEqual(TIME_MAX);
      expect(PEOPLE_YEARS).toContain(s.year);
      if (i > 0) expect(s.year).toBeGreaterThan(TOUR_STOPS[i - 1].year);
    });
    expect(new Set(TOUR_STOPS.map((s) => s.id)).size).toBe(TOUR_STOPS.length);
  });

  it('labels each stop as the app labels its people: modelled before HYDE, measured from it', () => {
    for (const s of TOUR_STOPS) {
      if (s.evidence !== 'imagined') expect(s.evidence).toBe(evidenceAt(s.year));
    }
  });

  it('has two short sentences and a source per stop, and a camera on the globe', () => {
    for (const s of TOUR_STOPS) {
      expect(s.text).toHaveLength(2);
      for (const t of s.text) {
        expect(t).toMatch(/^[A-Z0-9].*[.]$/);
        expect(t.length).toBeLessThan(240);
      }
      expect(s.source.length).toBeGreaterThan(10);
      expect(Math.abs(s.view.latitude)).toBeLessThanOrEqual(85);
      expect(Math.abs(s.view.longitude)).toBeLessThanOrEqual(180);
      expect(s.view.zoom).toBeGreaterThanOrEqual(1);
      expect(s.view.zoom).toBeLessThan(7.5); // below the close-up 3D tilt, where the stop's pitch is the one drawn
    }
  });

  it('copies the arrival dates it quotes from arrivals.yaml', () => {
    expect(ARRIVAL_KA.africa).toBe(arrival('africa').central);
    expect(ARRIVAL_KA.southeast_asia_mainland).toBe(arrival('southeast_asia_mainland').central);
    expect(ARRIVAL_KA.levant_arabia).toBe(arrival('levant_arabia').central);
    expect(ARRIVAL_KA.south_asia).toBe(arrival('south_asia').central);
    expect(ARRIVAL_KA.sahul).toBe(arrival('sahul').central);
    expect(ARRIVAL_KA.sahul_alt).toBe(alt('sahul'));
    expect(ARRIVAL_KA.europe_west).toBe(arrival('europe_west').central);
    expect(ARRIVAL_KA.north_america).toBe(arrival('north_america').central);
    expect(ARRIVAL_KA.north_america_early).toBe(arrival('north_america').early);
    expect(ARRIVAL_KA.south_america).toBe(arrival('south_america').central);
  });

  // Each stop's numbers, worked out here straight from the source files: the wording may hold these and nothing else.
  const expected: Record<string, string[]> = {
    africa: [
      '100000', // the year
      counted(prehistoryAt(-100000).central),
      counted(prehistoryAt(-100000).low),
      counted(prehistoryAt(-100000).high),
      ka(arrival('africa').central),
    ],
    'first-out': ['60000', ka(arrival('southeast_asia_mainland').central), ka(arrival('levant_arabia').central), ka(arrival('south_asia').central)],
    sahul: [ka(arrival('sahul').central), String(Math.round(-seaLevelAt(-46000))), ka(alt('sahul'))],
    'other-humans': [
      ka(OTHER_HUMANS.find((h) => h.id === 'neanderthals')!.lastKa.central),
      ka(arrival('europe_west').central),
      ka(OTHER_HUMANS.find((h) => h.id === 'denisovans')!.lastKa.central),
    ],
    americas: [ka(arrival('north_america').central), ka(arrival('south_america').central), String(Math.round(-seaLevelAt(-12000))), ka(arrival('north_america').early)],
    'hyde-starts': ['10000', '3.5', counted(HYDE_TOTALS[-10000])],
    nile: ['3000', counted(HYDE_TOTALS[-3000]), String(Math.round(HYDE_TOTALS[-3000] / HYDE_TOTALS[-10000])), '10000'],
    rome: ['0', '1', counted(HYDE_TOTALS[0]), (HYDE_TOTALS[0] / HYDE_TOTALS[-1000]).toFixed(1), '1000'],
    'world-1900': ['1900', counted(HYDE_TOTALS[1900]), counted(HYDE_TOTALS[1800]), String(Math.round(HYDE_TOTALS[1900] / HYDE_TOTALS[-10000])), '10000'],
  };

  it('quotes only numbers that match their source', () => {
    expect(Object.keys(expected).sort()).toEqual(TOUR_STOPS.map((s) => s.id).sort());
    for (const s of TOUR_STOPS) {
      expect({ id: s.id, numbers: [...new Set(numbersIn(s))].sort() }).toEqual({ id: s.id, numbers: [...new Set(expected[s.id])].sort() });
    }
  });

  it('reads the world totals the counter shows', () => {
    expect(PEOPLE_TOTALS[-100000].central).toBe(prehistoryAt(-100000).central);
    expect(PEOPLE_TOTALS[HYDE_MIN].central).toBe(HYDE_TOTALS[-10000]);
    expect(words(stop('world-1900'))).toContain('1.73 billion');
  });

  it('stops on the Neanderthals while they fade', () => {
    const [from, to] = neanderthalFade();
    expect(stop('other-humans').year).toBeGreaterThan(from);
    expect(stop('other-humans').year).toBeLessThan(to);
  });
});

describe('tour controls', () => {
  it('is on only with ?tour=1', () => {
    expect(tourParam('?tour=1')).toBe(true);
    expect(tourParam('?year=0&tour=1')).toBe(true);
    expect(tourParam('')).toBe(false);
    expect(tourParam('?tour=0')).toBe(false);
  });

  it('steps forward and back, stays at the first stop, and ends after the last', () => {
    expect(stepTour(0, 1, 9)).toBe(1);
    expect(stepTour(0, -1, 9)).toBe(0);
    expect(stepTour(4, -1, 9)).toBe(3);
    expect(stepTour(8, 1, 9)).toBeNull();
  });

  it('maps arrows and Esc, but leaves the slider, fields and modified keys alone', () => {
    expect(tourKeyAction({ key: 'ArrowRight' }, { tagName: 'BODY' })).toBe('next');
    expect(tourKeyAction({ key: 'ArrowLeft' }, null)).toBe('back');
    expect(tourKeyAction({ key: 'Escape' }, { tagName: 'BUTTON' })).toBe('exit');
    expect(tourKeyAction({ key: 'ArrowRight' }, { tagName: 'DIV', role: 'slider' })).toBeNull();
    expect(tourKeyAction({ key: 'ArrowRight' }, { tagName: 'INPUT' })).toBeNull();
    expect(tourKeyAction({ key: 'ArrowRight', shiftKey: true }, null)).toBeNull();
    expect(tourKeyAction({ key: 'w' }, null)).toBeNull();
  });

  it('flies from one view to the next, the short way round', () => {
    const from = { latitude: 0, longitude: 170, zoom: 3, pitch: 0, bearing: 0 };
    const to = { latitude: 10, longitude: -170, zoom: 4, pitch: 0, bearing: 0 };
    expect(flyFrame(from, to, 0)).toEqual(from);
    const end = flyFrame(from, to, 1);
    expect(end.latitude).toBeCloseTo(10);
    expect(end.longitude).toBeCloseTo(-170);
    expect(end.zoom).toBeCloseTo(4);
    const mid = flyFrame(from, to, 0.5);
    expect(Math.abs(mid.longitude)).toBeCloseTo(180); // across the date line, not round the world
    expect(mid.zoom).toBeLessThan(3.5); // pulled out a little mid-flight
  });
});
