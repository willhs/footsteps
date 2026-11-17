// Other kinds of human alive during the slider's range (100,000 BCE onwards): where they lived (rough,
// hand-drawn ranges), when they were last seen, and the key dated sites behind that. Ranges are
// approximate outlines around the known sites, not measured territories. End dates follow
// footstep-generator/prehistory/arrivals.yaml `other_hominins` (checked there); Homo luzonensis and the
// site dates are recalled from the literature (`checked: false`) unless said otherwise.
// Late Homo erectus (Ngandong, Java, 117-108 ka: Rizal et al. 2020 Nature 577:381) ends before the
// slider starts, so it is not drawn.

export type Lonlat = [number, number];

export interface Site {
  name: string;
  position: Lonlat;
  /** Date range in thousands of years before 1950: [oldest, youngest]. */
  ka: [number, number];
  /** True when only a minimum age is known (the find is at least this old). */
  minimum?: boolean;
  find: string;
  source: string;
  checked: boolean;
}

export interface Range {
  polygon: Lonlat[];
  /** 'likely' = around known fossils/DNA; 'hinted' = inferred only from DNA in later people. */
  confidence: 'likely' | 'hinted';
}

export interface OtherHuman {
  id: 'neanderthals' | 'denisovans' | 'floresiensis' | 'luzonensis';
  name: string;
  latin: string;
  ranges: Range[];
  label: Lonlat;
  /** Last seen, thousands of years before 1950: fully drawn until `early`, gone by `late`. */
  lastKa: { central: number; early: number; late: number };
  note: string;
  source: string;
  checked: boolean;
  sites: Site[];
}

