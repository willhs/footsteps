// Islands HYDE peoples before anyone reached them. HYDE 3.5 spreads each modern country's estimated people over its land at every
// date, so it has people on Iceland from 10,000 BCE, on Galápagos before 1535, on the Canaries, Madagascar, Hawaii and the
// Caribbean before their first settlers (checked on the served grid images, 2026-11-28). Before an island's first settlement
// its cells are left empty (components/footsteps/hooks/gridData.ts); after it, HYDE's people stand.
//
// Boxes are drawn tight round the islands so no mainland coast falls inside one. `year` is the first HYDE year that keeps
// people: a calendar year (negative = BCE) at or after the first dated settlement, rounded to the HYDE years.

export type FirstSettlement = {
  name: string;
  /** [west, east, south, north], degrees. */
  box: readonly [number, number, number, number];
  /** First calendar year with people; HYDE's cells in the box are emptied before it. */
  year: number;
  source: string;
};

export const FIRST_SETTLEMENTS: readonly FirstSettlement[] = [
  { name: 'Iceland', box: [-25, -13, 63, 67], year: 874, source: 'Norse settlement ~870s CE (Landnámabók; the 871±2 tephra under the first farms). Earlier Irish monks are possible but undated.' },
  { name: 'Faroe Islands', box: [-8, -6, 61, 63], year: 500, source: 'Sheep DNA and fecal biomarkers in lake sediment from ~500 CE, before the Norse (Curtin et al. 2021, Commun Earth Environ 2:253).' },
  { name: 'Svalbard', box: [10, 30, 76, 81], year: 1600, source: 'Found by Barentsz in 1596; no people lived there before European whalers.' },
  { name: 'Galápagos', box: [-92, -89, -1.6, 0.8], year: 1600, source: 'Found by Tomás de Berlanga in 1535; no sign of earlier people (Heyerdahl\'s claimed pre-Columbian sherds are not accepted).' },
  { name: 'Falkland Islands', box: [-62, -57, -53, -51], year: 1764, source: 'First settled by the French at Port Louis, 1764; no securely dated earlier occupation.' },
  { name: 'Hawaii', box: [-161, -154, 18, 23], year: 1200, source: 'East Polynesia settled in one pulse ~1190-1290 CE (Wilmshurst et al. 2011, PNAS 108:1815).' },
  { name: 'Madagascar and Comoros', box: [43, 51, -26, -11], year: 400, source: 'Settlement in the first millennium CE (the arrival table\'s central 2.3 ka BP, prehistory/arrivals.yaml); earlier forager traces (Dewar et al. 2013, ~4 ka) are debated.' },
  { name: 'Canary Islands', box: [-18.5, -13.35, 27.5, 29.5], year: -500, source: 'First settlers from North Africa in the first millennium BCE (radiocarbon, e.g. Velasco-Vázquez et al. 2021, the earliest secure ~500 BCE-0 CE).' },
  { name: 'Greater Antilles', box: [-85, -60, 17.5, 24], year: -3800, source: 'First settlement ~5.8 ka BP (the arrival table\'s Caribbean central; Napolitano et al. 2019, Sci Adv 5:eaar7806).' },
  { name: 'Bahamas', box: [-79.3, -72, 21, 27.5], year: 700, source: 'Lucayan settlement from ~700 CE (Berman & Gnivecki 1995).' },
  { name: 'Lesser Antilles', box: [-63, -59, 12.8, 17.5], year: -3800, source: 'Archaic settlers from ~5 ka BP at the earliest; held to the Caribbean date so no real occupation is cut.' },
];

/** Places people left for a while: the ice-age north of Europe. The pre-HYDE model (prehistory_population.py) thins west
 * Europe's people to half at the glacial maximum but still has bands right up to the ice in Denmark, north Germany and Britain;
 * the dated record has nobody there. Modelled years in the window are left empty here. */
export type Abandonment = { name: string; box: readonly [number, number, number, number]; from: number; to: number; source: string };

export const ABANDONMENTS: readonly Abandonment[] = [
  {
    name: 'Britain and Ireland at the glacial maximum',
    box: [-11, 2, 49.9, 61],
    from: -24000,
    to: -13000,
    source: 'No human presence in Britain between ~25 and ~15 ka cal BP; recolonised from ~14.7 ka (Jacobi & Higham 2011; Pettitt & White 2012, The British Palaeolithic).',
  },
  {
    name: 'The north European plain at the glacial maximum',
    box: [2, 20, 52, 58],
    from: -23000,
    to: -14000,
    source: 'North of ~52°N between the Rhine and the Vistula, no sites from ~25 to ~16 ka cal BP; Magdalenian and Hamburgian recolonisation from ~16-15 ka (Maier et al. 2016, Quat Int 425:49; Grimm et al. 2020).',
  },
];

/** Why nobody should be at a point in a year: before its first settlers, or in a window when the region was left, else null. */
export function unsettledAt(lon: number, lat: number, year: number): FirstSettlement | Abandonment | null {
  for (const s of FIRST_SETTLEMENTS) {
    if (year >= s.year) continue;
    const [w, e, south, north] = s.box;
    if (lon >= w && lon <= e && lat >= south && lat <= north) return s;
  }
  for (const a of ABANDONMENTS) {
    if (year < a.from || year >= a.to) continue;
    const [w, e, south, north] = a.box;
    if (lon >= w && lon <= e && lat >= south && lat <= north) return a;
  }
  return null;
}

/** The latest first settlement: years from it on need no check. */
export const LAST_FIRST_SETTLEMENT = Math.max(...FIRST_SETTLEMENTS.map((s) => s.year), ...ABANDONMENTS.map((a) => a.to));
