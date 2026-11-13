export interface Moment {
  /** Slider year (negative = BCE). */
  year: number;
  label: string;
  note: string;
  source: string;
}

/** Named moments marked on the overview strip. Dates are approximate and contested; edit freely. */
export const MOMENTS: Moment[] = [
  { year: -71975, label: 'Toba', note: 'Supereruption in Sumatra; how much it cut human numbers is debated.', source: 'Williams 2012, Quaternary International' },
  { year: -49975, label: 'Out of Africa', note: 'Main dispersal of the ancestors of living non-Africans.', source: 'Bergström et al. 2021, Nature' },
  { year: -47975, label: 'Sahul', note: 'First people reach Australia–New Guinea, crossing open sea.', source: "O'Connell et al. 2018, PNAS" },
  { year: -37975, label: 'Neanderthals end', note: 'Last Neanderthal sites date to about 40 ka.', source: 'Higham et al. 2014, Nature' },
  { year: -18975, label: 'Glacial maximum', note: 'Ice sheets at their peak; sea about 120 m lower, coasts far out.', source: 'Clark et al. 2009, Science' },
  { year: -13975, label: 'Americas', note: 'People in the Americas by about 16 ka; White Sands footprints may be 21–23 ka.', source: 'Bennett et al. 2021, Science' },
  { year: -10875, label: 'Younger Dryas', note: 'Sudden cold snap lasting about 1,200 years.', source: 'Rasmussen et al. 2006, JGR' },
  { year: -8975, label: 'First farming', note: 'Crops and herds begin in the Fertile Crescent.', source: 'Zeder 2011, Current Anthropology' },
];
