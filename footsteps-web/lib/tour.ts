// The guided tour behind `?tour=1` (docs/ops/tour.md): nine stops through 100,000 years. Each stop is a camera
// view, a year on the slider and two sentences that say what the screen shows and where the number comes from.
//
// Every number in the wording is computed here from the app's own data, so it cannot drift from what the counter
// and the map show: world totals from `PEOPLE_TOTALS` (the pre-HYDE model's totals.json and HYDE), the other humans'
// last-seen dates from `OTHER_HUMANS`, sea level from `seaLevelAt`. Region arrival dates live in
// footstep-generator/prehistory/arrivals.yaml, which the web build cannot read; `ARRIVAL_KA` copies the few the tour
// uses and `tour.test.ts` checks each against the YAML. The wording is a first draft for Will to edit.
import { OTHER_HUMANS, kaToYear } from './otherHumans';
import { seaLevelAt } from './climate';
import { HYDE_MIN, PEOPLE_TOTALS, calendarLabel, populationLabel, type Evidence } from './time';

/** Measured (HYDE head counts), modelled (the pre-HYDE model) or imagined (where a mark sits), as elsewhere in the app. */
export type TourEvidence = Evidence | 'imagined';

export type TourView = { latitude: number; longitude: number; zoom: number; pitch: number; bearing: number };

export type TourStop = {
  id: string;
  title: string;
  view: TourView;
  /** A people-image year, so the counter shows a data year, not an estimate between two. */
  year: number;
  evidence: TourEvidence;
  /** Two sentences: what the screen shows, and where its number comes from. */
  text: [string, string];
  /** The data the numbers are read from, short. */
  source: string;
};

/** Arrival dates (ka BP, `arrival_ka_bp` in arrivals.yaml) the tour quotes; `tour.test.ts` pins each to the YAML. */
export const ARRIVAL_KA = {
  africa: 300,
  southeast_asia_mainland: 70,
  levant_arabia: 50,
  south_asia: 72,
  sahul: 50,
  /** Sahul's `alt`: Madjedbebe, the disputed early date. */
  sahul_alt: 65,
  europe_west: 45,
  north_america: 16,
  /** North America's `early` bracket. */
  north_america_early: 23,
  south_america: 15,
} as const;

const humans = (id: string) => OTHER_HUMANS.find((h) => h.id === id)!;

/** "300,000 years ago" from thousands of years before present. */
export const kaAgo = (ka: number) => `${(ka * 1000).toLocaleString('en-US')} years ago`;

/** People, worded as the time bar words them: "200 thousand", "4.6 million", "46 million", "1.73 billion". */
export const peopleText = populationLabel;

/** Metres below today's sea, as a whole number. */
export const seaDrop = (year: number) => Math.round(-seaLevelAt(year));

const total = (year: number) => PEOPLE_TOTALS[year];
const times = (a: number, b: number) => Math.round(total(a).central / total(b).central);

const view = (latitude: number, longitude: number, zoom: number): TourView => ({ latitude, longitude, zoom, pitch: 0, bearing: 0 });

const neanderthals = humans('neanderthals');
const denisovans = humans('denisovans');