export const OTHER_HUMANS: OtherHuman[] = [
  {
    id: 'neanderthals',
    name: 'Neanderthals',
    latin: 'Homo neanderthalensis',
    label: [30, 47],
    ranges: [
      {
        confidence: 'likely',
        polygon: [
          [-9.5, 36.5], [-9.5, 43.5], [-4, 48], [1, 51], [6, 52.5], [13, 52.5], [22, 51],
          [32, 50], [42, 48], [52, 47.5], [62, 48], [72, 50], [82, 52.5], [88, 52.5], [88, 49.5],
          [80, 47], [72, 42], [66, 37], [56, 35.5], [48, 32.5], [40, 32], [36, 30.5], [34, 31],
          [35.5, 36], [30, 36.5], [24, 37.5], [20, 38.5], [16, 37.5], [12, 37.5], [8, 40],
          [3, 41], [-1, 37.5], [-5, 36],
        ],
      },
    ],
    lastKa: { central: 40, early: 41, late: 39 },
    note: 'Lived across Europe and western Asia for some 300,000 years. Most people outside Africa carry about 2% Neanderthal DNA.',
    source: 'Higham et al. 2014 Nature 512:306 (end 41,030-39,260 cal BP); Iasi et al. 2024 Science (mixing 50.5-43.5 ka).',
    checked: true,
    sites: [
      { name: "Gorham's Cave, Gibraltar", position: [-5.34, 36.12], ka: [50, 40], find: 'Mousterian tools and hearths; claims of survival to ~32 ka are disputed', source: 'Finlayson et al. 2006 Nature 443:850; Higham et al. 2014', checked: false },
      { name: 'El Sidrón, Spain', position: [-5.33, 43.39], ka: [51, 47], find: 'Bones of at least 13 people', source: 'Wood et al. 2013 Archaeometry', checked: false },
      { name: 'La Ferrassie, France', position: [0.94, 44.95], ka: [60, 41], find: 'Several skeletons, including children', source: 'Balzeau et al. 2020 Sci Rep', checked: false },
      { name: 'La Chapelle-aux-Saints, France', position: [1.72, 44.99], ka: [60, 47], find: 'A near-complete older man, probably buried', source: 'Rendu et al. 2014 PNAS', checked: false },
      { name: 'Grotte Mandrin, France', position: [4.82, 44.62], ka: [50, 42], find: '"Thorin", a late Neanderthal from an isolated lineage', source: 'Slimak et al. 2024 Cell Genomics', checked: false },
      { name: 'Spy Cave, Belgium', position: [4.67, 50.48], ka: [44, 40], find: 'Two adult skeletons', source: 'Devièse et al. 2021 PNAS', checked: false },
      { name: 'Feldhofer Cave (Neander Valley), Germany', position: [6.95, 51.23], ka: [42, 39], find: 'The type specimen that named the species (found 1856)', source: 'Schmitz et al. 2002 PNAS', checked: false },
      { name: 'Grotta Guattari, Italy', position: [13.08, 41.24], ka: [66, 50], find: 'Skull and the remains of several people', source: 'Rolfo et al. 2023 Quaternary', checked: false },
      { name: 'Vindija Cave, Croatia', position: [16.08, 46.3], ka: [50, 44], find: 'Bones that gave a high-quality Neanderthal genome', source: 'Prüfer et al. 2017 Science 358:655; Devièse et al. 2017 PNAS', checked: false },
      { name: 'Mezmaiskaya Cave, Russia', position: [40.0, 44.17], ka: [70, 42], find: 'An infant and later remains with ancient DNA', source: 'Hajdinjak et al. 2018 Nature 555:652', checked: false },
      { name: 'Tabun Cave, Israel', position: [34.97, 32.67], ka: [120, 90], find: 'A woman\'s skeleton (Tabun C1); date long debated', source: 'Grün & Stringer 2000 J Hum Evol', checked: false },
      { name: 'Kebara Cave, Israel', position: [34.94, 32.56], ka: [64, 48], find: 'Kebara 2, with the oldest known hyoid bone', source: 'Valladas et al. 1987 Nature', checked: false },
      { name: 'Amud Cave, Israel', position: [35.5, 32.87], ka: [70, 50], find: 'Remains including a buried infant', source: 'Rak et al. 1994; Hovers et al. 2011', checked: false },
      { name: 'Shanidar Cave, Iraq', position: [44.22, 36.83], ka: [75, 45], find: 'Ten people, some with healed injuries; possible burial', source: 'Pomeroy et al. 2020 Antiquity', checked: false },
      { name: 'Teshik-Tash, Uzbekistan', position: [67.2, 38.27], ka: [70, 40], find: 'A child ringed by goat horns; the date is poorly known', source: 'Krause et al. 2007 Nature 449:902', checked: false },
      { name: 'Chagyrskaya Cave, Russia', position: [83.15, 51.44], ka: [59, 49], find: 'Remains of 13 people from one community', source: 'Skov et al. 2022 Nature 610:519', checked: false },
      { name: 'Okladnikov Cave, Russia', position: [84.34, 51.68], ka: [50, 40], find: 'Teeth and bones with Neanderthal DNA', source: 'Krause et al. 2007 Nature 449:902', checked: false },
    ],
  },
  {
    id: 'denisovans',
    name: 'Denisovans',
    latin: 'no agreed species name; possibly Homo longi',
    label: [108, 38],
    ranges: [
      {
        confidence: 'likely',
        polygon: [
          [78, 53], [92, 54.5], [108, 53], [122, 50], [132, 47], [130, 41], [124, 35], [122, 27],
          [121, 21], [112, 18], [107, 13], [101, 14], [97, 21], [92, 27.5], [86, 30.5],
          [80, 35], [76, 42], [76, 49],
        ],
      },
      {
        // Papuans and Aboriginal Australians carry up to ~5% Denisovan DNA, so Denisovans (or a close
        // group) likely lived somewhere around Wallacea; no fossils there yet.
        confidence: 'hinted',
        polygon: [
          [117, 2], [125, 4], [132, 0], [141, -2], [150, -6], [147, -11], [138, -9], [128, -10],
          [119, -9], [115, -5],
        ],
      },
    ],
    lastKa: { central: 45, early: 60, late: 32 },
    note: 'Known mostly from DNA and a few bones. Papuans and Aboriginal Australians carry up to ~5% Denisovan DNA.',
    source: 'Chen et al. 2019 Nature 569:409; Xia et al. 2024 Nature (Baishiya rib 48-32 ka); Jacobs et al. 2019 Cell 177:1010 (late mixing in New Guinea).',
    checked: true,
    sites: [
      { name: 'Denisova Cave, Russia', position: [84.68, 51.4], ka: [200, 50], find: 'A finger bone whose genome revealed the Denisovans (2010)', source: 'Reich et al. 2010 Nature 468:1053; Douka et al. 2019 Nature 565:640', checked: false },
      { name: 'Baishiya Karst Cave (Xiahe), Tibet', position: [102.57, 35.45], ka: [160, 32], find: 'A jaw (≥160 ka), a rib and Denisovan DNA in cave sediment', source: 'Chen et al. 2019 Nature 569:409; Xia et al. 2024 Nature', checked: false },
      { name: 'Harbin, China', position: [126.6, 45.75], ka: [146, 146], minimum: true, find: 'A near-complete skull ("Dragon Man"), tied to Denisovans by proteins and DNA in 2025', source: 'Fu et al. 2025 Science; Fu et al. 2025 Cell', checked: false },
      { name: 'Penghu Channel, Taiwan', position: [119.6, 23.5], ka: [190, 10], find: 'A jaw dredged from the seabed, identified as Denisovan by its proteins', source: 'Tsutaya et al. 2025 Science', checked: false },
      { name: 'Tam Ngu Hao 2 (Cobra Cave), Laos', position: [103.41, 20.21], ka: [164, 131], find: 'A child\'s molar, probably Denisovan', source: 'Demeter et al. 2022 Nat Commun 13:2557', checked: false },
    ],
  },
  {
    id: 'floresiensis',
    name: 'Homo floresiensis',
    latin: 'Homo floresiensis ("hobbits")',
    label: [121.3, -8.5],
    ranges: [
      {
        confidence: 'likely',
        polygon: [
          [119.8, -8.4], [120.6, -8.2], [121.6, -8.3], [122.4, -8.1], [123.0, -8.3], [122.4, -8.8],
          [121.3, -8.9], [120.2, -8.9],
        ],
      },
    ],
    lastKa: { central: 50, early: 60, late: 50 },
    note: 'About a metre tall, on the island of Flores. Whether they met modern humans is unknown.',
    source: 'Sutikna et al. 2016 Nature 532:366 (bones ~100-60 ka, tools ~190-50 ka).',
    checked: true,
    sites: [
      { name: 'Liang Bua, Flores', position: [120.46, -8.53], ka: [100, 60], find: 'Skeletons of small-bodied people; their stone tools continue to ~50 ka', source: 'Sutikna et al. 2016 Nature 532:366', checked: true },
    ],
  },
  {
    id: 'luzonensis',
    name: 'Homo luzonensis',
    latin: 'Homo luzonensis',
    label: [121.2, 16.6],
    ranges: [
      {
        confidence: 'likely',
        polygon: [
          [120.0, 18.5], [121.0, 18.6], [122.3, 18.4], [122.4, 16.5], [122.1, 14.0], [121.0, 13.8],
          [120.5, 14.5], [119.8, 16.0], [120.3, 17.2],
        ],
      },
    ],
    lastKa: { central: 50, early: 50, late: 45 },
    note: 'Known from a few teeth and bones on Luzon. The fossils are at least 50,000 years old; how long they lasted after that is unknown.',
    source: 'Détroit et al. 2019 Nature 568:181 (minimum ages 50 and 67 ka).',
    checked: false,
    sites: [
      { name: 'Callao Cave, Luzon', position: [121.82, 17.7], ka: [67, 50], minimum: true, find: 'Teeth, finger and foot bones of at least three people', source: 'Détroit et al. 2019 Nature 568:181; Mijares et al. 2010 J Hum Evol', checked: false },
    ],
  },
];

