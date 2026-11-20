// Other kinds of human alive during the slider's range (100,000 BCE onwards): when they were last seen and
// the key dated sites behind that. Where their bands are drawn is a guess made offline from hand-drawn ranges
// and the habitat model (footstep-generator/other_humans/bands.yaml, lib/otherHumanBands.ts). End dates follow
// footstep-generator/prehistory/arrivals.yaml `other_hominins` (keep the two in step).
//
// Every site and species was checked on 2026-11-19 against the paper's abstract or full text (via
// Crossref/Europe PMC/publisher pages; DOIs are in `doi`). Each is either `checked: true` or carries a
// `couldNotVerify` reason. What changed in that pass, and what rests on secondary summaries, is
// listed in docs/ops/other-humans.md.
// Late Homo erectus (Ngandong, Java, 117-108 ka: Rizal et al. 2020 Nature 577:381,
// doi:10.1038/s41586-019-1863-2) ends before the slider starts, so it is not drawn.

export type Lonlat = [number, number];

/** Checked against the source, or not: a source we could not verify says why. */
export type Verification = { checked: true } | { checked: false; couldNotVerify: string };

export type Site = {
  name: string;
  position: Lonlat;
  /** Date range in thousands of years before 1950: [oldest, youngest]. */
  ka: [number, number];
  /** True when only a minimum age is known (the find is at least this old). */
  minimum?: boolean;
  find: string;
  source: string;
  /** DOIs of the papers named in `source`. */
  doi: string[];
} & Verification;

export type OtherHuman = {
  id: 'neanderthals' | 'denisovans' | 'floresiensis' | 'luzonensis';
  name: string;
  /** "A Neanderthal woman"; unset where the name is Latin ("a woman of Homo floresiensis"). */
  adjective?: string;
  latin: string;
  label: Lonlat;
  /** Last seen, thousands of years before 1950: fully drawn until `early`, gone by `late`. */
  lastKa: { central: number; early: number; late: number };
  note: string;
  source: string;
  /** DOIs of the papers named in `source`. */
  doi: string[];
  sites: Site[];
} & Verification;