export const TOUR_STOPS: readonly TourStop[] = [
  {
    id: 'africa',
    title: 'Everyone is in Africa',
    view: view(2, 20, 2.2),
    year: -100000,
    evidence: 'modelled',
    text: [
      `In 100,000 BCE all of our own kind live in Africa (the lavender fires elsewhere are other kinds of human): the model puts us at about ${peopleText(total(-100000).central)} people, somewhere between ${peopleText(total(-100000).low)} and ${peopleText(total(-100000).high)}.`,
      `Africa counts as lived in from ${kaAgo(ARRIVAL_KA.africa)} (Jebel Irhoud), and the fires are a published population curve spread by climate, not head counts.`,
    ],
    source: 'prehistory_totals.json (prehistory_population.py); arrivals.yaml `africa`',
  },
  {
    id: 'first-out',
    title: 'The first people outside Africa',
    view: view(12, 68, 2.0),
    year: -60000,
    evidence: 'modelled',
    text: [
      `By 60,000 BCE the model has a thin scatter of people along the southern route: South Asia from ${kaAgo(ARRIVAL_KA.south_asia)}, mainland Southeast Asia from ${kaAgo(ARRIVAL_KA.southeast_asia_mainland)}, on a few bones.`,
      `The Levant fills in from ${kaAgo(ARRIVAL_KA.levant_arabia)} as the southern lands fill out; earlier exits that died out, like Skhul and Qafzeh, are left out.`,
    ],
    source: 'arrivals.yaml `southeast_asia_mainland`, `levant_arabia`, `south_asia`',
  },
  {
    id: 'sahul',
    title: 'Across the sea to Sahul',
    view: view(-14, 135, 2.6),
    year: -46000,
    evidence: 'modelled',
    text: [
      `People reach Sahul, the one landmass of Australia, New Guinea and Tasmania, in the model ${kaAgo(ARRIVAL_KA.sahul)}, when the sea stood ${seaDrop(-46000)} m lower than today.`,
      `That is the consensus date: an older date of ${kaAgo(ARRIVAL_KA.sahul_alt)} at Madjedbebe is disputed, so the model does not use it.`,
    ],
    source: 'arrivals.yaml `sahul`; sea level from climate_series.json',
  },
  {
    id: 'other-humans',
    title: 'The other kinds of human fade',
    view: view(46, 15, 3.2),
    year: -38000,
    evidence: 'modelled',
    text: [
      `The lavender fires are Neanderthal bands, guessed in number and place; they fade out here because Neanderthals were last seen about ${kaAgo(neanderthals.lastKa.central)}.`,
      `Our own people, the warm fires, reach Europe in the model ${kaAgo(ARRIVAL_KA.europe_west)}, and Denisovans in Asia were last seen about ${kaAgo(denisovans.lastKa.central)}.`,
    ],
    source: 'otherHumans.ts (Higham et al. 2014; Xia et al. 2024); arrivals.yaml `europe_west`',
  },
  {
    id: 'americas',
    title: 'Into the Americas',
    view: view(25, -100, 1.6),
    year: -12000,
    evidence: 'modelled',
    text: [
      `The model brings people into North America ${kaAgo(ARRIVAL_KA.north_america)}, down the unglaciated Pacific coast, and into South America by ${kaAgo(ARRIVAL_KA.south_america)}.`,
      `The sea is ${seaDrop(-12000)} m lower than today, so Beringia still joins Siberia to Alaska; claims as old as ${kaAgo(ARRIVAL_KA.north_america_early)} are the contested early end.`,
    ],
    source: 'arrivals.yaml `north_america`, `south_america`; sea level from climate_series.json',
  },
  {
    id: 'hyde-starts',
    title: 'The counting starts',
    view: view(34, 42, 4),
    year: HYDE_MIN,
    evidence: 'measured',
    text: [
      `From ${calendarLabel(HYDE_MIN)} the people are HYDE 3.5's reconstruction, cell by cell: ${peopleText(total(HYDE_MIN).central)} people in the whole world, here around the Fertile Crescent and the Zagros.`,
      `Before this year the counter showed a modelled range; from here it is one figure, and each mark's way of life comes from HYDE's land use.`,
    ],
    source: 'HYDE 3.5 world total (HYDE_TOTALS in lib/time.ts)',
  },
  {
    id: 'nile',
    title: 'The Nile',
    view: view(27, 31, 4.5),
    year: -3000,
    evidence: 'measured',
    text: [
      `By 3000 BCE HYDE counts ${peopleText(total(-3000).central)} people, ${times(-3000, HYDE_MIN)} times as many as at ${calendarLabel(HYDE_MIN)}.`,
      `Along the Nile they crowd into one thin line of farmland with desert on both sides; between data years the counter interpolates.`,
    ],
    source: 'HYDE 3.5 world totals (HYDE_TOTALS in lib/time.ts)',
  },
  {
    id: 'rome',
    title: 'Rome',
    view: view(42, 12.5, 5),
    year: 0,
    evidence: 'measured',
    text: [
      `In year 0 (1 CE), HYDE's world holds ${peopleText(total(0).central)} people, ${(total(0).central / total(-1000).central).toFixed(1)} times as many as in 1000 BCE.`,
      `Italy is thick with farming villages: each cell's head count is HYDE's, but where a village sits inside its cell is imagined.`,
    ],
    source: 'HYDE 3.5 world totals (HYDE_TOTALS in lib/time.ts)',
  },
  {
    id: 'world-1900',
    title: 'The world in 1900',
    view: view(25, 20, 1.5),
    year: 1900,
    evidence: 'measured',
    text: [
      `1900 is the last year with data: HYDE counts ${peopleText(total(1900).central)} people, up from ${peopleText(total(1800).central)} a century earlier.`,
      `That is ${times(1900, HYDE_MIN)} times the people of ${calendarLabel(HYDE_MIN)}; the present is not on the map yet.`,
    ],
    source: 'HYDE 3.5 world totals (HYDE_TOTALS in lib/time.ts)',
  },
];