/** Thousands of years before 1950 → calendar year (negative = BCE). */
export const kaToYear = (ka: number) => 1950 - ka * 1000;

/** How strongly to draw a species at `year`: 1 until its earliest last date, 0 once its latest has passed. */
export function presenceAt(h: OtherHuman, year: number): number {
  const from = kaToYear(h.lastKa.early);
  const to = kaToYear(h.lastKa.late);
  if (year <= from) return 1;
  if (year >= to) return 0;
  return 1 - (year - from) / (to - from);
}

/** The species drawn at `year`, with their presence. */
export function otherHumansAt(year: number): { human: OtherHuman; presence: number }[] {
  return OTHER_HUMANS.map((human) => ({ human, presence: presenceAt(human, year) })).filter((d) => d.presence > 0);
}

/** "Last seen about 40,000 years ago" (rounded to the thousand). */
export function lastSeenLabel(h: OtherHuman): string {
  return `last seen about ${(h.lastKa.central * 1000).toLocaleString('en-US')} years ago`;
}

/** "~67,000–50,000 years ago" or "at least 146,000 years ago". */
export function siteAgeLabel(s: Site): string {
  const k = (ka: number) => (ka * 1000).toLocaleString('en-US');
  if (s.minimum && s.ka[0] === s.ka[1]) return `at least ${k(s.ka[0])} years ago`;
  if (s.minimum) return `at least ${k(s.ka[1])} years ago (some finds ${k(s.ka[0])})`;
  return `~${k(s.ka[0])}–${k(s.ka[1])} years ago`;
}