export const OTHER_HUMANS: OtherHuman[] = [
  {
    id: 'neanderthals',
    name: 'Neanderthals',
    adjective: 'Neanderthal',
    latin: 'Homo neanderthalensis',
    label: [30, 47],
    lastKa: { central: 40, early: 41, late: 39 },
    note: 'Lived across Europe and western Asia for some 300,000 years. Most people outside Africa carry about 2% Neanderthal DNA.',
    source: 'Higham et al. 2014 Nature 512:306 (Mousterian ended 41,030-39,260 cal BP, 95.4%); Iasi et al. 2024 Science 386:eadq3010 (mixing with modern humans 50.5-43.5 ka).',
    doi: ['10.1038/nature13621', '10.1126/science.adq3010'],
    checked: true,
    sites: [
      { name: "Gorham's Cave, Gibraltar", position: [-5.342, 36.12], ka: [50, 28], find: 'Mousterian stone tools (no Neanderthal bones); the claim that Neanderthals survived here to ~28,000 radiocarbon years ago is disputed', source: 'Finlayson et al. 2006 Nature 443:850 (claims survival to 28 kyr BP, uncalibrated); Higham et al. 2014 (could not reproduce the late dates)', doi: ['10.1038/nature05195', '10.1038/nature13621'], checked: false, couldNotVerify: 'Neither paper gives the 50 ka start of the range; the late end (28 ka) is a radiocarbon claim that Higham et al. 2014 disputes.' },
      { name: 'El Sidrón, Spain', position: [-5.328, 43.386], ka: [52, 45], find: 'Partial remains of at least 12 Neanderthals', source: 'Wood et al. 2013 Archaeometry 55:148 (48,400 ± 3,200 radiocarbon BP, ultrafiltered collagen)', doi: ['10.1111/j.1475-4754.2012.00671.x'], checked: true },
      { name: 'La Ferrassie, France', position: [0.938, 44.952], ka: [54, 41], find: 'Several skeletons, including children; the child LF8 is dated 41.7-40.8 ka cal BP', source: 'Guérin et al. 2015 J Archaeol Sci 58:147 (Mousterian layers 54 ± 3 to 40 ± 2 ka, luminescence); Balzeau et al. 2020 Sci Rep 10:21230', doi: ['10.1016/j.jas.2015.01.019', '10.1038/s41598-020-77611-z'], checked: true },
      { name: 'La Chapelle-aux-Saints, France', position: [1.726, 44.988], ka: [60, 47], find: 'A near-complete older man, probably buried', source: 'Rendu et al. 2014 PNAS 111:81 (the burial was intentional)', doi: ['10.1073/pnas.1316780110'], checked: false, couldNotVerify: 'The paper’s abstract gives no age; "about 50 ka" comes from secondary sources, so the 60-47 ka range is unconfirmed.' },
      { name: 'Grotte Mandrin, France', position: [4.771, 44.469], ka: [50, 42], find: '"Thorin", a late Neanderthal from an isolated lineage (probably ~42 ka)', source: 'Slimak et al. 2024 Cell Genomics 4:100593 (final Neanderthal levels ~50-42 ka)', doi: ['10.1016/j.xgen.2024.100593'], checked: true },
      { name: 'Spy Cave, Belgium', position: [4.669, 50.482], ka: [44, 41], find: 'Remains of several Neanderthals (Spy 1 and 2 are the best known), among the youngest directly dated in north-west Europe', source: 'Devièse et al. 2021 PNAS 118:e2022466118 (north-west Europe, with Engis and Fonds-de-Forêt: 44,200-40,600 cal BP)', doi: ['10.1073/pnas.2022466118'], checked: true },
      { name: 'Feldhofer Cave (Neander Valley), Germany', position: [6.951, 51.226], ka: [41, 39], find: 'The type specimen that named the species (found 1856); two individuals both ~40,000 radiocarbon years old', source: 'Schmitz et al. 2002 PNAS 99:13342', doi: ['10.1073/pnas.192464099'], checked: true },
      { name: 'Grotta Guattari, Italy', position: [13.093, 41.231], ka: [66, 65], find: 'A skull (found 1939) and bones of several more Neanderthals, collected by hyenas', source: 'Rolfo et al. 2023 Quat Sci Rev 311:108132 (hyena den 66-65 ka, U/Th)', doi: ['10.1016/j.quascirev.2023.108132'], checked: true },
      { name: 'Vindija Cave, Croatia', position: [16.08, 46.302], ka: [52, 44], find: 'Bones that gave a high-quality Neanderthal genome (Vi33.19, genome-based age ~52 ka)', source: 'Prüfer et al. 2017 Science 358:655; Devièse et al. 2017 PNAS 114:10606; Karavanić et al. 2024 Antiquity 98:e7 (layer G3 52,000-44,000 cal BP)', doi: ['10.1126/science.aao1887', '10.1073/pnas.1709235114', '10.15184/aqy.2024.12'], checked: true },
      { name: 'Mezmaiskaya Cave, Russia', position: [40.0, 44.17], ka: [70, 43], find: 'An infant (~60-70 ka) and a later infant (44,600-42,960 cal BP) with ancient DNA', source: 'Hajdinjak et al. 2018 Nature 555:652', doi: ['10.1038/nature26151'], checked: true },
      { name: 'Tabun Cave, Israel', position: [34.966, 32.671], ka: [138, 106], find: "A woman's skeleton (Tabun C1); date long debated", source: 'Grün & Stringer 2000 J Hum Evol 39:601 (revised ESR and U-series dating of C1)', doi: ['10.1006/jhev.2000.0443'], checked: false, couldNotVerify: 'The paper’s text was not reachable; ~122 ± 16 ka for C1 comes from secondary summaries, and other methods give different ages.' },
      { name: 'Kebara Cave, Israel', position: [34.937, 32.558], ka: [64, 48], find: 'Kebara 2, a burial with a well-preserved hyoid bone (the first Neanderthal hyoid found)', source: 'Valladas et al. 1987 Nature 330:159 (thermoluminescence, deposits ~60-48 ka); Arensburg et al. 1989 Nature 338:758 (hyoid)', doi: ['10.1038/330159a0', '10.1038/338758a0'], checked: true },
      { name: 'Amud Cave, Israel', position: [35.502, 32.872], ka: [70, 50], find: 'Amud 1 (an adult) and Amud 7 (an infant, probably buried)', source: 'Valladas et al. 1999 J Archaeol Sci 26:259 (TL, ~70-50 ka); Rink et al. 2001 Geoarchaeology 16:701 (Amud 7 61 ± 9 ka); Rak et al. 1994 J Hum Evol 26:313; Hovers et al. 2000 J Hum Evol 39:253 (burial)', doi: ['10.1006/jasc.1998.0334', '10.1002/gea.1017', '10.1006/jhev.1994.1019', '10.1006/jhev.1999.0406'], checked: true },
      { name: 'Shanidar Cave, Iraq', position: [44.221, 36.832], ka: [70, 45], find: 'Ten people from the 1950s digs and one found in 2018, some with healed injuries; the newest is argued to be a deliberate burial', source: 'Pomeroy et al. 2020 Antiquity 94:11 (Shanidar 1, 3, 5 ~55-45 ka; the new remains probably 70-60 ka, preliminary OSL)', doi: ['10.15184/aqy.2019.207'], checked: true },
      { name: 'Teshik-Tash, Uzbekistan', position: [67.156, 37.966], ka: [70, 40], find: 'A child ringed by goat horns (whether placed on purpose is disputed); DNA confirms a Neanderthal', source: 'Krause et al. 2007 Nature 449:902 (mitochondrial DNA)', doi: ['10.1038/nature06193'], checked: false, couldNotVerify: 'The site is undated (Mousterian context only); the 70-40 ka range is a stand-in for the Central Asian Mousterian, and the findspot is approximate.' },
      { name: 'Chagyrskaya Cave, Russia', position: [83.155, 51.443], ka: [59, 51], find: 'Remains of 11 people, probably from one community', source: 'Skov et al. 2022 Nature 610:519 (occupation 59-51 ka)', doi: ['10.1038/s41586-022-05283-y'], checked: true },
      { name: 'Okladnikov Cave, Russia', position: [84.333, 51.667], ka: [44, 44], minimum: true, find: 'Teeth and bones with Neanderthal DNA (two people sequenced in 2022)', source: 'Skov et al. 2022 Nature 610:519 (at least 44 ka); Krause et al. 2007 Nature 449:902', doi: ['10.1038/s41586-022-05283-y', '10.1038/nature06193'], checked: true },
    ],
  },
  {
    id: 'denisovans',
    name: 'Denisovans',
    adjective: 'Denisovan',
    latin: 'no agreed species name; possibly Homo longi',
    label: [108, 38],
    lastKa: { central: 45, early: 60, late: 32 },
    note: 'Known mostly from DNA and a few bones. Papuans and Aboriginal Australians carry up to ~5% Denisovan DNA.',
    source: 'Chen et al. 2019 Nature 569:409; Xia et al. 2024 Nature 632:108 (Baishiya rib 48-32 ka); Jacobs et al. 2019 Cell 177:1010 (Denisovan mixing in Papuans ~46 and ~30 ka).',
    doi: ['10.1038/s41586-019-1139-x', '10.1038/s41586-024-07612-9', '10.1016/j.cell.2019.02.035'],
    checked: true,
    sites: [
      { name: 'Denisova Cave, Russia', position: [84.676, 51.398], ka: [195, 52], find: 'A finger bone whose DNA revealed the Denisovans (2010); Denisovan fossils here span ~195-52 ka', source: 'Krause et al. 2010 Nature 464:894; Reich et al. 2010 Nature 468:1053; Douka et al. 2019 Nature 565:640', doi: ['10.1038/nature08976', '10.1038/nature09710', '10.1038/s41586-018-0870-z'], checked: true },
      { name: 'Baishiya Karst Cave (Xiahe), Tibet', position: [102.571, 35.448], ka: [160, 32], find: 'A jaw (at least 160 ka), a rib (48-32 ka) and Denisovan DNA in cave sediment (~100-60 ka, perhaps ~45 ka)', source: 'Chen et al. 2019 Nature 569:409; Zhang et al. 2020 Science 370:584; Xia et al. 2024 Nature 632:108', doi: ['10.1038/s41586-019-1139-x', '10.1126/science.abb6320', '10.1038/s41586-024-07612-9'], checked: true },
      { name: 'Harbin, China', position: [126.6, 45.75], ka: [146, 146], minimum: true, find: 'A near-complete skull ("Dragon Man"), tied to Denisovans in 2025 by proteins and by mitochondrial DNA from dental calculus (findspot known only to the city)', source: 'Ni et al. 2021 The Innovation 2:100130 (U-series minimum 146 ka); Fu et al. 2025 Science 389:704; Fu et al. 2025 Cell 188:3919', doi: ['10.1016/j.xinn.2021.100130', '10.1126/science.adu9677', '10.1016/j.cell.2025.05.040'], checked: true },
      { name: 'Penghu Channel, Taiwan', position: [119.6, 23.5], ka: [190, 10], find: 'A jaw dredged from the seabed, identified as Denisovan by its proteins; dated only by fauna and sea level (190-130 or 70-10 ka); the dredging spot is approximate', source: 'Tsutaya et al. 2025 Science 388:176; Chang et al. 2015 Nat Commun 6:6037', doi: ['10.1126/science.ads3888', '10.1038/ncomms7037'], checked: true },
      { name: 'Tam Ngu Hao 2 (Cobra Cave), Laos', position: [103.409, 20.212], ka: [164, 131], find: "A child's molar, most likely Denisovan (the deposit is dated, not the tooth)", source: 'Demeter et al. 2022 Nat Commun 13:2557', doi: ['10.1038/s41467-022-29923-z'], checked: true },
    ],
  },
  {
    id: 'floresiensis',
    name: 'Homo floresiensis',
    latin: 'Homo floresiensis ("hobbits")',
    label: [121.3, -8.5],
    lastKa: { central: 50, early: 60, late: 50 },
    note: 'About a metre tall, on the island of Flores. Whether they met modern humans is unknown.',
    source: 'Sutikna et al. 2016 Nature 532:366 (bones ~100-60 ka, tools ~190-50 ka).',
    doi: ['10.1038/nature17179'],
    checked: true,
    sites: [
      { name: 'Liang Bua, Flores', position: [120.46, -8.534], ka: [100, 60], find: 'Skeletons of small-bodied people; their stone tools continue to ~50 ka', source: 'Sutikna et al. 2016 Nature 532:366', doi: ['10.1038/nature17179'], checked: true },
    ],
  },
  {
    id: 'luzonensis',
    name: 'Homo luzonensis',
    latin: 'Homo luzonensis',
    label: [121.2, 16.6],
    lastKa: { central: 50, early: 50, late: 45 },
    note: 'Known from a few teeth and bones on Luzon. The fossils are at least 50,000 years old; how long they lasted after that is unknown.',
    source: 'Détroit et al. 2019 Nature 568:181 (minimum ages 50 and 67 ka).',
    doi: ['10.1038/s41586-019-1067-9'],
    checked: false,
    couldNotVerify: 'Only minimum ages exist (at least 50 and 67 ka), so there is no last-appearance date: the 50-45 ka fade is a modelling choice. A 2023 review (Grün & Stringer, doi:10.1016/j.quascirev.2023.108379) suggests the fossils may be much older.',
    sites: [
      { name: 'Callao Cave, Luzon', position: [121.824, 17.703], ka: [67, 50], minimum: true, find: 'Teeth, finger and foot bones of at least three people', source: 'Détroit et al. 2019 Nature 568:181 (U-series minimum 67 ka for the foot bone CCH1, 50 ka for the tooth CCH6-a); Mijares et al. 2010 J Hum Evol 59:123 (66.7 ± 1 ka)', doi: ['10.1038/s41586-019-1067-9', '10.1016/j.jhevol.2010.04.008'], checked: true },
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