/** The label a stop's badge reads. */
export const EVIDENCE_LABEL: Record<TourEvidence, string> = {
  measured: 'Measured (HYDE)',
  modelled: 'Modelled, not measured',
  imagined: 'Imagined',
};

/** Whether the address asks for the tour. Off unless `?tour=1`. */
export { tourParam } from './tourParam';

/** The tour's position: a stop index, or null once exited (or never started). */
export type TourState = number | null;

/** Next or back from `index`, clamped to the stops; next from the last stop ends the tour. */
export function stepTour(index: number, dir: 1 | -1, count = TOUR_STOPS.length): TourState {
  const next = index + dir;
  if (next >= count) return null;
  return Math.max(0, next);
}

/** How long a flight between stops takes. */
export const FLY_MS = 2400;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The camera `t` (0..1) of the way from `from` to `to`: eased, the short way round in longitude, and pulled out
 * a little mid-flight on long hops so the viewer sees where they are going.
 */
export function flyFrame(from: TourView, to: TourView, t: number): TourView {
  const e = ease(Math.min(1, Math.max(0, t)));
  let dLon = to.longitude - from.longitude;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  let longitude = from.longitude + dLon * e;
  if (longitude > 180) longitude -= 360;
  if (longitude < -180) longitude += 360;
  const distance = Math.hypot(dLon, to.latitude - from.latitude);
  const dip = Math.min(1.5, Math.log2(1 + distance / 40));
  const lerp = (a: number, b: number) => a + (b - a) * e;
  return {
    latitude: lerp(from.latitude, to.latitude),
    longitude,
    zoom: Math.max(0.8, lerp(from.zoom, to.zoom) - dip * Math.sin(Math.PI * e)),
    pitch: lerp(from.pitch, to.pitch),
    bearing: lerp(from.bearing, to.bearing),
  };
}

export type TourKey = 'next' | 'back' | 'exit';

/**
 * What a key press does to the tour, or null when the tour should leave it alone: arrows step and Esc exits,
 * except while the time slider, a field or a modifier key has it (the slider keeps its own arrow keys).
 */
export function tourKeyAction(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }, target: { tagName?: string; role?: string | null; isContentEditable?: boolean } | null): TourKey | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  if (target) {
    const tag = target.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable || target.role === 'slider') return null;
  }
  if (e.key === 'ArrowRight') return 'next';
  if (e.key === 'ArrowLeft') return 'back';
  if (e.key === 'Escape') return 'exit';
  return null;
}

/** The years the tour's other-human stop fades between, for the doc and the test. */
export const neanderthalFade = () => [kaToYear(neanderthals.lastKa.early), kaToYear(neanderthals.lastKa.late)] as const;
